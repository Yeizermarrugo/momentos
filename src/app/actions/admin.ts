"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { guests, photos, posts, winners } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { deleteObject } from "@/lib/media-storage";

export async function markWinner(category: "romantica" | "divertida", photoId: number) {
  await requireAdmin();
  const db = getDb();

  await db
    .insert(winners)
    .values({ category, photoId })
    .onConflictDoUpdate({
      target: winners.category,
      set: { photoId, markedAt: new Date() },
    });

  revalidatePath("/admin");
}

export async function unmarkWinner(category: "romantica" | "divertida") {
  await requireAdmin();
  const db = getDb();

  await db.delete(winners).where(eq(winners.category, category));

  revalidatePath("/admin");
}

// "Olvidé mi contraseña": no hay email/teléfono para un flujo self-service
// (ver auth.ts), así que la recuperación es el admin reseteando acá — el
// invitado vuelve a pasar por "crear contraseña" en su próximo login (ver
// seatsWithPassword en checkInvitationCode).
export async function adminResetGuestPassword(guestId: number) {
  await requireAdmin();
  const db = getDb();
  await db.update(guests).set({ passwordHash: null }).where(eq(guests.id, guestId));
  revalidatePath("/admin");
}

export async function adminDeletePhoto(photoId: number) {
  await requireAdmin();
  const db = getDb();

  const [row] = await db
    .select({ s3Key: photos.s3Key, postId: photos.postId })
    .from(photos)
    .where(eq(photos.id, photoId))
    .limit(1);
  if (!row) return;

  await db.delete(photos).where(eq(photos.id, photoId));

  const remaining = await db.select({ id: photos.id }).from(photos).where(eq(photos.postId, row.postId)).limit(1);
  if (remaining.length === 0) {
    await db.delete(posts).where(eq(posts.id, row.postId));
  }

  await deleteObject(row.s3Key).catch(() => {});

  revalidatePath("/admin");
  revalidatePath("/");
}
