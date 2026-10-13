"use client";

import { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import { Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CATEGORY_LABEL } from "@/lib/format";
import type { GuestWinner } from "@/lib/queries";

const SEEN_KEY = "momentos-winner-seen";

// Clave por (foto, momento en que se marcó ganadora) — no solo por foto. Si
// el admin desmarca y vuelve a marcar la misma foto, markedAt cambia y esta
// clave ya no matchea ninguna vista: el modal se ve de nuevo solo, sin tener
// que borrar nada activamente de localStorage.
function winnerKey(w: Pick<GuestWinner, "photoId" | "markedAt">) {
  return `${w.photoId}:${new Date(w.markedAt).getTime()}`;
}

function loadSeen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function markSeen(key: string) {
  try {
    const seen = loadSeen();
    if (!seen.includes(key)) localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, key]));
  } catch {
    // localStorage puede fallar (privado/bloqueado) — no es crítico, solo
    // significa que el modal podría repetirse en la próxima visita.
  }
}

// Modal de celebración cuando el invitado entra y una de sus fotos fue
// marcada ganadora — se muestra una sola vez por foto (localStorage por
// navegador, sin cuentas de usuario acá, ver Gotchas del proyecto). Si tiene
// más de una ganadora nueva (romántica + divertida), las muestra una por una.
export function WinnerCelebration({ winners }: { winners: GuestWinner[] }) {
  const [queue, setQueue] = useState<GuestWinner[]>([]);

  useEffect(() => {
    const seen = loadSeen();
    setQueue(winners.filter((w) => !seen.includes(winnerKey(w))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = queue[0] ?? null;

  useEffect(() => {
    if (!current) return;
    const colors = ["#b9925c", "#8c6b3d", "#c99a3f", "#faf6ef"];
    const end = Date.now() + 2200;

    confetti({ particleCount: 100, spread: 110, origin: { y: 0.35 }, colors, zIndex: 9999 });

    let frameId: number;
    (function frame() {
      confetti({ particleCount: 4, angle: 60, spread: 65, origin: { x: 0 }, colors, zIndex: 9999 });
      confetti({ particleCount: 4, angle: 120, spread: 65, origin: { x: 1 }, colors, zIndex: 9999 });
      if (Date.now() < end) frameId = requestAnimationFrame(frame);
    })();

    return () => cancelAnimationFrame(frameId);
  }, [current]);

  function close() {
    if (!current) return;
    markSeen(winnerKey(current));
    setQueue((prev) => prev.slice(1));
  }

  return (
    <Dialog open={!!current} onOpenChange={(open) => !open && close()}>
      <DialogContent className="gap-0 overflow-hidden p-0 text-center sm:max-w-sm">
        {current && (
          <div className="p-6 pt-8">
            <div className="mx-auto grid size-16 place-items-center rounded-full bg-winner/15 text-winner">
              <Trophy className="size-8" />
            </div>
            <DialogTitle className="mt-3 font-display text-xl">¡Ganaste! 🎉</DialogTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Tu foto fue elegida ganadora en{" "}
              <span className="font-bold text-foreground">{CATEGORY_LABEL[current.category]}</span>.
            </p>
            <div className="mx-auto mt-4 aspect-square w-40 overflow-hidden rounded-xl border-2 border-winner">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={current.url} alt="" className="size-full object-cover" />
            </div>
            <Button className="mt-5 w-full" size="lg" onClick={close}>
              ¡Genial!
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
