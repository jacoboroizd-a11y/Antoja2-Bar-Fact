"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
export function AccountPassword() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <details className="panel p-6">
      <summary className="font-semibold cursor-pointer">Mi contraseña</summary>
      <form
        className="space-y-4 mt-5"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            const r = await fetch("/api/account/password", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                current: form.get("current"),
                password: form.get("password"),
              }),
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error);
            router.push("/login");
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo conectar.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Contraseña actual
          <Input
            name="current"
            type="password"
            required
            autoComplete="current-password"
          />
        </label>
        <label>
          Nueva contraseña
          <Input
            name="password"
            type="password"
            required
            minLength={12}
            maxLength={72}
            autoComplete="new-password"
          />
        </label>
        <p className="text-xs text-slate-500">
          Al cambiarla se cerrarán tus sesiones para volver a ingresar.
        </p>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <Button disabled={busy}>Cambiar contraseña</Button>
      </form>
    </details>
  );
}
