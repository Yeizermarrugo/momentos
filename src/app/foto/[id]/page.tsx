import { notFound } from "next/navigation";
import { requireGuest, getGuestId } from "@/lib/session";
import { getFeedPosts, getGuestProfile, flattenFeedPhotos, initials, type PhotoDetail } from "@/lib/queries";
import { PhotoScroller } from "@/components/guest/photo-scroller";

// Vista de detalle como ruta real (no modal/overlay) — a propósito: el
// visor fullscreen con position:fixed dejaba pasar el fondo de atrás en el
// simulador de teléfono del usuario (fixed + ancestro con transform: scale
// es un problema conocido de CSS). Una página normal con scroll normal no
// tiene ese problema, punto.
export default async function FotoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ctx?: string; cat?: string; guestId?: string }>;
}) {
  await requireGuest();
  const { id } = await params;
  const photoId = Number(id);
  if (!Number.isInteger(photoId)) notFound();

  const sp = await searchParams;
  const viewerId = await getGuestId();

  let list: PhotoDetail[];

  if (sp.ctx === "perfil" && sp.guestId) {
    const profile = await getGuestProfile(Number(sp.guestId), viewerId);
    if (!profile) notFound();
    const guestInitials = initials(profile.guest.name);
    list = profile.photos.map((p) => ({
      id: p.id,
      url: p.url,
      postId: p.postId,
      caption: p.caption,
      loveCount: p.loveCount,
      funCount: p.funCount,
      likeCount: p.likeCount,
      viewerReaction: p.viewerReaction,
      guestId: profile.guest.id,
      guestName: profile.guest.name,
      guestInitials,
      category: p.category,
      createdAt: p.createdAt,
    }));
  } else {
    const posts = await getFeedPosts(viewerId);
    const filtered = sp.cat && sp.cat !== "todas" ? posts.filter((p) => p.category === sp.cat) : posts;
    list = flattenFeedPhotos(filtered);
  }

  const startIndex = list.findIndex((p) => p.id === photoId);
  if (startIndex === -1) notFound();

  return <PhotoScroller photos={list} startIndex={startIndex} viewerId={viewerId} />;
}
