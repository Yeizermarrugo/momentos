import { randomBytes } from "crypto";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const BUCKET = process.env.AWS_MEDIA_BUCKET_NAME!;
const REGION = process.env.AWS_MEDIA_REGION!;

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_MEDIA_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_MEDIA_SECRET_ACCESS_KEY!,
  },
});

const UPLOAD_URL_TTL_SECONDS = 15 * 60;
const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;
const CACHE_CONTROL = "public, max-age=31536000, immutable";

// Display y miniatura las genera el navegador en JPEG (no WebP: Safari/iOS
// no sabe codificar WebP en canvas — devuelve PNG y la librería termina
// achicando la foto para que entre en el tamaño máximo).
const DERIVED_CONTENT_TYPE = "image/jpeg";

// Originales: lo que entregue el celular. iOS con accept="image/*" entrega
// JPEG a resolución completa; HEIC/PNG/WebP por si alguien sube desde otra
// fuente. Cualquier otra cosa se rechaza.
const ORIGINAL_EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/png": "png",
  "image/webp": "webp",
};
const ORIGINAL_TYPE_BY_EXT = Object.fromEntries(
  Object.entries(ORIGINAL_EXT_BY_TYPE).map(([type, ext]) => [ext, type])
);

export type UploadCategory = "romantica" | "divertida" | "general";

// Cada foto subida es un "base" (`romantica/12-1760380000000-<16 hex>`) del
// que salen las 3 keys — el cliente solo devuelve el base, el servidor
// deriva las keys y las URLs, así no puede apuntar a archivos ajenos.
export function photoKeys(base: string, originalExt: string) {
  return {
    displayKey: `${base}.jpg`,
    thumbKey: `${base}.thumb.jpg`,
    originalKey: `originals/${base}.${originalExt}`,
  };
}

export function publicUrlForKey(key: string) {
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

export function isOwnUploadBase(base: string, category: UploadCategory, guestId: number) {
  return new RegExp(`^${category}/${guestId}-\\d+-[a-f0-9]{16}$`).test(base);
}

export function originalExtForType(type: string): string | null {
  return ORIGINAL_EXT_BY_TYPE[type] ?? null;
}

export function isAllowedOriginalExt(ext: string) {
  return ext in ORIGINAL_TYPE_BY_EXT;
}

function signPut(key: string, contentType: string) {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType, CacheControl: CACHE_CONTROL }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS }
  );
}

export function newUploadBase(category: UploadCategory, guestId: number) {
  return `${category}/${guestId}-${Date.now()}-${randomBytes(8).toString("hex")}`;
}

// Subida directa navegador→S3: evita el límite de body de las funciones de
// Vercel y no gasta cómputo del servidor por cada foto. El servidor solo
// firma las URLs; los PUT reales los hace el cliente.
export async function signPhotoUploads(base: string, originalExt: string) {
  const keys = photoKeys(base, originalExt);
  const originalType = ORIGINAL_TYPE_BY_EXT[originalExt];
  const [display, thumb, original] = await Promise.all([
    signPut(keys.displayKey, DERIVED_CONTENT_TYPE),
    signPut(keys.thumbKey, DERIVED_CONTENT_TYPE),
    signPut(keys.originalKey, originalType),
  ]);
  return {
    base,
    originalExt,
    display: { url: display, contentType: DERIVED_CONTENT_TYPE },
    thumb: { url: thumb, contentType: DERIVED_CONTENT_TYPE },
    original: { url: original, contentType: originalType },
  };
}

export type PhotoUploadSlot = Awaited<ReturnType<typeof signPhotoUploads>>;

// El bucket es de lectura pública, pero un <a download> cross-origin se
// ignora — esta URL firmada fuerza la descarga con un nombre legible.
export function signDownload(key: string, filename: string) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${filename}"`,
    }),
    { expiresIn: DOWNLOAD_URL_TTL_SECONDS }
  );
}

export async function deleteObject(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

// Borra todas las versiones de una foto (display + miniatura + original).
// Best-effort: un archivo huérfano en S3 no rompe nada.
export async function deletePhotoObjects(photo: {
  s3Key: string;
  thumbKey: string | null;
  originalKey: string | null;
}) {
  const keys = [photo.s3Key, photo.thumbKey, photo.originalKey].filter((k): k is string => !!k);
  await Promise.all(keys.map((k) => deleteObject(k).catch(() => {})));
}
