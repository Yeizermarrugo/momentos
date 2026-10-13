"use client";

import { Suspense, useEffect, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkInvitationCode, loginGuest, registerGuest, type CodeCheckResult } from "@/app/actions/auth";

type Picked = { seatIndex: 1 | 2; name: string; hasPassword: boolean };

function LoginForm() {
  const searchParams = useSearchParams();
  const codeFromLink = searchParams.get("code") ?? "";

  const [code, setCode] = useState(codeFromLink);
  const [checked, setChecked] = useState<Extract<CodeCheckResult, { valid: true }> | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, startTransition] = useTransition();
  const autoChecked = useRef(false);

  function submitCode(codeToCheck = code) {
    if (!codeToCheck.trim()) return;
    startTransition(async () => {
      const result = await checkInvitationCode(codeToCheck);
      if (!result.valid) {
        toast.error(result.error);
        return;
      }
      setChecked(result);
    });
  }

  // Viene de "Ir a Momentos" en la invitación (?code=...) — se valida solo,
  // no hace falta que lo escriban de nuevo.
  useEffect(() => {
    if (codeFromLink && !autoChecked.current) {
      autoChecked.current = true;
      submitCode(codeFromLink);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeFromLink]);

  function pickGuest(seatIndex: 1 | 2, name: string) {
    const hasPassword = checked?.seatsWithPassword.includes(seatIndex) ?? false;
    setPicked({ seatIndex, name, hasPassword });
    setPassword("");
    setConfirmPassword("");
  }

  function submitLogin() {
    if (!picked) return;
    if (!password) return;
    startTransition(async () => {
      const result = await loginGuest(code, picked.seatIndex, password);
      if (result && !result.ok) toast.error(result.error);
    });
  }

  function submitRegister() {
    if (!picked) return;
    startTransition(async () => {
      const result = await registerGuest(code, picked.seatIndex, picked.name, password, confirmPassword);
      if (result && !result.ok) toast.error(result.error);
    });
  }

  return (
    <main className="min-h-svh flex flex-col items-center justify-center gap-8 px-6 py-10 bg-background">
      <div className="text-center space-y-1">
        <p className="text-[11px] tracking-[0.28em] uppercase text-muted-foreground">
          Yeizer &amp; Diana · 10 dic 2026
        </p>
        <h1 className="font-script text-5xl text-wood leading-none">Y &amp; D</h1>
        <p className="text-sm text-muted-foreground">Momentos — fotos de la boda</p>
      </div>

      <div className="w-full max-w-sm bg-card paper-grain paper-card rounded-3xl border border-border p-6 space-y-5">
        {!checked ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="code" className="font-display text-base font-semibold">
                Tu código de invitación
              </Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitCode()}
                placeholder="Ej: garcia-lopez"
                autoFocus
                disabled={pending}
              />
              <p className="text-xs text-muted-foreground">
                Para entrar usás el mismo código de tu invitación de boda.
              </p>
            </div>
            <Button className="w-full" size="lg" onClick={() => submitCode()} disabled={pending}>
              {pending ? "Verificando…" : "Continuar"}
            </Button>
          </>
        ) : !picked ? (
          <>
            <p className="font-display text-base font-semibold text-center">¿Quién sos vos?</p>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="lg"
                className="w-full justify-center"
                onClick={() => pickGuest(1, checked.guestName1)}
                disabled={pending}
              >
                Soy {checked.guestName1}
              </Button>
              {checked.seats >= 2 && checked.guestName2 && (
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full justify-center"
                  onClick={() => pickGuest(2, checked.guestName2!)}
                  disabled={pending}
                >
                  Soy {checked.guestName2}
                </Button>
              )}
            </div>
            <button
              type="button"
              className="text-xs text-muted-foreground underline underline-offset-2 block mx-auto"
              onClick={() => setChecked(null)}
              disabled={pending}
            >
              No es mi código
            </button>
          </>
        ) : picked.hasPassword ? (
          <>
            <p className="font-display text-base font-semibold text-center">Hola, {picked.name}</p>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm">
                Tu contraseña
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitLogin()}
                autoFocus
                disabled={pending}
              />
            </div>
            <Button className="w-full" size="lg" onClick={submitLogin} disabled={pending || !password}>
              {pending ? "Ingresando…" : "Ingresar"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              ¿Olvidaste tu contraseña? Pedile al novio que te la resetee.
            </p>
            <button
              type="button"
              className="text-xs text-muted-foreground underline underline-offset-2 block mx-auto"
              onClick={() => setPicked(null)}
              disabled={pending}
            >
              No soy yo
            </button>
          </>
        ) : (
          <>
            <p className="font-display text-base font-semibold text-center">Hola, {picked.name}</p>
            <p className="text-xs text-muted-foreground text-center">
              Primera vez acá — creá una contraseña para volver a entrar más adelante.
            </p>
            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-sm">
                Nueva contraseña
              </Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-sm">
                Repetí la contraseña
              </Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitRegister()}
                disabled={pending}
              />
            </div>
            <Button
              className="w-full"
              size="lg"
              onClick={submitRegister}
              disabled={pending || !password || !confirmPassword}
            >
              {pending ? "Creando…" : "Crear contraseña y entrar"}
            </Button>
            <button
              type="button"
              className="text-xs text-muted-foreground underline underline-offset-2 block mx-auto"
              onClick={() => setPicked(null)}
              disabled={pending}
            >
              No soy yo
            </button>
          </>
        )}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
