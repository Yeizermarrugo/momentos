import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_SESSION_COOKIE,
  GUEST_SESSION_COOKIE,
  GUEST_SESSION_MAX_AGE,
  createGuestSessionToken,
  verifyAdminSessionToken,
  verifyGuestSessionToken,
} from "@/lib/auth";
import { getDb } from "@/db";
import { guests } from "@/db/schema";
import { eq } from "drizzle-orm";

// Solo desde server actions (setear cookies no está permitido al renderizar).
export async function startGuestSession(guestId: number) {
  const jar = await cookies();
  jar.set(GUEST_SESSION_COOKIE, createGuestSessionToken(guestId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: GUEST_SESSION_MAX_AGE,
    path: "/",
  });
}

export async function getGuestId(): Promise<number | null> {
  const jar = await cookies();
  const token = jar.get(GUEST_SESSION_COOKIE)?.value;
  return verifyGuestSessionToken(token);
}

export async function getCurrentGuest() {
  const guestId = await getGuestId();
  if (!guestId) return null;
  const db = getDb();
  const [guest] = await db.select().from(guests).where(eq(guests.id, guestId)).limit(1);
  return guest ?? null;
}

export async function requireGuest() {
  const guest = await getCurrentGuest();
  if (!guest) redirect("/login");
  return guest;
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(ADMIN_SESSION_COOKIE)?.value;
  return verifyAdminSessionToken(token);
}

export async function requireAdmin() {
  const ok = await isAdmin();
  if (!ok) redirect("/admin/login");
}
