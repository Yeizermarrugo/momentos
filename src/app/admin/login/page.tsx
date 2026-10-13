"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminLogin } from "@/app/actions/auth";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await adminLogin(password);
      if (!result.ok) {
        toast.error(result.error ?? "Error");
        return;
      }
      router.push("/admin");
      router.refresh();
    });
  }

  return (
    <main className="min-h-svh flex items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm bg-card paper-grain paper-card rounded-3xl border border-border p-6 space-y-4">
        <div className="text-center">
          <p className="font-script text-3xl text-wood leading-none">Y &amp; D</p>
          <p className="mt-1 text-[11px] tracking-[0.22em] uppercase text-muted-foreground">
            Panel del novio
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            autoFocus
            disabled={pending}
          />
        </div>
        <Button className="w-full" size="lg" onClick={submit} disabled={pending}>
          {pending ? "Entrando…" : "Entrar"}
        </Button>
      </div>
    </main>
  );
}
