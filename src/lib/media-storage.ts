import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
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

const UPLOAD_URL_TTL_SECONDS = 5 * 60;
const CACHE_CONTROL = "public, max-age=31536000, immutable";

// El navegador comprime a WebP antes de pedir esta URL (no hay servidor en
// el camino de los bytes — Vercel solo firma), así que el Content-Type
// siempre es fijo.
const CONTENT_TYPE = "image/webp";

export type UploadCategory = "romantica" | "divertida" | "general";

// Subida directa navegador→S3: evita el límite de body de las funciones de
// Vercel y no gasta cómputo del servidor por cada foto. El servidor solo
// firma la URL; el PUT real lo hace el cliente.
export async function createUploadUrl(category: UploadCategory, guestId: number) {
  const key = `${category}/${guestId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: CONTENT_TYPE,
      CacheControl: CACHE_CONTROL,
    }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS }
  );

  return { uploadUrl, publicUrl: publicUrlForKey(key), key };
}

export function publicUrlForKey(key: string) {
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

// El cliente devuelve los keys que firmó createUploadUrl — validar que sean
// de este invitado y esta categoría, así no puede publicar el archivo de otro
// (y después borrárselo de S3 al borrar su propio post).
export function isOwnUploadKey(key: string, category: UploadCategory, guestId: number) {
  return new RegExp(`^${category}/${guestId}-\\d+-[a-z0-9]{1,6}\\.webp$`).test(key);
}

export async function deleteObject(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
