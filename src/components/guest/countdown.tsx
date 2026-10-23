"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { logoutGuest } from "@/app/actions/auth";

function parts(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return [
    { label: "días", value: Math.floor(total / 86400) },
    { label: "horas", value: Math.floor((total % 86400) / 3600) },
    { label: "min", value: Math.floor((total % 3600) / 60) },
    { label: "seg", value: total % 60 },
  ];
}

// Pantalla previa a la apertura (ver lib/opening.ts): la cuenta ya existe,
// el resto de la app espera al día de la boda. `remainingMs` viene del
// server: el primer render coincide con el HTML (sin hydration mismatch) y
// el plazo se ancla a "ahora + remainingMs" en el navegador, no a la hora
// absoluta de apertura — así un celular con la hora adelantada/atrasada no corre el
// conteo. Al llegar a 0 refresca; si el server todavía dice cerrado (unos
// segundos de diferencia), sigue reintentando cada pocos segundos en vez de
// quedarse en 00:00:00:00.
export function Countdown({ name, remainingMs }: { name: string; remainingMs: number }) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(remainingMs);

  useEffect(() => {
    const deadline = Date.now() + remainingMs;
    let lastRefresh = 0;
    const id = setInterval(() => {
      const left = deadline - Date.now();
      setRemaining(left);
      if (left <= 0 && Date.now() - lastRefresh > 3000) {
        lastRefresh = Date.now();
        router.refresh();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [remainingMs, router]);

  const firstName = name.trim().split(/\s+/)[0];

  return (
    <main className="min-h-svh flex flex-col items-center justify-center gap-8 px-6 py-10 bg-background">
      <div className="text-center space-y-1">
        <p className="text-[11px] tracking-[0.28em] uppercase text-muted-foreground">
          Yeizer &amp; Diana · 10 dic 2026
        </p>
        <h1 className="font-script text-5xl text-wood leading-none">Y &amp; D</h1>
        <p className="text-sm text-muted-foreground">Momentos — fotos de la boda</p>
      </div>

      <div className="w-full max-w-sm bg-card paper-grain paper-card rounded-3xl border border-border p-6 space-y-5 text-center">
        <div className="space-y-1.5">
          <p className="font-display text-xl font-semibold">¡Listo, {firstName}!</p>
          <p className="text-sm text-muted-foreground">Tu cuenta ya está creada. Momentos se abre el día de la boda.</p>
        </div>

        <div className="grid grid-cols-4 gap-2" aria-live="off">
          {parts(remaining).map((p) => (
            <div key={p.label} className="rounded-2xl border border-gold/40 bg-background px-1 py-3">
              <div className="font-display text-3xl font-semibold tabular-nums text-wood leading-none">
                {String(p.value).padStart(2, "0")}
              </div>
              <div className="mt-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{p.label}</div>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Ese día vas a poder subir tus fotos, reaccionar a las de los demás y participar por los premios a la foto
          más romántica y la más divertida.
        </p>

        <form action={logoutGuest}>
          <button
            type="submit"
            className="mx-auto flex items-center gap-1.5 text-xs text-muted-foreground underline underline-offset-2"
          >
            <LogOut className="size-3.5" />
            Cerrar sesión
          </button>
        </form>
      </div>
    </main>
  );
}
