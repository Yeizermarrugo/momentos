"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { guests } from "@/db/schema";
import { checkInvitation } from "@/lib/invitations";
import {
  createGuestSessionToken,
  createAdminSessionToken,
  checkAdminPassword,
  hashPassword,
  verifyPassword,
  GUEST_SESSION_COOKIE,
  GUEST_SESSION_MAX_AGE,
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
} from "@/lib/auth";
import { isRateLimited, recordFailedAttempt, clearAttempts } from "@/lib/rate-limit";

const MIN_PASSWORD_LENGTH = 4;

export type CodeCheckResult =
  | { valid: false; error: string }
  | {
      valid: true;
      seats: number;
      guestName1: string;
      guestName2: string | null;
      seatsWithPassword: number[];
    };

const STATUS_MESSAGE: Record<string, string> = {
  not_found: "Código no encontrado. Revisá tu invitación.",
  declined: "Esta invitación marcó que no podía asistir — no tiene acceso a Momentos.",
  pending: "Todavía no confirmaste tu asistencia en la invitación. Confirmá primero y volvé.",
};

export async function checkInvitationCode(code: string): Promise<CodeCheckResult> {
  const trimmed = code.trim();
  if (!trimmed) return { valid: false, error: "Escribí tu código de invitación." };

  try {
    const result = await checkInvitation(trimmed);
    if (result.status !== "ok") {
      return { valid: false, error: STATUS_MESSAGE[result.status] };
    }
    return {
      valid: true,
      seats: result.seats,
      guestName1: result.guestName1,
      guestName2: result.guestName2,
      seatsWithPassword: result.seatsWithPassword,
    };
  } catch {
    return { valid: false, error: "No pudimos validar el código. Intentá de nuevo en un momento." };
  }
}

async function startGuestSession(guestId: number) {
  const jar = await cookies();
  jar.set(GUEST_SESSION_COOKIE, createGuestSessionToken(guestId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: GUEST_SESSION_MAX_AGE,
    path: "/",
  });
}

// Primera vez de este invitado (o fila legacy sin contraseña todavía):
// crea/actualiza su contraseña. Si ya tiene una seteada, hay que usar
// loginGuest en su lugar.
export async function registerGuest(
  code: string,
  seatIndex: 1 | 2,
  name: string,
  password: string,
  confirmPassword: string
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = code.trim();

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }
  if (password !== confirmPassword) {
    return { ok: false, error: "Las contraseñas no coinciden." };
  }

  // Revalida server-side — no confiar en lo que ya mostró el cliente
  // (confirmación RSVP, cupo, código válido).
  const result = await checkInvitation(trimmed);
  if (result.status !== "ok") {
    return { ok: false, error: STATUS_MESSAGE[result.status] };
  }
  if (result.seatsWithPassword.includes(seatIndex)) {
    return { ok: false, error: "Ese invitado ya tiene contraseña. Iniciá sesión." };
  }
  const isRelogin = result.takenSeatIndexes.includes(seatIndex);
  if (!isRelogin && result.takenSeatIndexes.length >= result.maxAllowed) {
    return { ok: false, error: "Ya se registraron todas las personas confirmadas de esta invitación." };
  }

  const db = getDb();
  const [guest] = await db
    .insert(guests)
    .values({ invitationCode: trimmed, seatIndex, name, passwordHash: hashPassword(password) })
    .onConflictDoUpdate({
      target: [guests.invitationCode, guests.seatIndex],
      set: { name, passwordHash: hashPassword(password) },
    })
    .returning();

  await startGuestSession(guest.id);
  redirect("/");
}

// Invitado que ya tiene contraseña seteada — solo valida y abre sesión.
export async function loginGuest(
  code: string,
  seatIndex: 1 | 2,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = code.trim();
  const rateLimitKey = `${trimmed}.${seatIndex}`;

  if (isRateLimited(rateLimitKey)) {
    return { ok: false, error: "Demasiados intentos. Probá de nuevo en unos minutos." };
  }

  const db = getDb();
  const [guest] = await db
    .select()
    .from(guests)
    .where(and(eq(guests.invitationCode, trimmed), eq(guests.seatIndex, seatIndex)))
    .limit(1);

  if (!guest || !verifyPassword(password, guest.passwordHash)) {
    recordFailedAttempt(rateLimitKey);
    return { ok: false, error: "Contraseña incorrecta." };
  }

  clearAttempts(rateLimitKey);
  await startGuestSession(guest.id);
  redirect("/");
}

export async function logoutGuest() {
  const jar = await cookies();
  jar.delete(GUEST_SESSION_COOKIE);
  redirect("/login");
}

export async function adminLogin(password: string): Promise<{ ok: boolean; error?: string }> {
  // Por IP, no global — una key única dejaría que cualquiera bloquee al admin
  // real fallando 8 veces. En Vercel x-forwarded-for lo pone la plataforma.
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateLimitKey = `admin.${ip}`;

  if (isRateLimited(rateLimitKey)) {
    return { ok: false, error: "Demasiados intentos. Probá de nuevo en unos minutos." };
  }

  if (!checkAdminPassword(password)) {
    recordFailedAttempt(rateLimitKey);
    return { ok: false, error: "Contraseña incorrecta." };
  }

  clearAttempts(rateLimitKey);
  const jar = await cookies();
  jar.set(ADMIN_SESSION_COOKIE, createAdminSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ADMIN_SESSION_MAX_AGE,
    path: "/",
  });
  return { ok: true };
}

export async function adminLogout() {
  const jar = await cookies();
  jar.delete(ADMIN_SESSION_COOKIE);
  redirect("/admin/login");
}
