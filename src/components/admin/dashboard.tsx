"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Download, KeyRound, Trophy, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORY_LABEL } from "@/lib/format";
import {
  markWinner,
  unmarkWinner,
  adminDeletePhoto,
  adminResetGuestPassword,
  getPhotoDownloadUrl,
} from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { AdminPhotoRow, AdminGuestRow } from "@/lib/queries";

type RankRow = {
  photoId: number;
  url: string;
  count: number;
  guest: { id: number; name: string; tableLabel: string | null };
};

export function AdminDashboard({
  romantica,
  divertida,
  general,
  winners,
  allPhotos,
  allGuests,
  totalGuests,
}: {
  romantica: RankRow[];
  divertida: RankRow[];
  general: RankRow[];
  winners: { romantica: number | null; divertida: number | null };
  allPhotos: AdminPhotoRow[];
  allGuests: AdminGuestRow[];
  totalGuests: number;
}) {
  const [winnerState, setWinnerState] = useState(winners);
  const [rows, setRows] = useState(allPhotos);
  const [guestRows, setGuestRows] = useState(allGuests);
  const [filterGuest, setFilterGuest] = useState("todos");
  const [filterCategory, setFilterCategory] = useState<"todas" | "romantica" | "divertida" | "general">("todas");
  const [sortBy, setSortBy] = useState<"recientes" | "love" | "fun" | "like">("recientes");
  const [openPhoto, setOpenPhoto] = useState<AdminPhotoRow | null>(null);
  const [, startTransition] = useTransition();

  // URL firmada con Content-Disposition: attachment — un <a download>
  // apuntando directo a S3 (otro origen) se ignora y solo abre la foto.
  async function downloadPhoto(photoId: number) {
    try {
      window.location.href = await getPhotoDownloadUrl(photoId);
    } catch {
      toast.error("No se pudo descargar la foto.");
    }
  }

  const guestOptions = useMemo(
    () => [...new Set(rows.map((r) => r.guest.name))].sort((a, b) => a.localeCompare(b)),
    [rows]
  );

  // Filtros (autor / categoría) se combinan con AND; el orden siempre es de
  // más a menos reacciones en la columna elegida — sin selección de orden,
  // se queda en el orden que ya trae el server (fecha, más reciente primero).
  const visibleRows = useMemo(() => {
    let list = rows;
    if (filterGuest !== "todos") list = list.filter((r) => r.guest.name === filterGuest);
    if (filterCategory !== "todas") list = list.filter((r) => r.category === filterCategory);
    if (sortBy !== "recientes") {
      const key = sortBy === "love" ? "loveCount" : sortBy === "fun" ? "funCount" : "likeCount";
      list = [...list].sort((a, b) => b[key] - a[key]);
    }
    return list;
  }, [rows, filterGuest, filterCategory, sortBy]);

  function onMarkWinner(category: "romantica" | "divertida", photoId: number) {
    setWinnerState((prev) => ({ ...prev, [category]: photoId }));
    startTransition(async () => {
      try {
        await markWinner(category, photoId);
      } catch {
        toast.error("No se pudo marcar la ganadora.");
      }
    });
  }

  function onUnmarkWinner(category: "romantica" | "divertida") {
    setWinnerState((prev) => ({ ...prev, [category]: null }));
    startTransition(async () => {
      try {
        await unmarkWinner(category);
      } catch {
        toast.error("No se pudo revertir la ganadora.");
      }
    });
  }

  function onDelete(photoId: number): boolean {
    if (!window.confirm("¿Eliminar esta foto? No se puede deshacer.")) return false;
    setRows((prev) => prev.filter((r) => r.photoId !== photoId));
    startTransition(async () => {
      try {
        await adminDeletePhoto(photoId);
      } catch {
        toast.error("No se pudo eliminar.");
      }
    });
    return true;
  }

  function onResetPassword(guestId: number, name: string) {
    if (!window.confirm(`¿Resetear la contraseña de ${name}? En su próximo login va a tener que crear una nueva.`))
      return;
    setGuestRows((prev) => prev.map((g) => (g.id === guestId ? { ...g, hasPassword: false } : g)));
    startTransition(async () => {
      try {
        await adminResetGuestPassword(guestId);
      } catch {
        toast.error("No se pudo resetear la contraseña.");
      }
    });
  }

  return (
    <div className="min-h-svh bg-muted">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-6 py-5">
        <div>
          <h1 className="font-display text-[19px] font-semibold">Panel del novio</h1>
          <p className="text-xs text-muted-foreground">
            {totalGuests} invitados · {rows.length} fotos subidas
          </p>
        </div>
        <p className="font-script text-2xl text-wood">Y &amp; D</p>
      </header>

      <div className="mx-auto max-w-6xl space-y-8 px-6 py-7">
        <div className="grid gap-5 md:grid-cols-3">
          <RankCard
            title="Top Románticas"
            note="Ordenado por Me encanta"
            rows={romantica}
            accent="text-gold-deep"
            countAccent="text-gold-deep"
            symbol="♡"
            category="romantica"
            winnerId={winnerState.romantica}
            onMark={onMarkWinner}
            onUnmark={onUnmarkWinner}
          />
          <RankCard
            title="Top Divertidas"
            note="Ordenado por Me divierte"
            rows={divertida}
            accent="text-wood"
            countAccent="text-wood"
            symbol="☺"
            category="divertida"
            winnerId={winnerState.divertida}
            onMark={onMarkWinner}
            onUnmark={onUnmarkWinner}
          />
          <RankCard
            title="Top Generales"
            note="Ordenado por Like — solo vista, sin premio"
            rows={general}
            accent="text-muted-foreground"
            countAccent="text-muted-foreground"
            symbol="👍"
          />
        </div>

        <div>
          <div className="mb-3.5 flex flex-wrap items-end justify-between gap-3">
            <h3 className="font-display text-base font-bold">
              Todas las fotos{" "}
              <span className="font-sans text-[12px] font-normal text-muted-foreground">
                ({visibleRows.length} de {rows.length})
              </span>
            </h3>
            <div className="flex flex-wrap gap-2">
              <select
                value={filterGuest}
                onChange={(e) => setFilterGuest(e.target.value)}
                className="h-8 rounded-lg border border-border bg-card px-2.5 text-[12.5px] outline-none focus-visible:border-ring"
              >
                <option value="todos">Todos los autores</option>
                {guestOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value as typeof filterCategory)}
                className="h-8 rounded-lg border border-border bg-card px-2.5 text-[12.5px] outline-none focus-visible:border-ring"
              >
                <option value="todas">Todas las categorías</option>
                <option value="romantica">{CATEGORY_LABEL.romantica}</option>
                <option value="divertida">{CATEGORY_LABEL.divertida}</option>
                <option value="general">{CATEGORY_LABEL.general}</option>
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="h-8 rounded-lg border border-border bg-card px-2.5 text-[12.5px] outline-none focus-visible:border-ring"
              >
                <option value="recientes">Ordenar: más recientes</option>
                <option value="love">Ordenar: más ♡ Me encanta</option>
                <option value="fun">Ordenar: más ☺ Me divierte</option>
                <option value="like">Ordenar: más 👍 Like</option>
              </select>
            </div>
          </div>
          {visibleRows.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card py-14 text-center text-sm text-muted-foreground">
              {rows.length === 0 ? "Sin fotos todavía." : "Ningún resultado con esos filtros."}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {visibleRows.map((r) => (
                <div
                  key={r.photoId}
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpenPhoto(r)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpenPhoto(r)}
                  className="group relative aspect-[4/5] cursor-pointer overflow-hidden rounded-2xl border border-border bg-card shadow-[0_10px_24px_-16px_rgba(90,62,43,0.4)] transition-shadow hover:shadow-[0_16px_30px_-14px_rgba(90,62,43,0.5)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.thumbUrl}
                    alt=""
                    className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent p-2.5 pt-9">
                    <p className="truncate text-[12px] font-bold text-white">{r.guest.name}</p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-white/90">
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[9px] font-bold",
                          r.category === "romantica" && "bg-gold-deep/80",
                          r.category === "divertida" && "bg-wood/80",
                          r.category === "general" && "bg-white/20"
                        )}
                      >
                        {CATEGORY_LABEL[r.category]}
                      </span>
                      <span className="tabular-nums">♡{r.loveCount}</span>
                      <span className="tabular-nums">☺{r.funCount}</span>
                      <span className="tabular-nums">👍{r.likeCount}</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(r.photoId);
                    }}
                    title="Eliminar (admin)"
                    className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 hover:bg-wood"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="mb-3.5 font-display text-base font-bold">Invitados</h3>
          <p className="mb-3 text-[11.5px] text-muted-foreground">
            Reseteá la contraseña de alguien trabado — en su próximo ingreso vuelve a pasar por &quot;crear
            contraseña&quot;. No hay recuperación por email/SMS en esta app.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-100 text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                  <th className="px-3.5 py-3">Invitado</th>
                  <th className="px-3.5 py-3">Código</th>
                  <th className="px-3.5 py-3">Estado</th>
                  <th className="px-3.5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {guestRows.map((g) => (
                  <tr key={g.id} className="border-b border-muted last:border-0">
                    <td className="px-3.5 py-2.5 font-bold">
                      {g.name}
                      {g.tableLabel && (
                        <span className="block text-[11px] font-medium text-muted-foreground">{g.tableLabel}</span>
                      )}
                      <span className="block text-[11px] font-medium text-muted-foreground">
                        {g.email ?? "Sin correo"}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-muted-foreground">
                      {g.invitationCode}
                      <span className="text-[11px]"> · asiento {g.seatIndex}</span>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-[10.5px] font-bold",
                          g.hasPassword ? "bg-muted text-muted-foreground" : "bg-gold/15 text-gold-deep"
                        )}
                      >
                        {g.hasPassword ? "Con contraseña" : "Sin contraseña"}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5">
                      {g.hasPassword && (
                        <button
                          onClick={() => onResetPassword(g.id, g.name)}
                          title="Resetear contraseña"
                          className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground hover:border-wood hover:bg-wood hover:text-pearl"
                        >
                          <KeyRound className="size-3" />
                          Resetear
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {guestRows.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">Sin invitados registrados todavía.</p>
            )}
          </div>
        </div>
      </div>

      <Dialog open={!!openPhoto} onOpenChange={(open) => !open && setOpenPhoto(null)}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
          {openPhoto && (
            <>
              <div className="max-h-[65vh] bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={openPhoto.url} alt="" className="mx-auto max-h-[65vh] w-auto object-contain" />
              </div>
              <div className="space-y-3 p-4.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <DialogTitle>{openPhoto.guest.name}</DialogTitle>
                    {openPhoto.guest.tableLabel && (
                      <p className="text-xs text-muted-foreground">{openPhoto.guest.tableLabel}</p>
                    )}
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold",
                      openPhoto.category === "romantica" && "bg-gold-deep/15 text-gold-deep",
                      openPhoto.category === "divertida" && "bg-wood/15 text-wood",
                      openPhoto.category === "general" && "bg-muted text-muted-foreground"
                    )}
                  >
                    {CATEGORY_LABEL[openPhoto.category]}
                  </span>
                </div>
                <div className="flex gap-4 text-[13px] font-bold tabular-nums text-muted-foreground">
                  <span>♡ {openPhoto.loveCount}</span>
                  <span>☺ {openPhoto.funCount}</span>
                  <span>👍 {openPhoto.likeCount}</span>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" onClick={() => downloadPhoto(openPhoto.photoId)}>
                    <Download className="size-4" />
                    {openPhoto.hasOriginal ? "Descargar original" : "Descargar"}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (onDelete(openPhoto.photoId)) setOpenPhoto(null);
                    }}
                  >
                    <X className="size-4" />
                    Eliminar
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RankCard({
  title,
  note,
  rows,
  accent,
  countAccent,
  symbol,
  category,
  winnerId,
  onMark,
  onUnmark,
}: {
  title: string;
  note: string;
  rows: RankRow[];
  accent: string;
  countAccent: string;
  symbol: string;
  category?: "romantica" | "divertida";
  winnerId?: number | null;
  onMark?: (category: "romantica" | "divertida", photoId: number) => void;
  onUnmark?: (category: "romantica" | "divertida") => void;
}) {
  const canMark = category && onMark;

  return (
    <div className="rounded-2xl border border-border bg-card p-4.5 shadow-[0_14px_30px_-22px_rgba(90,62,43,0.35)]">
      <h3 className={cn("font-display text-base font-bold", accent)}>🏆 {title}</h3>
      <p className="mb-3 text-[11.5px] text-muted-foreground">{note}</p>
      {rows.map((r, i) => {
        const isWinner = canMark && winnerId === r.photoId;
        return (
          <div
            key={r.photoId}
            className={cn(
              "grid items-center gap-3 border-b border-muted py-2 last:border-0",
              canMark ? "grid-cols-[22px_44px_1fr_auto_auto]" : "grid-cols-[22px_44px_1fr_auto]",
              isWinner && "rounded-lg bg-gold/10"
            )}
          >
            <span className="font-display text-[13px] font-bold text-muted-foreground">{i + 1}</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.url} alt="" className="size-11 rounded-lg object-cover" />
            <span className="text-[13px] font-bold">
              {r.guest.name}
              {r.guest.tableLabel && (
                <span className="block text-[11px] font-medium text-muted-foreground">{r.guest.tableLabel}</span>
              )}
            </span>
            <span className={cn("whitespace-nowrap font-display text-[15px] font-bold tabular-nums", countAccent)}>
              {r.count} {symbol}
            </span>
            {canMark && (
              <button
                onClick={() => (isWinner ? onUnmark?.(category) : onMark(category, r.photoId))}
                title={isWinner ? "Quitar ganadora" : undefined}
                className={cn(
                  "group/win flex items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[11px] font-bold",
                  isWinner
                    ? "border-winner bg-winner text-white hover:border-destructive hover:bg-destructive"
                    : "border-gold-deep text-gold-deep hover:bg-gold-deep hover:text-pearl"
                )}
              >
                {isWinner ? (
                  <>
                    <Trophy className="size-3 group-hover/win:hidden" />
                    <X className="hidden size-3 group-hover/win:block" />
                    <span className="group-hover/win:hidden">Ganadora</span>
                    <span className="hidden group-hover/win:inline">Quitar</span>
                  </>
                ) : (
                  "Marcar ganadora"
                )}
              </button>
            )}
          </div>
        );
      })}
      {rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Sin fotos aún.</p>}
    </div>
  );
}
