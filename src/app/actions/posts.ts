"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { posts, photos, reactions } from "@/db/schema";
import { requireGuest } from "@/lib/session";
import { createUploadUrl, deleteObject, type UploadCategory } from "@/lib/media-storage";
import { MAX_CAPTION_LENGTH } from "@/lib/format";

const MAX_PHOTOS_PER_POST = 10;

function sanitizeCaption(caption: string | undefined | null): string | null {
  if (!caption) return null;
  const trimmed = caption.trim().slice(0, MAX_CAPTION_LENGTH);
  return trimmed || null;
}

export async function requestUploadUrls(category: UploadCategory, count: number) {
  const guest = await requireGuest();
  const n = Math.min(Math.max(count, 1), MAX_PHOTOS_PER_POST);
  const slots = await Promise.all(
    Array.from({ length: n }, () => createUploadUrl(category, guest.id))
  );
  return slots;
}

export async function createPost(
  category: UploadCategory,
  uploaded: { key: string; publicUrl: string }[],
  caption?: string
) {
  const guest = await requireGuest();
  if (uploaded.length === 0) throw new Error("No hay fotos para publicar.");
  if (uploaded.length > MAX_PHOTOS_PER_POST) throw new Error("Demasiadas fotos en una publicación.");

  const db = getDb();
  const [post] = await db
    .insert(posts)
    .values({ guestId: guest.id, category, caption: sanitizeCaption(caption) })
    .returning();

  await db.insert(photos).values(
    uploaded.map((u, i) => ({
      postId: post.id,
      s3Key: u.key,
      url: u.publicUrl,
      position: i,
    }))
  );

  revalidatePath("/");
  revalidatePath("/perfil");
  return { postId: post.id };
}

export async function updateCaption(postId: number, caption: string) {
  const guest = await requireGuest();
  const db = getDb();

  const [row] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.guestId, guest.id)))
    .limit(1);

  if (!row) throw new Error("No podés editar esta publicación.");

  await db.update(posts).set({ caption: sanitizeCaption(caption) }).where(eq(posts.id, postId));

  revalidatePath("/");
  revalidatePath("/perfil");
}

export async function deleteOwnPhoto(photoId: number) {
  const guest = await requireGuest();
  const db = getDb();

  const [row] = await db
    .select({ photoId: photos.id, s3Key: photos.s3Key, postId: photos.postId, guestId: posts.guestId })
    .from(photos)
    .innerJoin(posts, eq(photos.postId, posts.id))
    .where(and(eq(photos.id, photoId), eq(posts.guestId, guest.id)))
    .limit(1);

  if (!row) throw new Error("No podés eliminar esta foto.");

  await db.delete(photos).where(eq(photos.id, photoId));

  const remaining = await db.select({ id: photos.id }).from(photos).where(eq(photos.postId, row.postId)).limit(1);
  if (remaining.length === 0) {
    await db.delete(posts).where(eq(posts.id, row.postId));
  }

  await deleteObject(row.s3Key).catch(() => {});

  revalidatePath("/");
  revalidatePath("/perfil");
}

// Borra la publicación entera (todas las fotos del carrusel) — usado desde
// el grid del perfil, donde cada tile representa una publicación.
export async function deleteOwnPost(postId: number) {
  const guest = await requireGuest();
  const db = getDb();

  const [post] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.guestId, guest.id)))
    .limit(1);
  if (!post) throw new Error("No podés eliminar esta publicación.");

  const photoRows = await db.select({ s3Key: photos.s3Key }).from(photos).where(eq(photos.postId, postId));
  await db.delete(photos).where(eq(photos.postId, postId));
  await db.delete(posts).where(eq(posts.id, postId));

  await Promise.all(photoRows.map((ph) => deleteObject(ph.s3Key).catch(() => {})));

  revalidatePath("/");
  revalidatePath("/perfil");
}

export async function toggleReaction(photoId: number, type: "love" | "fun" | "like") {
  const guest = await requireGuest();
  const db = getDb();

  const [existing] = await db
    .select()
    .from(reactions)
    .where(and(eq(reactions.photoId, photoId), eq(reactions.guestId, guest.id)))
    .limit(1);

  if (existing && existing.type === type) {
    await db.delete(reactions).where(eq(reactions.id, existing.id));
  } else if (existing) {
    await db.update(reactions).set({ type }).where(eq(reactions.id, existing.id));
  } else {
    await db.insert(reactions).values({ photoId, guestId: guest.id, type });
  }

  revalidatePath("/");
}
