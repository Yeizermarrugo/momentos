"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPassword } from "@/app/actions/password-reset";

export function ResetPasswordForm({ token, name }: { token: string; name: string }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!password || !confirmPassword) return;
    startTransition(async () => {
      const result = await resetPassword(token, password, confirmPassword);
      if (result && !result.ok) toast.error(result.error);
    });
  }

  return (
    <>
      <p className="font-display text-base font-semibold text-center">Hola, {name}</p>
      <p className="text-xs text-muted-foreground text-center">Elegí tu contraseña nueva.</p>
      <div className="space-y-2">
        <Label htmlFor="new-password" className="text-sm">
          Nueva contraseña
        </Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
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
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          disabled={pending}
        />
      </div>
      <Button className="w-full" size="lg" onClick={submit} disabled={pending || !password || !confirmPassword}>
        {pending ? "Guardando…" : "Guardar y entrar"}
      </Button>
    </>
  );
}
