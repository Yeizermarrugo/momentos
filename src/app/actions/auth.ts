"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { guests } from "@/db/schema";
import { checkInvitation } from "@/lib/invitations";
import { startGuestSession } from "@/lib/session";
import { normalizeEmail } from "@/lib/email";
import { isEmailTaken } from "@/lib/queries";
import {
  MIN_PASSWORD_LENGTH,
  createAdminSessionToken,
  checkAdminPassword,
  hashPassword,
  verifyPassword,
  GUEST_SESSION_COOKIE,
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
} from "@/lib/auth";
import { isRateLimited, recordFailedAttempt, clearAttempts } from "@/lib/rate-limit";

export type CodeCheckResult =
  | { valid: false; error: string }
  | {
      valid: true;
      seats: number;
      guestName1: string;
      guestName2: string | null;
      seatsWithPassword: number[];
      seatsWithEmail: number[];
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
      seatsWithEmail: result.seatsWithEmail,
    };
  } catch {
    return { valid: false, error: "No pudimos validar el código. Intentá de nuevo en un momento." };
  }
}

// Solo rutas internas — un `next` arbitrario sería un open redirect
// (link de phishing "momentos.../login?next=https://otro-sitio").
function safeNext(next: string | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

const EMAIL_TAKEN = "Ese correo ya está en uso por otra cuenta. Cada persona necesita su propio correo.";

// Crear cuenta: el código es obligatorio acá — controla el cupo (cada
// invitación es de 1 o 2 personas, tope `rsvp_attendees`). También sirve
// para una fila sin contraseña (reset del admin): vuelve a crearla.
// Si ya tiene contraseña, hay que usar loginGuest (o linkLegacyGuest si le
// falta el correo).
export async function registerGuest(
  code: string,
  seatIndex: 1 | 2,
  name: string,
  password: string,
  confirmPassword: string,
  email: string,
  next?: string
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = code.trim();

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return { ok: false, error: "Escribí un correo válido — es con lo que vas a iniciar sesión." };
  }

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
    return { ok: false, error: "Esa persona ya tiene cuenta. Iniciá sesión con tu correo." };
  }
  const isRelogin = result.takenSeatIndexes.includes(seatIndex);
  if (!isRelogin && result.takenSeatIndexes.length >= result.maxAllowed) {
    return { ok: false, error: "Ya se registraron todas las personas confirmadas de esta invitación." };
  }

  const db = getDb();
  const [existing] = await db
    .select({ id: guests.id })
    .from(guests)
    .where(and(eq(guests.invitationCode, trimmed), eq(guests.seatIndex, seatIndex)))
    .limit(1);
  if (await isEmailTaken(normalizedEmail, existing?.id)) {
    return { ok: false, error: EMAIL_TAKEN };
  }

  let guestId: number;
  try {
    const [guest] = await db
      .insert(guests)
      .values({
        invitationCode: trimmed,
        seatIndex,
        name,
        email: normalizedEmail,
        passwordHash: hashPassword(password),
      })
      .onConflictDoUpdate({
        target: [guests.invitationCode, guests.seatIndex],
        set: { name, email: normalizedEmail, passwordHash: hashPassword(password) },
      })
      .returning();
    guestId = guest.id;
  } catch {
    // Carrera contra el constraint guests_email_unique.
    return { ok: false, error: EMAIL_TAKEN };
  }

  await startGuestSession(guestId);
  redirect(safeNext(next));
}

// Login normal: correo + contraseña.
export async function loginGuest(
  email: string,
  password: string,
  next?: string
): Promise<{ ok: boolean; error?: string }> {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !password) {
    return { ok: false, error: "Correo o contraseña incorrectos." };
  }
  const rateLimitKey = `login.${normalizedEmail}`;

  if (isRateLimited(rateLimitKey)) {
    return { ok: false, error: "Demasiados intentos. Probá de nuevo en unos minutos." };
  }

  const db = getDb();
  const [guest] = await db.select().from(guests).where(eq(guests.email, normalizedEmail)).limit(1);

  // Mismo mensaje si el correo no existe — no revela quién tiene cuenta.
  if (!guest || !verifyPassword(password, guest.passwordHash)) {
    recordFailedAttempt(rateLimitKey);
    return { ok: false, error: "Correo o contraseña incorrectos." };
  }

  clearAttempts(rateLimitKey);
  await startGuestSession(guest.id);
  redirect(safeNext(next));
}

// Invitado registrado antes de que el login fuera por correo: tiene
// contraseña pero no correo. Entra por "Crear cuenta" con su código, elige
// quién es, y confirma con su contraseña actual + el correo a vincular.
export async function linkLegacyGuest(
  code: string,
  seatIndex: 1 | 2,
  password: string,
  email: string,
  next?: string
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = code.trim();
  const rateLimitKey = `${trimmed}.${seatIndex}`;

  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return { ok: false, error: "Escribí un correo válido — es con lo que vas a iniciar sesión." };
  }

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

  if (guest.email) {
    return { ok: false, error: "Esa persona ya tiene correo vinculado. Iniciá sesión con tu correo." };
  }
  if (await isEmailTaken(normalizedEmail, guest.id)) {
    return { ok: false, error: EMAIL_TAKEN };
  }

  try {
    await db.update(guests).set({ email: normalizedEmail }).where(eq(guests.id, guest.id));
  } catch {
    return { ok: false, error: EMAIL_TAKEN };
  }

  await startGuestSession(guest.id);
  redirect(safeNext(next));
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
