"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveGuestEmail } from "@/app/actions/password-reset";

const DISMISS_KEY = "momentos:email-prompt-dismissed";

// Invitados que se registraron antes de pedir correo: sin correo no pueden
// recuperar la contraseña solos. "Más tarde" lo oculta solo por esta sesión
// del navegador — vuelve a aparecer la próxima vez.
export function EmailPrompt() {
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage solo existe en el cliente
      setVisible(sessionStorage.getItem(DISMISS_KEY) !== "1");
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setVisible(false);
  }

  function save() {
    if (!email) return;
    startTransition(async () => {
      const result = await saveGuestEmail(email);
      if (result.ok) {
        toast.success("¡Listo! Guardamos tu correo.");
        setVisible(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="mx-4 mt-4 rounded-2xl border border-gold/50 bg-card p-4">
      <div className="flex items-start gap-2.5">
        <Mail className="mt-0.5 size-4 shrink-0 text-gold-deep" />
        <div className="min-w-0 flex-1 space-y-2.5">
          <p className="text-[12.5px] leading-snug">
            <b>Agregá tu correo</b> para poder recuperar tu contraseña si la olvidás.
          </p>
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="nombre@correo.com"
            disabled={pending}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={pending || !email}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss} disabled={pending}>
              Más tarde
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
