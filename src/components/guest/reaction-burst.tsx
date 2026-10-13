"use client";

import { ThumbsUp } from "lucide-react";
import { cn } from "@/lib/utils";

// Emoji/icono que "vuela" hacia el centro de la foto al tocar ❤️/😄/👍 — vive
// en un overlay absolute inset-0 sobre el wrapper relative de la foto
// (llamador decide dónde), se saca solo del DOM al terminar la animación
// CSS. "like" usa el ícono lucide en vez del emoji 👍 (que trae su propio
// tono de piel amarillo fijo) para poder pintarlo azul estilo Facebook.
const EMOJI: Record<"love" | "fun", string> = { love: "❤️", fun: "😄" };

export function ReactionBurst({ type, onDone }: { type: "love" | "fun" | "like"; onDone: () => void }) {
  const animationClass = type === "fun" ? "reaction-fly-fun" : "reaction-fly-love";

  return (
    <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center">
      {type === "like" ? (
        <span
          onAnimationEnd={onDone}
          className={cn(
            "grid size-16 place-items-center rounded-full bg-blue-500 text-white shadow-[0_4px_10px_rgba(0,0,0,0.35)]",
            animationClass
          )}
        >
          <ThumbsUp className="size-8" fill="currentColor" />
        </span>
      ) : (
        <span
          onAnimationEnd={onDone}
          className={cn("select-none text-7xl drop-shadow-[0_4px_10px_rgba(0,0,0,0.35)]", animationClass)}
        >
          {EMOJI[type]}
        </span>
      )}
    </div>
  );
}
