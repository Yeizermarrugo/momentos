"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ChevronRight } from "lucide-react";

type GuestRow = {
  id: number;
  name: string;
  tableLabel: string | null;
  initials: string;
  postCount: number;
  photoCount: number;
};

export function SearchList({ guests }: { guests: GuestRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return guests;
    return guests.filter((g) => g.name.toLowerCase().includes(q));
  }, [guests, query]);

  return (
    <div>
      <header className="px-4 pt-7 pb-4 text-center">
        <p className="font-script text-2xl text-wood leading-none">Buscar</p>
        <div className="mt-3.5 flex items-center gap-2 rounded-2xl border border-border bg-card px-3.5 py-2.5">
          <Search className="size-4 text-muted-foreground shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar invitado por nombre…"
            className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground/70"
          />
        </div>
      </header>

      <div className="px-4 pb-4 flex flex-col gap-2">
        {filtered.map((g) => (
          <Link
            key={g.id}
            href={`/perfil/${g.id}`}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-beige text-[13px] font-extrabold text-wood">
              {g.initials}
            </span>
            <span className="flex-1 leading-tight">
              <span className="block text-[13.5px] font-bold">{g.name}</span>
              <span className="block text-[11px] text-muted-foreground">
                {g.postCount} {g.postCount === 1 ? "publicación" : "publicaciones"} · {g.photoCount}{" "}
                {g.photoCount === 1 ? "foto" : "fotos"}
              </span>
            </span>
            <ChevronRight className="size-4 text-gold-deep" />
          </Link>
        ))}
        {filtered.length === 0 && (
          <p className="mt-10 text-center text-sm text-muted-foreground">Sin resultados.</p>
        )}
      </div>
    </div>
  );
}
