"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ListFilter } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { PostCard } from "@/components/guest/post-card";
import type { FeedPost } from "@/lib/queries";

const FILTERS = [
  { value: "todas", label: "Todas" },
  { value: "romantica", label: "Románticas" },
  { value: "divertida", label: "Divertidas" },
  { value: "general", label: "Generales" },
] as const;

export function FeedList({ posts }: { posts: FeedPost[] }) {
  const [category, setCategory] = useState<(typeof FILTERS)[number]["value"]>("todas");
  const [filterOpen, setFilterOpen] = useState(false);

  const filtered = useMemo(
    () => (category === "todas" ? posts : posts.filter((p) => p.category === category)),
    [posts, category]
  );

  return (
    <div>
      <header className="px-4 pt-7 pb-3 text-center">
        <p className="font-script text-3xl text-wood leading-none">Y &amp; D</p>
        <p className="mt-1 text-[10px] tracking-[0.22em] uppercase text-muted-foreground">Momentos</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/buscar"
            className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[10.5px] font-bold text-muted-foreground"
          >
            <Search className="size-3.5" /> Buscar invitados
          </Link>
          <button
            onClick={() => setFilterOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[10.5px] font-bold text-muted-foreground"
          >
            <ListFilter className="size-3.5" /> Filtrar categoría
          </button>
        </div>
      </header>

      <div className="px-4 pb-4">
        {filtered.length === 0 ? (
          <p className="mt-16 text-center text-sm text-muted-foreground">
            Todavía no hay fotos acá. ¡Subí la primera!
          </p>
        ) : (
          filtered.map((post) => <PostCard key={post.id} post={post} activeCategory={category} />)
        )}
      </div>

      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl p-5 pb-7">
          <h4 className="font-display text-base font-bold mb-3">Filtrar por categoría</h4>
          <div className="flex flex-col gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => {
                  setCategory(f.value);
                  setFilterOpen(false);
                }}
                className={cn(
                  "w-full rounded-xl border py-2.5 px-3.5 text-left text-[13.5px] font-bold",
                  category === f.value
                    ? "bg-gold-deep border-gold-deep text-pearl"
                    : "border-border bg-background text-muted-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
