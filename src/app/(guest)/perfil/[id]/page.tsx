import { notFound } from "next/navigation";
import { getGuestId } from "@/lib/session";
import { getGuestProfile } from "@/lib/queries";
import { ProfileView } from "@/components/guest/profile-view";

export default async function GuestProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guestId = Number(id);
  if (!Number.isInteger(guestId)) notFound();

  const viewerId = await getGuestId();
  const profile = await getGuestProfile(guestId, viewerId);
  if (!profile) notFound();

  return <ProfileView {...profile} isOwner={viewerId === guestId} />;
}
