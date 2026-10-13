import { notFound, redirect } from "next/navigation";
import { getGuestId } from "@/lib/session";
import { getFeedPosts, getGuestProfile, flattenFeedPhotos, initials, type PhotoDetail } from "@/lib/queries";
import { PhotoScroller } from "@/components/guest/photo-scroller";

export default async function FotoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ctx?: string; cat?: string; guestId?: string }>;
}) {
  const { id } = await params;
  const photoId = Number(id);
  if (!Number.isInteger(photoId)) notFound();

  const sp = await searchParams;
  const viewerId = await getGuestId();
  // Solo invitados — la vista pública sin cuenta es /f/<shareCode> (el id
  // es correlativo y permitiría recorrer el álbum entero). Tras el login
  // vuelve acá.
  if (!viewerId) {
    const qs = new URLSearchParams(sp as Record<string, string>).toString();
    redirect(`/login?next=${encodeURIComponent(`/foto/${photoId}${qs ? `?${qs}` : ""}`)}`);
  }

  let list: PhotoDetail[];

  if (sp.ctx === "perfil" && sp.guestId) {
    const profile = await getGuestProfile(Number(sp.guestId), viewerId);
    if (!profile) notFound();
    const guestInitials = initials(profile.guest.name);
    list = profile.photos.map((p) => ({
      id: p.id,
      url: p.url,
      shareCode: p.shareCode,
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
