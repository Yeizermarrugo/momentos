"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { relativeTime, CATEGORY_LABEL } from "@/lib/format";
import { toggleReaction } from "@/app/actions/posts";
import { sharePhoto } from "@/lib/share";
import { ReactionBurst } from "@/components/guest/reaction-burst";
import type { FeedPost } from "@/lib/queries";

export function PostCard({
  post,
  activeCategory,
}: {
  post: FeedPost;
  activeCategory: string;
}) {
  const [photos, setPhotos] = useState(post.photos);
  const [active, setActive] = useState(0);
  const [burst, setBurst] = useState<"love" | "fun" | "like" | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [, startTransition] = useTransition();

  const activePhoto = photos[active];

  function onScroll() {
    const el = trackRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setActive(Math.max(0, Math.min(photos.length - 1, i)));
  }

  function scrollToIndex(i: number) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }

  function react(type: "love" | "fun" | "like") {
    const photo = photos[active];
    const wasActive = photo.viewerReaction === type;
    const prevReaction = photo.viewerReaction;

    if (!wasActive) setBurst(type);

    setPhotos((prev) =>
      prev.map((p, i) => {
        if (i !== active) return p;
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
        return { ...p, loveCount, funCount, likeCount, viewerReaction: wasActive ? null : type };
      })
    );

    startTransition(async () => {
      await toggleReaction(photo.id, type);
    });
  }

  return (
    <article className="bg-card rounded-2xl overflow-hidden border border-border shadow-[0_18px_34px_-14px_rgba(90,62,43,0.45)] mb-5">
      <div className="relative">
        <div
          ref={trackRef}
          onScroll={onScroll}
          className="flex touch-pan-x overflow-x-auto snap-x snap-mandatory scrollbar-hide"
        >
          {photos.map((photo) => (
            <Link
              key={photo.id}
              href={`/foto/${photo.id}?ctx=feed&cat=${activeCategory}`}
              className="relative shrink-0 w-full aspect-square snap-start cursor-zoom-in"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="" className="size-full object-cover" loading="lazy" />
            </Link>
          ))}
        </div>

        {photos.length > 1 && (
          <>
            {active > 0 && (
              <button
                onClick={() => scrollToIndex(active - 1)}
                aria-label="Foto anterior"
                className="absolute z-10 left-2 top-1/2 -translate-y-1/2 grid size-7 place-items-center rounded-full bg-black/45 text-white hover:bg-black/60"
              >
                <ChevronLeft className="size-4" />
              </button>
            )}
            {active < photos.length - 1 && (
              <button
                onClick={() => scrollToIndex(active + 1)}
                aria-label="Foto siguiente"
                className="absolute z-10 right-2 top-1/2 -translate-y-1/2 grid size-7 place-items-center rounded-full bg-black/45 text-white hover:bg-black/60"
              >
                <ChevronRight className="size-4" />
              </button>
            )}
            <div className="absolute z-10 bottom-2.5 inset-x-0 flex justify-center gap-1.5">
              {photos.map((p, i) => (
                <span
                  key={p.id}
                  className={cn(
                    "h-1.5 rounded-full bg-white/55 transition-all",
                    i === active ? "w-4 bg-white" : "w-1.5"
                  )}
                />
              ))}
            </div>
          </>
        )}

        <div className="absolute inset-x-0 top-0 z-10 flex items-start justify-between p-3 bg-gradient-to-b from-black/50 to-transparent">
          <Link href={`/perfil/${post.guest.id}`} className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-beige text-[11px] font-extrabold text-wood border-2 border-white/85">
              {post.guest.initials}
            </span>
            <span className="text-white leading-tight">
              <span className="block text-xs font-bold">{post.guest.name}</span>
              <span className="block text-[10px] opacity-85">{relativeTime(post.createdAt)}</span>
            </span>
          </Link>
          <span className="rounded-full bg-white/92 px-2.5 py-1 text-[10px] font-bold text-wood">
            {CATEGORY_LABEL[post.category]}
          </span>
        </div>

        {burst && <ReactionBurst type={burst} onDone={() => setBurst(null)} />}
      </div>

      {post.caption && (
        <p className="px-3 pt-2.5 text-[13px] text-foreground">
          <Link href={`/perfil/${post.guest.id}`} className="font-bold hover:underline">
            {post.guest.name}
          </Link>{" "}
          {post.caption}
        </p>
      )}

      <div className="flex items-center gap-4 p-3">
        {post.category === "general" ? (
          // General = fotos normales, sin categoría romántica/divertida —
          // una sola reacción genérica "Like", campo propio en DB
          // (reaction_type='like') para que el admin pueda rankearlas.
          <button
            onClick={() => react("like")}
            title="Like"
            aria-label="Like"
            className="flex items-center gap-1"
          >
            <span
              className={cn("text-lg leading-none", activePhoto?.viewerReaction === "like" && "animate-heart-pulse")}
            >
              👍
            </span>
            <span className={cn("text-[13px] font-bold", activePhoto?.viewerReaction === "like" ? "text-blue-500" : "text-muted-foreground")}>
              {activePhoto?.likeCount ?? 0}
            </span>
          </button>
        ) : (
          <>
            <button onClick={() => react("love")} title="Me encanta" aria-label="Me encanta" className="flex items-center gap-1">
              <span
                className={cn("text-lg leading-none", activePhoto?.viewerReaction === "love" && "animate-heart-pulse")}
              >
                ❤️
              </span>
              <span className={cn("text-[13px] font-bold", activePhoto?.viewerReaction === "love" ? "text-rose-500" : "text-muted-foreground")}>
                {activePhoto?.loveCount ?? 0}
              </span>
            </button>
            <button onClick={() => react("fun")} title="Me divierte" aria-label="Me divierte" className="flex items-center gap-1">
              <span
                className={cn("text-lg leading-none", activePhoto?.viewerReaction === "fun" && "animate-fun-wiggle")}
              >
                😄
              </span>
              <span className={cn("text-[13px] font-bold", activePhoto?.viewerReaction === "fun" ? "text-amber-500" : "text-muted-foreground")}>
                {activePhoto?.funCount ?? 0}
              </span>
            </button>
          </>
        )}
        <button
          onClick={() => activePhoto && sharePhoto(activePhoto.shareCode, post.caption)}
          title="Compartir"
          aria-label="Compartir foto"
          className="text-muted-foreground"
        >
          <Share2 className="size-5" />
        </button>
      </div>
    </article>
  );
}
