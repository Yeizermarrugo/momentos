"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Pencil, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { relativeTime, CATEGORY_LABEL, MAX_CAPTION_LENGTH } from "@/lib/format";
import { toggleReaction, updateCaption } from "@/app/actions/posts";
import { sharePhoto } from "@/lib/share";
import { ReactionBurst } from "@/components/guest/reaction-burst";
import type { PhotoDetail } from "@/lib/queries";

// h-svh solo en el wrapper de más afuera (nada fixed acá, es contenido
// normal de la página) — seguro contra el bug de fixed+transform-scale del
// simulador del usuario. Cada <section> abajo usa h-full (porcentaje del
// contenedor con scroll-snap), no vh de nuevo.
export function PhotoScroller({
  photos: initial,
  startIndex,
  viewerId,
}: {
  photos: PhotoDetail[];
  startIndex: number;
  viewerId: number | null;
}) {
  const router = useRouter();
  const [photos, setPhotos] = useState(initial);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [burst, setBurst] = useState<{
    index: number;
    type: "love" | "fun" | "like";
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const startTrackRef = useRef<HTMLDivElement>(null);

  // Una sección vertical por publicación, con sus fotos en carrusel
  // horizontal (igual que PostCard en el feed). `i` sigue siendo el índice
  // en la lista plana, que es lo que usan react()/burst.
  const groups: {
    postId: number;
    items: { photo: PhotoDetail; i: number }[];
  }[] = [];
  photos.forEach((photo, i) => {
    const last = groups[groups.length - 1];
    if (last && last.postId === photo.postId) last.items.push({ photo, i });
    else groups.push({ postId: photo.postId, items: [{ photo, i }] });
  });
  const startPostId = initial[startIndex]?.postId;
  const startGroup = groups.findIndex((g) => g.postId === startPostId);
  const startSlide = groups[startGroup]?.items.findIndex((it) => it.i === startIndex) ?? 0;

  const [activeSlide, setActiveSlide] = useState<Record<number, number>>(() =>
    startPostId != null ? { [startPostId]: startSlide } : {},
  );

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = startGroup * el.clientHeight;
    const track = startTrackRef.current;
    if (track) track.scrollLeft = startSlide * track.clientWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onTrackScroll(postId: number, count: number, track: HTMLElement) {
    const idx = Math.max(0, Math.min(count - 1, Math.round(track.scrollLeft / track.clientWidth)));
    if (idx !== (activeSlide[postId] ?? 0)) {
      setActiveSlide((prev) => ({ ...prev, [postId]: idx }));
      setEditingId(null);
    }
  }

  // Flechas viven fuera del track (quietas) — hermano anterior es el track.
  function scrollSlide(e: React.MouseEvent, dir: 1 | -1) {
    const track = e.currentTarget.parentElement?.firstElementChild;
    if (track) track.scrollBy({ left: dir * track.clientWidth, behavior: "smooth" });
  }

  function react(index: number, type: "love" | "fun" | "like") {
    const photo = photos[index];
    const wasActive = photo.viewerReaction === type;
    const prevReaction = photo.viewerReaction;

    if (!wasActive) setBurst({ index, type });

    setPhotos((prev) =>
      prev.map((p, i) => {
        if (i !== index) return p;
        let loveCount = p.loveCount;
        let funCount = p.funCount;
        let likeCount = p.likeCount;
        if (prevReaction === "love") loveCount--;
        if (prevReaction === "fun") funCount--;
        if (prevReaction === "like") likeCount--;
        if (!wasActive) {
          if (type === "love") loveCount++;
          else if (type === "fun") funCount++;
          else likeCount++;
        }
        return {
          ...p,
          loveCount,
          funCount,
          likeCount,
          viewerReaction: wasActive ? null : type,
        };
      }),
    );

    toggleReaction(photo.id, type);
  }

  function startEdit(photo: PhotoDetail) {
    setEditingId(photo.id);
    setDraft(photo.caption ?? "");
  }

  function saveCaption(photo: PhotoDetail) {
    const caption = draft.trim();
    setPhotos((prev) => prev.map((p) => (p.postId === photo.postId ? { ...p, caption: caption || null } : p)));
    setEditingId(null);
    updateCaption(photo.postId, caption);
  }

  return (
    <div className="flex h-svh flex-col bg-muted">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted px-3 py-2">
        <Link
          href="/"
          onClick={(e) => {
            e.preventDefault();
            router.back();
          }}
          aria-label="Volver"
          className="grid size-7 place-items-center rounded-full border border-border bg-card text-wood"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <span className="font-script text-lg leading-none text-wood">Y &amp; D</span>
      </div>

      <div ref={containerRef} className="scrollbar-hide flex-1 snap-y snap-mandatory overflow-y-auto">
        {groups.map((group, g) => {
          const slide = activeSlide[group.postId] ?? 0;
          const { photo, i } = group.items[Math.min(slide, group.items.length - 1)];
          return (
            // Solo las fotos se deslizan (track horizontal); descripción y
            // reacciones quedan quietas abajo y muestran la foto activa.
            // Foto + botones siguen centrados como un solo bloque (Gotcha
            // #4): el track mide lo que la foto más alta, y la foto se topa
            // con 100cqh (alto de la <section>, container-type:size) menos
            // el espacio de descripción+botones — nada de vh acá (Gotcha #2).
            <section
              key={group.postId}
              className="flex h-full w-full snap-start flex-col items-center justify-center gap-2.5 px-3 py-3 [container-type:size]"
            >
              {/* Autor + categoría arriba, fuera del track: quedan fijos
                  mientras se deslizan las fotos (son de la publicación, no
                  de cada foto). */}
              <div className="flex w-full max-w-md shrink-0 items-center justify-between">
                <Link href={`/perfil/${photo.guestId}`} className="flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-full border border-gold bg-beige text-[11px] font-extrabold text-wood">
                    {photo.guestInitials}
                  </span>
                  <span className="leading-tight">
                    <span className="block text-xs font-bold text-foreground">{photo.guestName}</span>
                    <span className="block text-[10px] text-muted-foreground">{relativeTime(photo.createdAt)}</span>
                  </span>
                </Link>
                <span className="whitespace-nowrap rounded-full bg-card px-2.5 py-1 text-[10px] font-bold text-wood">
                  {CATEGORY_LABEL[photo.category]}
                </span>
              </div>

              <div className="relative w-full">
                <div
                  ref={g === startGroup ? startTrackRef : undefined}
                  onScroll={(e) => onTrackScroll(group.postId, group.items.length, e.currentTarget)}
                  className="scrollbar-hide flex w-full snap-x snap-mandatory items-center overflow-x-auto"
                >
                  {group.items.map(({ photo: p, i: pi }) => (
                    <div key={p.id} className="flex w-full shrink-0 snap-start justify-center">
                      <div className="relative overflow-hidden rounded-xl">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.url}
                          alt=""
                          className="block h-auto max-h-[calc(100cqh-210px)] w-auto max-w-full object-contain"
                          loading="lazy"
                        />

                        {burst?.index === pi && <ReactionBurst type={burst.type} onDone={() => setBurst(null)} />}
                      </div>
                    </div>
                  ))}
                </div>

                {group.items.length > 1 && slide > 0 && (
                  <button
                    onClick={(e) => scrollSlide(e, -1)}
                    aria-label="Foto anterior"
                    className="absolute left-2 top-1/2 z-10 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white hover:bg-black/60"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                )}
                {group.items.length > 1 && slide < group.items.length - 1 && (
                  <button
                    onClick={(e) => scrollSlide(e, 1)}
                    aria-label="Foto siguiente"
                    className="absolute right-2 top-1/2 z-10 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white hover:bg-black/60"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                )}
              </div>

              {group.items.length > 1 && (
                <div className="flex shrink-0 justify-center gap-1.5">
                  {group.items.map((it, d) => (
                    <span
                      key={it.photo.id}
                      className={cn(
                        "h-1.5 rounded-full transition-all",
                        d === slide ? "w-4 bg-gold-deep" : "w-1.5 bg-border",
                      )}
                    />
                  ))}
                </div>
              )}
              {(editingId === photo.id || photo.caption || viewerId === photo.guestId) && (
                <div className="w-full max-w-md shrink-0">
                  {editingId === photo.id ? (
                    <div>
                      <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value.slice(0, MAX_CAPTION_LENGTH))}
                        placeholder="Unas palabras bonitas…"
                        rows={2}
                        autoFocus
                        className="w-full resize-none rounded-lg border border-border bg-card p-2 text-[13px] text-foreground outline-none focus:border-gold"
                      />
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-[10.5px] text-muted-foreground">
                          {draft.length}/{MAX_CAPTION_LENGTH}
                        </span>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => setEditingId(null)}
                            className="rounded-lg px-2.5 py-1 text-[11.5px] font-bold text-muted-foreground"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => saveCaption(photo)}
                            className="rounded-lg bg-gold-deep px-2.5 py-1 text-[11.5px] font-bold text-pearl"
                          >
                            Guardar
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] text-foreground">
                        {photo.caption ? (
                          <>
                            <Link href={`/perfil/${photo.guestId}`} className="font-bold hover:underline">
                              {photo.guestName}
                            </Link>{" "}
                            {photo.caption}
                          </>
                        ) : (
                          <span className="text-muted-foreground">Sin descripción</span>
                        )}
                      </p>
                      {viewerId === photo.guestId && (
                        <button
                          onClick={() => startEdit(photo)}
                          aria-label="Editar descripción"
                          className="grid size-6 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"
                        >
                          <Pencil className="size-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex w-full max-w-md shrink-0 items-center gap-4">
                {photo.category === "general" ? (
                  <button
                    onClick={() => react(i, "like")}
                    title="Like"
                    aria-label="Like"
                    className="flex items-center gap-1"
                  >
                    <span
                      className={cn("text-lg leading-none", photo.viewerReaction === "like" && "animate-heart-pulse")}
                    >
                      👍
                    </span>
                    <span
                      className={cn(
                        "text-[13px] font-bold",
                        photo.viewerReaction === "like" ? "text-blue-500" : "text-muted-foreground",
                      )}
                    >
                      {photo.likeCount}
                    </span>
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => react(i, "love")}
                      title="Me encanta"
                      aria-label="Me encanta"
                      className="flex items-center gap-1"
                    >
                      <span
                        className={cn("text-lg leading-none", photo.viewerReaction === "love" && "animate-heart-pulse")}
                      >
                        ❤️
                      </span>
                      <span
                        className={cn(
                          "text-[13px] font-bold",
                          photo.viewerReaction === "love" ? "text-rose-500" : "text-muted-foreground",
                        )}
                      >
                        {photo.loveCount}
                      </span>
                    </button>
                    <button
                      onClick={() => react(i, "fun")}
                      title="Me divierte"
                      aria-label="Me divierte"
                      className="flex items-center gap-1"
                    >
                      <span
                        className={cn("text-lg leading-none", photo.viewerReaction === "fun" && "animate-fun-wiggle")}
                      >
                        😄
                      </span>
                      <span
                        className={cn(
                          "text-[13px] font-bold",
                          photo.viewerReaction === "fun" ? "text-amber-500" : "text-muted-foreground",
                        )}
                      >
                        {photo.funCount}
                      </span>
                    </button>
                  </>
                )}
                <button
                  onClick={() => sharePhoto(photo.id, photo.caption)}
                  title="Compartir"
                  aria-label="Compartir foto"
                  className="text-muted-foreground"
                >
                  <Share2 className="size-5" />
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
