// Lee la tabla `invitations` de tarjetas-invitacion directo — misma DB
// Postgres compartida (ver DATABASE_URL en .env.local), sin API HTTP.
// Esta tabla la migra/gestiona tarjetas-invitacion, no momentos: por eso no
// está en src/db/schema.ts (drizzle-kit push de momentos nunca debe tocarla)
// y se lee con SQL crudo en vez de un objeto pgTable.

import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { guests } from "@/db/schema";

type InvitationRow = {
  slug: string;
  guest_name_1: string;
  guest_name_2: string | null;
  seats: number;
  rsvp_status: "pending" | "confirmed" | "declined";
  rsvp_attendees: number | null;
};

export type InvitationCheck =
  | { status: "not_found" }
  | { status: "declined" }
  | { status: "pending" }
  | {
      status: "ok";
      seats: number;
      guestName1: string;
      guestName2: string | null;
      maxAllowed: number;
      // Filas ya existentes en `guests` para este código (independiente de
      // si tienen contraseña) — usado para el tope de cupo (`maxAllowed`).
      takenSeatIndexes: number[];
      // De esas, cuáles ya tienen contraseña seteada — un invitado ya
      // registrado entra por login (1 password), el resto crea contraseña.
      seatsWithPassword: number[];
    };

async function fetchInvitation(code: string): Promise<InvitationRow | null> {
  const db = getDb();
  const result = await db.execute<InvitationRow>(
    sql`select slug, guest_name_1, guest_name_2, seats, rsvp_status, rsvp_attendees
        from invitations
        where slug = ${code}
        limit 1`
  );
  return result.rows[0] ?? null;
}

// Solo entra si confirmó asistencia (rsvp_status = 'confirmed') — pending o
// declined quedan afuera. El tope de registros NO es `seats` (capacidad de
// la invitación), es `rsvp_attendees` (cuántas personas confirmaron
// realmente venir) — puede ser menor a seats si solo 1 de 2 confirmó.
//
// Nota: acá NO se bloquea por cupo lleno (`registered.length >= maxAllowed`)
// — un invitado que ya se registró debe poder seguir haciendo login aunque
// el cupo de la invitación esté completo. El tope de cupo solo aplica al
// crear una contraseña nueva (ver registerGuest en actions/auth.ts).
export async function checkInvitation(code: string): Promise<InvitationCheck> {
  const invitation = await fetchInvitation(code.trim());
  if (!invitation) return { status: "not_found" };
  if (invitation.rsvp_status === "declined") return { status: "declined" };
  if (invitation.rsvp_status === "pending") return { status: "pending" };

  const maxAllowed = invitation.rsvp_attendees ?? invitation.seats;

  const db = getDb();
  const registered = await db
    .select({ seatIndex: guests.seatIndex, passwordHash: guests.passwordHash })
    .from(guests)
    .where(eq(guests.invitationCode, code.trim()));

  return {
    status: "ok",
    seats: invitation.seats,
    guestName1: invitation.guest_name_1,
    guestName2: invitation.guest_name_2,
    maxAllowed,
    takenSeatIndexes: registered.map((r) => r.seatIndex),
    seatsWithPassword: registered.filter((r) => r.passwordHash).map((r) => r.seatIndex),
  };
}
