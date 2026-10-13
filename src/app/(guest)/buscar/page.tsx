import { searchGuests } from "@/lib/queries";
import { SearchList } from "@/components/guest/search-list";

export default async function BuscarPage() {
  const guests = await searchGuests("");
  return <SearchList guests={guests} />;
}
