import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";

const GUEST_COOKIE_NAME = "guest_session";
const ADMIN_COOKIE_NAME = "admin_session";
const GUEST_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 días — sirve antes/durante/después de la boda
const ADMIN_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function sign(value: string) {
  const secret = process.env.SESSION_SECRET!;
  return createHmac("sha256", secret).update(value).digest("hex");
}

function timingSafeStringsEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

// --- Contraseña de invitado: scrypt con salt propio por password ---

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string | null | undefined) {
  if (!stored) return false;
  const [salt, derivedHex] = stored.split(":");
  if (!salt || !derivedHex) return false;
  const derived = Buffer.from(derivedHex, "hex");
  const candidate = scryptSync(password, salt, 64);
  if (derived.length !== candidate.length) return false;
  return timingSafeEqual(derived, candidate);
}

// --- Sesión de invitado: cookie firmada con el guestId, sin contraseña ---

export function createGuestSessionToken(guestId: number) {
  const payload = `${guestId}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyGuestSessionToken(token: string | undefined | null): number | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [guestIdRaw, issuedAtRaw, signature] = parts;
  const payload = `${guestIdRaw}.${issuedAtRaw}`;
  const expected = sign(payload);
  if (!timingSafeStringsEqual(expected, signature)) return null;

  const issuedAt = Number(issuedAtRaw);
  const age = Date.now() - issuedAt;
  if (!(age >= 0 && age <= GUEST_MAX_AGE_SECONDS * 1000)) return null;

  const guestId = Number(guestIdRaw);
  return Number.isInteger(guestId) ? guestId : null;
}

// --- Sesión de admin: password única vía env, sin cuentas de usuario ---
// Mismo patrón que tarjetas-invitacion/src/lib/auth.ts (decisión ya tomada ahí).

export function createAdminSessionToken() {
  const issuedAt = Date.now().toString();
  return `${issuedAt}.${sign(`admin.${issuedAt}`)}`;
}

export function verifyAdminSessionToken(token: string | undefined | null) {
  if (!token) return false;
  const [issuedAt, signature] = token.split(".");
  if (!issuedAt || !signature) return false;

  const expected = sign(`admin.${issuedAt}`);
  if (!timingSafeStringsEqual(expected, signature)) return false;

  const age = Date.now() - Number(issuedAt);
  return age >= 0 && age <= ADMIN_MAX_AGE_SECONDS * 1000;
}

export function checkAdminPassword(password: string) {
  const expected = process.env.ADMIN_PASSWORD ?? "";
  return timingSafeStringsEqual(password, expected);
}

export const GUEST_SESSION_COOKIE = GUEST_COOKIE_NAME;
export const GUEST_SESSION_MAX_AGE = GUEST_MAX_AGE_SECONDS;
export const ADMIN_SESSION_COOKIE = ADMIN_COOKIE_NAME;
export const ADMIN_SESSION_MAX_AGE = ADMIN_MAX_AGE_SECONDS;
export const MIN_PASSWORD_LENGTH = 4;
