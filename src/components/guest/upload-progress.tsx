"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  discardUpload,
  getServerUploadsSnapshot,
  getUploadsSnapshot,
  onUploadDone,
  retryUpload,
  subscribeUploads,
} from "@/lib/upload-queue";

// Barra de subidas en curso, arriba de todo y en todas las pantallas (vive
// en el root layout). `sticky`, no `fixed` — ver Gotcha #2 en CLAUDE.md.
export function UploadProgress() {
  const router = useRouter();
  const uploads = useSyncExternalStore(subscribeUploads, getUploadsSnapshot, getServerUploadsSnapshot);

  useEffect(() => onUploadDone(() => router.refresh()), [router]);

  if (uploads.length === 0) return null;

  const hasActive = uploads.some((u) => u.status !== "error");

  return (
    <div className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto max-w-md space-y-2.5 px-4 py-3">
        {uploads.map((u) => {
          const pct = Math.floor(u.progress * 100);
          const label =
            u.status === "error"
              ? "Se cortó la subida"
              : u.status === "publishing"
                ? "Publicando…"
                : u.status === "queued"
                  ? "En espera…"
                  : `Subiendo ${u.photoCount} ${u.photoCount === 1 ? "foto" : "fotos"} en calidad original`;
          return (
            <div key={u.id} className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u.previewUrl} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2 text-[12px] font-bold">
                  <span className={u.status === "error" ? "text-destructive" : "text-wood"}>{label}</span>
                  {u.status !== "error" && <span className="tabular-nums text-muted-foreground">{pct}%</span>}
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={
                      u.status === "error"
                        ? "h-full rounded-full bg-destructive/60"
                        : "h-full rounded-full bg-gold-deep transition-[width] duration-200"
                    }
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              {u.status === "error" && (
                <div className="flex shrink-0 gap-1">
                  <Button size="icon-sm" variant="outline" aria-label="Reintentar" onClick={() => retryUpload(u.id)}>
                    <RotateCw className="size-3.5" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Descartar"
                    onClick={() => {
                      if (window.confirm("¿Descartar esta publicación? No se va a publicar.")) discardUpload(u.id);
                    }}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              )}
            </div>
          );
        })}
        {hasActive && (
          <p className="text-[11px] font-medium leading-snug text-muted-foreground">
            No cierres esta página ni bloquees el teléfono hasta que termine. Mientras tanto podés seguir navegando
            y subir más fotos.
          </p>
        )}
      </div>
    </div>
  );
}
