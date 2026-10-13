import { cache } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getGuestId } from "@/lib/session";
import { getPhotoIdByShareCode, getPublicPost } from "@/lib/queries";
import { PhotoScroller } from "@/components/guest/photo-scroller";

// Link público de compartir — se ve SIN cuenta (estrategia de difusión).
// Código aleatorio en vez del id: no se puede recorrer el álbum probando
// números. Sin sesión: solo esta publicación (su carrusel), reaccionar o ver
// perfiles pide login. Con sesión: directo a /foto/[id] en el feed completo.
const getShared = cache(async (code: string) => {
  const photoId = await getPhotoIdByShareCode(code);
  if (!photoId) return null;
  const post = await getPublicPost(photoId);
  return post && { photoId, ...post };
});

// Vista previa del link (Open Graph) — miniatura y no display: WhatsApp no
// muestra previews de imágenes pesadas (~300 KB+). Display y miniatura no
// tienen EXIF (salen de canvas), así que no se filtra ubicación.
export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const shared = await getShared((await params).code);
  if (!shared) return {};

  const first = shared.photos[0];
  const title = `${first.guestName} compartió un momento · Boda Yeizer & Diana`;
  const description = first.caption || "Mirá esta foto de la boda de Yeizer & Diana en Momentos.";
  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: shared.thumbUrl }], type: "article" },
    twitter: { card: "summary_large_image", title, description, images: [shared.thumbUrl] },
  };
}

export default async function SharedPhotoPage({ params }: { params: Promise<{ code: string }> }) {
  const shared = await getShared((await params).code);
  if (!shared) notFound();

  if (await getGuestId()) redirect(`/foto/${shared.photoId}?ctx=feed&cat=todas`);

  const startIndex = shared.photos.findIndex((p) => p.id === shared.photoId);
  return <PhotoScroller photos={shared.photos} startIndex={Math.max(0, startIndex)} viewerId={null} />;
}
