import { requireGuest } from "@/lib/session";
import { getGuestWinners } from "@/lib/queries";
import { TabBar } from "@/components/guest/tabbar";
import { WinnerCelebration } from "@/components/guest/winner-celebration";
import { EmailPrompt } from "@/components/guest/email-prompt";

export default async function GuestLayout({ children }: { children: React.ReactNode }) {
  const guest = await requireGuest();
  const myWinners = await getGuestWinners(guest.id);

  return (
    // bg-muted (no bg-background) a propósito: el fondo de página necesita
    // contraste real contra las cards blancas, si no quedan sin separación
    // visible (bug reportado: "no tiene fondo, se ve todo lo de atrás").
    <div className="min-h-svh bg-muted">
      <div className="mx-auto max-w-md pb-24">
        {!guest.email && <EmailPrompt />}
        {children}
      </div>
      <TabBar />
      <WinnerCelebration winners={myWinners} />
    </div>
  );
}
