import imageCompression from "browser-image-compression";
import { toast } from "sonner";
import { signUploads, createPost } from "@/app/actions/posts";
import type { UploadCategory, PhotoUploadSlot } from "@/lib/media-storage";

// Cola de subidas del navegador — vive a nivel de módulo (no en un
// componente), así sigue subiendo aunque el invitado navegue a otra pantalla
// de la app, incluso /foto/[id] que está fuera del layout de invitado. Solo
// se pierde si se cierra/recarga la pestaña (ver beforeunload + aviso).
//
// Flujo tipo Instagram: se suben display + miniatura + ORIGINAL y recién
// cuando las 3 versiones de todas las fotos llegaron a S3 se crea el post —
// nunca aparece en el feed una publicación sin su original.

// Display: lo que se ve en feed/detalle. JPEG y no WebP: Safari/iOS no
// codifica WebP en canvas (devuelve PNG y la librería achica la foto hasta
// que entra en maxSizeMB). 2048px es más que lo que muestra cualquier
// pantalla de celular a ancho completo.
const DISPLAY_OPTIONS = {
  maxWidthOrHeight: 2048,
  maxSizeMB: 1.5,
  initialQuality: 0.85,
  fileType: "image/jpeg",
  useWebWorker: true,
};

// Miniatura para grids (perfil 3 columnas, admin) — 640px cubre un tile de
// ~210px css en pantallas 3x.
const THUMB_OPTIONS = {
  maxWidthOrHeight: 640,
  maxSizeMB: 0.15,
  initialQuality: 0.8,
  fileType: "image/jpeg",
  useWebWorker: true,
};

// Mismos formatos que acepta el servidor (ORIGINAL_EXT_BY_TYPE en
// media-storage.ts). iOS a veces entrega HEIC con `type` vacío — se deduce
// por extensión.
const ORIGINAL_TYPE_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  heic: "image/heic",
  heif: "image/heif",
  png: "image/png",
  webp: "image/webp",
};
const SUPPORTED_TYPES = new Set(Object.values(ORIGINAL_TYPE_BY_EXT));

const MAX_ATTEMPTS = 3;
const PARALLEL_UPLOADS = 3;

export type PreparedPhoto = {
  id: string;
  original: File;
  originalType: string;
  display: Blob;
  thumb: Blob;
  previewUrl: string;
};

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const originalType = SUPPORTED_TYPES.has(file.type) ? file.type : ORIGINAL_TYPE_BY_EXT[ext];
  if (!originalType) throw new Error("unsupported");

  const display = await imageCompression(file, DISPLAY_OPTIONS);
  const thumb = await imageCompression(new File([display], "display.jpg", { type: "image/jpeg" }), THUMB_OPTIONS);

  return {
    id: crypto.randomUUID(),
    original: file,
    originalType,
    display,
    thumb,
    previewUrl: URL.createObjectURL(thumb),
  };
}

type PieceKind = "display" | "thumb" | "original";

type Piece = { photo: number; kind: PieceKind; blob: Blob; loaded: number; done: boolean };

type Job = {
  id: string;
  category: UploadCategory;
  caption: string;
  photos: PreparedPhoto[];
  // Se completan con la primera firma y se reusan en reintentos — así un
  // corte de red no obliga a re-subir lo que ya llegó a S3.
  slots: { base: string; originalExt: string }[] | null;
  pieces: Piece[];
  status: "queued" | "uploading" | "publishing" | "error";
};

export type UploadJobView = {
  id: string;
  photoCount: number;
  previewUrl: string;
  status: Job["status"];
  progress: number;
};

let jobs: Job[] = [];
let snapshot: UploadJobView[] = [];
let running = false;
const listeners = new Set<() => void>();
const doneListeners = new Set<() => void>();

function emit() {
  snapshot = jobs.map((j) => {
    const total = j.pieces.reduce((sum, p) => sum + p.blob.size, 0);
    const loaded = j.pieces.reduce((sum, p) => sum + (p.done ? p.blob.size : p.loaded), 0);
    return {
      id: j.id,
      photoCount: j.photos.length,
      previewUrl: j.photos[0].previewUrl,
      status: j.status,
      progress: total ? loaded / total : 0,
    };
  });
  listeners.forEach((l) => l());
  syncWakeLock();
}

export function subscribeUploads(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getUploadsSnapshot() {
  return snapshot;
}

const EMPTY: UploadJobView[] = [];
export function getServerUploadsSnapshot() {
  return EMPTY;
}

// Para que la UI refresque el feed (router.refresh) cuando un post termina.
export function onUploadDone(listener: () => void) {
  doneListeners.add(listener);
  return () => {
    doneListeners.delete(listener);
  };
}

export function hasActiveUploads() {
  return jobs.length > 0;
}

export function enqueueUpload(category: UploadCategory, caption: string, photos: PreparedPhoto[]) {
  jobs.push({
    id: crypto.randomUUID(),
    category,
    caption,
    photos,
    slots: null,
    pieces: photos.flatMap((p, i) => [
      { photo: i, kind: "thumb" as const, blob: p.thumb, loaded: 0, done: false },
      { photo: i, kind: "display" as const, blob: p.display, loaded: 0, done: false },
      { photo: i, kind: "original" as const, blob: p.original, loaded: 0, done: false },
    ]),
    status: "queued",
  });
  emit();
  void run();
}

export function retryUpload(id: string) {
  const job = jobs.find((j) => j.id === id);
  if (!job || job.status !== "error") return;
  job.status = "queued";
  emit();
  void run();
}

export function discardUpload(id: string) {
  const job = jobs.find((j) => j.id === id);
  if (!job || job.status !== "error") return;
  finish(job);
}

function finish(job: Job) {
  job.photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
  jobs = jobs.filter((j) => j !== job);
  emit();
}

// Un post a la vez — los siguientes esperan en cola. Así el ancho de banda
// (wifi del salón / datos) se concentra y cada publicación termina antes.
async function run() {
  if (running) return;
  running = true;
  try {
    let job: Job | undefined;
    while ((job = jobs.find((j) => j.status === "queued"))) {
      await processJob(job);
    }
  } finally {
    running = false;
  }
}

async function processJob(job: Job) {
  job.status = "uploading";
  emit();

  try {
    // Se re-firma en cada intento: las URLs vencen (15 min) y un reintento
    // puede llegar mucho después.
    const signed: PhotoUploadSlot[] = await signUploads(
      job.category,
      job.photos.map((p, i) => ({ base: job.slots?.[i].base, originalType: p.originalType }))
    );
    job.slots = signed.map((s) => ({ base: s.base, originalExt: s.originalExt }));

    const pending = job.pieces.filter((p) => !p.done);
    let next = 0;
    async function worker() {
      while (next < pending.length) {
        const piece = pending[next++];
        const target = signed[piece.photo][piece.kind];
        await putWithRetry(target.url, target.contentType, piece);
      }
    }
    await Promise.all(Array.from({ length: PARALLEL_UPLOADS }, worker));

    job.status = "publishing";
    emit();
    await createPost(job.category, job.slots, job.caption);

    finish(job);
    toast.success(job.photos.length > 1 ? "¡Tus fotos se publicaron con éxito!" : "¡Tu foto se publicó con éxito!");
    doneListeners.forEach((l) => l());
  } catch (err) {
    console.error("upload failed", err);
    job.status = "error";
    emit();
  }
}

async function putWithRetry(url: string, contentType: string, piece: Piece) {
  for (let attempt = 1; ; attempt++) {
    try {
      await put(url, contentType, piece);
      piece.done = true;
      emit();
      return;
    } catch (err) {
      piece.loaded = 0;
      emit();
      if (attempt >= MAX_ATTEMPTS) throw err;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

// XHR y no fetch: fetch no expone progreso de subida — XHR sí
// (`upload.onprogress`), que es lo que alimenta la barra con bytes reales.
function put(url: string, contentType: string, piece: Piece) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      piece.loaded = e.loaded;
      emit();
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`S3 respondió ${xhr.status}`));
    xhr.onerror = () => reject(new Error("Error de red"));
    xhr.onabort = () => reject(new Error("Subida cancelada"));
    xhr.send(piece.blob);
  });
}

// Mantener la pantalla encendida mientras sube — si el iPhone se bloquea,
// Safari congela la pestaña y la subida se corta.
let wakeLock: WakeLockSentinel | null = null;

function syncWakeLock() {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
  if (jobs.length > 0 && !wakeLock && document.visibilityState === "visible") {
    navigator.wakeLock
      .request("screen")
      .then((lock) => {
        wakeLock = lock;
        lock.addEventListener("release", () => {
          if (wakeLock === lock) wakeLock = null;
        });
      })
      .catch(() => {});
  } else if (jobs.length === 0 && wakeLock) {
    void wakeLock.release();
    wakeLock = null;
  }
}

if (typeof window !== "undefined") {
  // El wake lock se suelta solo al cambiar de app — se pide de nuevo al volver.
  document.addEventListener("visibilitychange", syncWakeLock);
  window.addEventListener("beforeunload", (e) => {
    if (hasActiveUploads()) e.preventDefault();
  });
}
