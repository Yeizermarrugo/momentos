"use server";

import { createHash, randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { guests, passwordResets } from "@/db/schema";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/auth";
import { requireGuest, startGuestSession } from "@/lib/session";
import { appUrl, maskEmail, normalizeEmail, passwordResetEmail, sendEmail } from "@/lib/email";
import { isRateLimited, recordFailedAttempt } from "@/lib/rate-limit";

const RESET_TTL_MS = 60 * 60 * 1000;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// "Olvidé mi contraseña" desde el login: el invitado ya escribió su código y
// eligió quién es, así que no hace falta pedirle el correo — se manda al que
// registró. Devuelve el correo enmascarado para confirmar a dónde fue.
export async function requestPasswordReset(
  code: string,
  seatIndex: 1 | 2
): Promise<{ ok: true; maskedEmail: string } | { ok: false; error: string }> {
  const trimmed = code.trim();
  // Cada pedido cuenta (no solo los fallidos) — evita usar esto para
  // inundar de correos la casilla de alguien.
  const rateLimitKey = `reset.${trimmed}.${seatIndex}`;
  if (isRateLimited(rateLimitKey)) {
    return { ok: false, error: "Ya pediste varios correos. Probá de nuevo en unos minutos." };
  }
  recordFailedAttempt(rateLimitKey);

  const db = getDb();
  const [guest] = await db
    .select()
    .from(guests)
    .where(and(eq(guests.invitationCode, trimmed), eq(guests.seatIndex, seatIndex)))
    .limit(1);

  if (!guest?.email) {
    return {
      ok: false,
      error: "No tenés un correo registrado. Pedile al novio que te resetee la contraseña.",
    };
  }

  const token = randomBytes(32).toString("base64url");
  await db.insert(passwordResets).values({
    guestId: guest.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
  });

  try {
    await sendEmail({ to: guest.email, ...passwordResetEmail(guest.name, `${appUrl()}/recuperar/${token}`) });
  } catch (err) {
    console.error("reset email failed", err);
    return { ok: false, error: "No pudimos mandar el correo. Intentá de nuevo en un momento." };
  }

  return { ok: true, maskedEmail: maskEmail(guest.email) };
}

async function findValidReset(token: string) {
  const db = getDb();
  const [row] = await db
    .select({ id: passwordResets.id, guestId: passwordResets.guestId, name: guests.name })
    .from(passwordResets)
    .innerJoin(guests, eq(passwordResets.guestId, guests.id))
    .where(
      and(
        eq(passwordResets.tokenHash, hashToken(token)),
        isNull(passwordResets.usedAt),
        gt(passwordResets.expiresAt, new Date())
      )
    )
    .limit(1);
  return row ?? null;
}

// Para que /recuperar/[token] muestre "link vencido" antes de pedir la
// contraseña nueva, en vez de recién al enviar.
export async function getResetTokenGuestName(token: string): Promise<string | null> {
  return (await findValidReset(token))?.name ?? null;
}

export async function resetPassword(
  token: string,
  password: string,
  confirmPassword: string
): Promise<{ ok: boolean; error?: string }> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }
  if (password !== confirmPassword) {
    return { ok: false, error: "Las contraseñas no coinciden." };
  }

  const reset = await findValidReset(token);
  if (!reset) return { ok: false, error: "El link venció o ya se usó. Pedí uno nuevo desde el login." };

  const db = getDb();
  await db.update(guests).set({ passwordHash: hashPassword(password) }).where(eq(guests.id, reset.guestId));
  // Invalida este link y cualquier otro pendiente del mismo invitado.
  await db
    .update(passwordResets)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResets.guestId, reset.guestId), isNull(passwordResets.usedAt)));

  await startGuestSession(reset.guestId);
  redirect("/");
}

// Invitados registrados antes de que se pidiera correo — lo cargan desde el
// aviso en el feed (EmailPrompt).
export async function saveGuestEmail(email: string): Promise<{ ok: boolean; error?: string }> {
  const guest = await requireGuest();
  const normalized = normalizeEmail(email);
  if (!normalized) return { ok: false, error: "Ese correo no parece válido." };

  const db = getDb();
  await db.update(guests).set({ email: normalized }).where(eq(guests.id, guest.id));
  revalidatePath("/", "layout");
  return { ok: true };
}
