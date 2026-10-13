import { notFound } from "next/navigation";
import { getGuestId } from "@/lib/session";
import { getGuestProfile } from "@/lib/queries";
import { ProfileView } from "@/components/guest/profile-view";

export default async function OwnProfilePage() {
  const guestId = await getGuestId();
  if (!guestId) notFound();
  const profile = await getGuestProfile(guestId, guestId);
  if (!profile) notFound();

  return <ProfileView {...profile} isOwner />;
}
