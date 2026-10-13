// Rate limit en memoria, best-effort — no hay Redis ni servicio externo acá
// (app de 40 invitados en Vercel Hobby, no vale la pena la infra). Con Fluid
// Compute el módulo persiste entre invocaciones de la misma instancia
// reusada, así que frena fuerza bruta casual; no es a prueba de múltiples
// instancias en paralelo, pero es suficiente para el modelo de amenaza acá.
const attempts = new Map<string, { count: number; resetAt: number }>();

const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;

export function isRateLimited(key: string): boolean {
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < Date.now()) return false;
  return entry.count >= MAX_ATTEMPTS;
}

export function recordFailedAttempt(key: string) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count++;
  }
}

export function clearAttempts(key: string) {
  attempts.delete(key);
}
