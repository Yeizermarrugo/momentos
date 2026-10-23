// Momentos se abre el día de la boda: antes de esa hora los invitados ya
// pueden crear su cuenta, pero solo ven el conteo regresivo — subir,
// reaccionar, ver el feed, etc. se habilita recién a `opensAt()`.
//
// Hora de Colombia (UTC-5, sin horario de verano). `MOMENTOS_OPENS_AT`
// (ISO 8601) la pisa — útil para probar en dev con una fecha pasada.
const DEFAULT_OPENS_AT = "2026-12-10T00:00:00-05:00";

export function opensAt(): Date {
  const fromEnv = process.env.MOMENTOS_OPENS_AT;
  const date = new Date(fromEnv || DEFAULT_OPENS_AT);
  return Number.isNaN(date.getTime()) ? new Date(DEFAULT_OPENS_AT) : date;
}

export function isOpen(now = Date.now()): boolean {
  return now >= opensAt().getTime();
}

export function msUntilOpen(now = Date.now()): number {
  return opensAt().getTime() - now;
}

// Cuentas con acceso anticipado (pruebas de los novios): correos separados
// por coma en `EARLY_ACCESS_EMAILS`. Se comparan contra guests.email, que
// siempre está normalizado en minúsculas.
function earlyAccessEmails(): string[] {
  return (process.env.EARLY_ACCESS_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isOpenFor(email: string | null | undefined): boolean {
  return isOpen() || (!!email && earlyAccessEmails().includes(email));
}
