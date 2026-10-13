"use client";

import { toast } from "sonner";

// Link público de la foto (/f/<shareCode>, código aleatorio — no el id
// correlativo): quien no tiene cuenta ve esa publicación con vista previa en
// WhatsApp; un invitado con sesión es redirigido a /foto/[id] en el feed
// completo. Ver src/app/f/[code]/page.tsx.
export async function sharePhoto(shareCode: string, caption?: string | null) {
  const url = `${window.location.origin}/f/${shareCode}`;
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
