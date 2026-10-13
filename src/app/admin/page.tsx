import { getRankings, getAllPhotosAdmin, getAllGuestsAdmin } from "@/lib/queries";
import { AdminDashboard } from "@/components/admin/dashboard";

// Sin esto, Next lo prerenderiza estático en build (no hay cookies()/headers()
// en esta página — la protección de /admin vive en el proxy, no acá) y hornea
// rankings/fotos del momento del build para siempre, en vez de datos en vivo.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const [{ romantica, divertida, general, winners }, allPhotos, allGuests] = await Promise.all([
    getRankings(),
    getAllPhotosAdmin(),
    getAllGuestsAdmin(),
  ]);

  return (
    <AdminDashboard
      romantica={romantica}
      divertida={divertida}
      general={general}
      winners={winners}
      allPhotos={allPhotos}
      allGuests={allGuests}
      totalGuests={allGuests.length}
    />
  );
}
