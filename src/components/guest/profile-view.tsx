"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Copy, LogOut, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { deleteOwnPost } from "@/app/actions/posts";
import { logoutGuest } from "@/app/actions/auth";
import type { Guest } from "@/db/schema";
import type { ProfilePhoto } from "@/lib/queries";

export function ProfileView({
  guest,
  photos,
  loveReceived,
  funReceived,
  isOwner,
}: {
  guest: Guest;
  photos: ProfilePhoto[];
  loveReceived: number;
  funReceived: number;
  isOwner: boolean;
}) {
  const [items, setItems] = useState(photos);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  // Un tile por publicación (como Instagram): portada = primera foto del
  // carrusel, ícono arriba a la derecha si tiene varias.
  const postsGrid: { postId: number; cover: ProfilePhoto; count: number }[] = [];
  for (const photo of items) {
    const last = postsGrid[postsGrid.length - 1];
    if (last && last.postId === photo.postId) last.count++;
    else postsGrid.push({ postId: photo.postId, cover: photo, count: 1 });
  }

  function remove(postId: number, count: number) {
    if (count > 1 && !window.confirm(`¿Eliminar esta publicación con ${count} fotos?`)) return;
    setRemovingId(postId);
    startTransition(async () => {
      try {
        await deleteOwnPost(postId);
        setItems((prev) => prev.filter((p) => p.postId !== postId));
      } catch {
        toast.error("No se pudo eliminar la publicación.");
      } finally {
        setRemovingId(null);
      }
    });
  }

  const initials = guest.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div>
      <div className="relative bg-gradient-to-b from-beige to-muted px-5 pb-4.5 pt-8.5 text-center">
        {isOwner && (
          <form action={logoutGuest} className="absolute right-3 top-3">
            <button
              type="submit"
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              className="grid size-8 place-items-center rounded-full text-muted-foreground"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        )}
        <div className="mx-auto grid size-19 place-items-center rounded-full border-2 border-gold bg-card font-display text-2xl text-wood">
          {initials}
        </div>
        <h2 className="mt-2.5 font-display text-xl font-semibold">{guest.name}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Invitado{guest.tableLabel ? ` · ${guest.tableLabel}` : ""}</p>
        <div className="mt-3.5 flex justify-center gap-5">
          <Stat n={items.length} label="Fotos" />
          <Stat n={loveReceived} label="Me encanta" />
          <Stat n={funReceived} label="Me divierte" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 p-2.5">
        {postsGrid.map(({ postId, cover, count }) => (
          <Link
            key={postId}
            href={`/foto/${cover.id}?ctx=perfil&guestId=${guest.id}`}
            className={cn(
              "relative aspect-square overflow-hidden cursor-zoom-in",
              removingId === postId && "opacity-25 grayscale"
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover.url} alt="" className="size-full object-cover" loading="lazy" />
            {count > 1 && (
              <Copy
                aria-label={`${count} fotos`}
                className="absolute right-1.5 top-1.5 size-4 -scale-x-100 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
              />
            )}
            {isOwner && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  remove(postId, count);
                }}
                title="Eliminar publicación"
                className="absolute bottom-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-black/55 text-white"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </Link>
        ))}
        {items.length === 0 && (
          <p className="col-span-3 mt-10 text-center text-sm text-muted-foreground">Sin fotos todavía.</p>
        )}
      </div>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="text-center">
      <div className="font-display text-[17px] font-bold tabular-nums">{n}</div>
      <div className="text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">{label}</div>
    </div>
  );
}
