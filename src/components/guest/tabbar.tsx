"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, CircleUser, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Feed", icon: Home },
  { href: "/buscar", label: "Buscar", icon: Search },
  { href: "/perfil", label: "Perfil", icon: CircleUser },
];

export function TabBar() {
  const pathname = usePathname();

  return (
    <>
      <Link
        href="/subir"
        aria-label="Subir foto"
        className="fixed z-30 right-5 bottom-20 grid place-items-center size-13 rounded-full bg-gold-deep text-pearl shadow-[0_14px_26px_-10px_rgba(140,107,61,0.7)] border-4 border-background"
      >
        <Plus className="size-6" />
      </Link>

      <nav className="fixed inset-x-0 bottom-0 z-20 h-16 border-t border-border bg-card">
        <div className="mx-auto flex h-full max-w-md items-center justify-around">
          {items.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center gap-1 text-[10px] font-bold",
                  active ? "text-gold-deep" : "text-muted-foreground"
                )}
              >
                <Icon className="size-5" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
