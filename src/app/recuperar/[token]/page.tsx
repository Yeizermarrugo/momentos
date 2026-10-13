import Link from "next/link";
import { getResetTokenGuestName } from "@/app/actions/password-reset";
import { ResetPasswordForm } from "./reset-form";

// Link que llega por correo ("olvidé mi contraseña"). Se valida el token al
// renderizar para mostrar "link vencido" de entrada; resetPassword lo vuelve
// a validar al enviar.
export default async function RecuperarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const name = await getResetTokenGuestName(token);

  return (
    <main className="min-h-svh flex flex-col items-center justify-center gap-8 px-6 py-10 bg-background">
      <div className="text-center space-y-1">
        <h1 className="font-script text-5xl text-wood leading-none">Y &amp; D</h1>
        <p className="text-sm text-muted-foreground">Momentos — nueva contraseña</p>
      </div>
      <div className="w-full max-w-sm bg-card paper-grain paper-card rounded-3xl border border-border p-6 space-y-5">
        {name ? (
          <ResetPasswordForm token={token} name={name} />
        ) : (
          <div className="space-y-4 text-center">
            <p className="font-display text-base font-semibold">Este link venció o ya se usó</p>
            <p className="text-xs text-muted-foreground">
              Pedí uno nuevo desde el login con &quot;¿Olvidaste tu contraseña?&quot;.
            </p>
            <Link href="/login" className="text-sm font-semibold text-wood underline underline-offset-2">
              Ir al login
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
