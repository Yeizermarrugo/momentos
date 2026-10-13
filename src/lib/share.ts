"use client";

import { toast } from "sonner";

// Link directo a la foto — cualquier invitado que ya tenga sesión (cookie
// guest_session) accede directo al abrirlo, sin re-loguearse. `cat=todas`
// a propósito: no depende del filtro que tenía activo quien comparte, así
// el link siempre encuentra la foto sin importar desde dónde se compartió.
export async function sharePhoto(photoId: number, caption?: string | null) {
  const url = `${window.location.origin}/foto/${photoId}?ctx=feed&cat=todas`;
  const text = caption || "Mirá esta foto de la boda";

  if (navigator.share) {
    try {
      await navigator.share({ title: "Momentos", text, url });
    } catch {
      // usuario cerró el sheet de compartir sin elegir nada — no es un error
    }
    return;
  }

  try {
    await navigator.clipboard.writeText(url);
    toast.success("Enlace copiado — mandaselo por WhatsApp");
  } catch {
    toast.error("No se pudo copiar el enlace.");
  }
}
