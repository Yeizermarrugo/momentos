"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { enqueueUpload, preparePhoto, type PreparedPhoto } from "@/lib/upload-queue";
import { MAX_CAPTION_LENGTH } from "@/lib/format";
import type { UploadCategory } from "@/lib/media-storage";

const CATEGORIES: { value: UploadCategory; label: string }[] = [
  { value: "romantica", label: "Romántica" },
  { value: "divertida", label: "Divertida" },
  { value: "general", label: "General" },
];

const MAX_PHOTOS_PER_POST = 10;


export default function SubirPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<UploadCategory | null>(null);
  const [files, setFiles] = useState<PreparedPhoto[]>([]);
  const [caption, setCaption] = useState("");
  const [preparing, setPreparing] = useState(0);

  async function onFilesPicked(list: FileList | null) {
    if (!list || list.length === 0) return;
    const room = MAX_PHOTOS_PER_POST - files.length - preparing;
    if (room <= 0) {
      toast.error(`Máximo ${MAX_PHOTOS_PER_POST} fotos por publicación.`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    const picked = Array.from(list).slice(0, room);
    if (list.length > room) toast.error(`Máximo ${MAX_PHOTOS_PER_POST} fotos por publicación.`);
    if (inputRef.current) inputRef.current.value = "";

    // Una por una (no Promise.all): en iPhone cada foto de 12–48 MP ocupa
    // mucha memoria al decodificarla, en paralelo Safari puede matar la pestaña.
    setPreparing(picked.length);
    let failed = 0;
    for (const file of picked) {
      try {
        const prepared = await preparePhoto(file);
        setFiles((prev) => [...prev, prepared]);
      } catch (err) {
        console.error("prepare failed", err);
        failed++;
      }
      setPreparing((n) => n - 1);
    }
    if (failed > 0) {
      toast.error(
        failed === 1
          ? "No pudimos leer una de las fotos (formato no soportado)."
          : `No pudimos leer ${failed} fotos (formato no soportado).`
      );
    }
  }

  function removeFile(id: string) {
    setFiles((prev) => {
      const removed = prev.find((f) => f.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  }

  // La subida real sigue en segundo plano (lib/upload-queue.ts, barra de
  // progreso arriba) — el invitado puede seguir navegando o armar otra
  // publicación mientras tanto.
  function publish() {
    if (!category || files.length === 0 || preparing > 0) return;
    enqueueUpload(category, caption, files);
    router.push("/");
  }

  return (
    <div>
      <header className="px-4 pt-7 pb-4 text-center">
        <p className="font-script text-3xl text-wood leading-none">Y &amp; D</p>
        <p className="mt-1 text-[10px] tracking-[0.22em] uppercase text-muted-foreground">
          Nueva publicación
        </p>
      </header>

      <div className="px-4 space-y-5">
        <div>
          <h4 className="font-display text-[15px] font-bold mb-2">Categoría</h4>
          <div className="flex gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                onClick={() => setCategory(c.value)}
                className={cn(
                  "flex-1 rounded-xl border py-2.5 text-xs font-bold",
                  category === c.value
                    ? "bg-gold-deep border-gold-deep text-pearl"
                    : "border-border bg-card text-muted-foreground"
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h4 className="font-display text-[15px] font-bold mb-2">Fotos</h4>
          <button
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-gold bg-card py-7 text-center text-wood"
          >
            <Camera className="size-6" />
            <span className="text-[13px] font-bold">Toca para elegir fotos</span>
            <span className="text-[11.5px] font-medium text-muted-foreground">
              Podés elegir varias — se publican juntas en carrusel (máx. {MAX_PHOTOS_PER_POST})
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => onFilesPicked(e.target.files)}
          />

          {(files.length > 0 || preparing > 0) && (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {files.map((f) => (
                <div key={f.id} className="relative aspect-square overflow-hidden rounded-lg bg-beige">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.previewUrl} alt="" className="size-full object-cover" />
                  <button
                    onClick={() => removeFile(f.id)}
                    className="absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-black/60 text-white"
                  >
                    <X className="size-2.5" />
                  </button>
                </div>
              ))}
              {Array.from({ length: preparing }, (_, i) => (
                <div key={`preparing-${i}`} className="aspect-square animate-pulse rounded-lg bg-beige" />
              ))}
            </div>
          )}
          <p className="mt-2 text-[11.5px] text-muted-foreground">
            {files.length}/{MAX_PHOTOS_PER_POST} {files.length === 1 ? "foto seleccionada" : "fotos seleccionadas"}
          </p>
        </div>

        {files.length > 0 && (
          <div>
            <h4 className="font-display text-[15px] font-bold mb-2">Descripción</h4>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, MAX_CAPTION_LENGTH))}
              placeholder="Unas palabras bonitas (opcional)…"
              rows={2}
              className="w-full resize-none rounded-xl border border-border bg-card p-2.5 text-[13px] outline-none focus:border-gold"
            />
            <span className="mt-0.5 block text-right text-[10px] text-muted-foreground">
              {caption.length}/{MAX_CAPTION_LENGTH}
            </span>
          </div>
        )}

        <Button
          size="lg"
          className="w-full font-extrabold"
          disabled={!category || files.length === 0 || preparing > 0}
          onClick={publish}
        >
          {preparing > 0 ? "Preparando fotos…" : "Publicar"}
        </Button>
      </div>
    </div>
  );
}
