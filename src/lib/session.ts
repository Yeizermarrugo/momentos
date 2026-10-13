import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_SESSION_COOKIE,
  GUEST_SESSION_COOKIE,
  verifyAdminSessionToken,
  verifyGuestSessionToken,
} from "@/lib/auth";
import { getDb } from "@/db";
import { guests } from "@/db/schema";
import { eq } from "drizzle-orm";

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
