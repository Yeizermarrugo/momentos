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

  const publicUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
  return { uploadUrl, publicUrl, key };
}

export async function deleteObject(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
