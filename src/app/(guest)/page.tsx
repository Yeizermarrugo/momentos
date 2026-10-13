import { getGuestId } from "@/lib/session";
import { getFeedPosts } from "@/lib/queries";
import { FeedList } from "@/components/guest/feed-list";

export default async function FeedPage() {
  const guestId = await getGuestId();
  const posts = await getFeedPosts(guestId);
  return <FeedList posts={posts} />;
}
