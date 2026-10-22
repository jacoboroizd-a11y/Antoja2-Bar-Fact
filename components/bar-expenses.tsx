"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { formatMoney } from "@/lib/money";
type Expense = {
  id: string;
  hasAttachment: boolean;
  kind: string;
  method: string;
  amount: string;
  description: string;
  payee: string;
  reference: string;
  createdAt: string;
};
export function BarExpenses({
  expenses,
  canRecord,
}: {
  expenses: Expense[];
  canRecord: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(false);
  const pending = useRef<Record<string, unknown> | null>(null);
  return (
    <section className="panel p-5 space-y-4">
      <div>
        <h2 className="font-semibold">Gastos y compras</h2>
        <p className="text-xs text-slate-500 mt-1">
          Los pagos en efectivo se descuentan de caja. Registrar una compra no
          aumenta las existencias; registrá su entrada en Inventario.
        </p>
      </div>
      {canRecord && (
        <details>
          <summary className="cursor-pointer text-sm font-medium text-brand-700">
            + Registrar gasto o factura de compra
          </summary>
          <form
            className="mt-4 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              const form = e.currentTarget;
              setBusy(true);
              try {
                if (!pending.current) {
                  const data = new FormData(form);
                  const file = data.get("receipt") as File;
                  let attachment = "";
                  if (file?.size) {
                    if (file.size > 2 * 1024 * 1024)
                      throw Error(
                        "El comprobante debe pesar como máximo 2 MB.",
                      );
                    attachment = await new Promise<string>(
                      (resolve, reject) => {
                        const r = new FileReader();
                        r.onload = () => resolve(String(r.result));
                        r.onerror = () =>
                          reject(Error("No se pudo leer el comprobante."));
                        r.readAsDataURL(file);
                      },
                    );
                  }
                  pending.current = {
                    requestId: crypto.randomUUID(),
                    ...Object.fromEntries(
                      [...data].filter(([k]) => k !== "receipt"),
                    ),
                    attachment,
                  };
                }
                const r = await fetch("/api/bar/expense", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(pending.current),
                });
                const result = await r.json();
                if (!r.ok) {
                  if (r.status < 500) pending.current = null;
                  throw Error(result.error || "No se pudo registrar.");
                }
                pending.current = null;
                form.reset();
                toast.success("Gasto guardado e incluido en caja.");
                router.refresh();
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "No se pudo registrar.",
                );
              } finally {
                setRetry(Boolean(pending.current));
                setBusy(false);
              }
            }}
          >
            <fieldset
              disabled={busy || retry}
              className="grid sm:grid-cols-2 gap-3"
            >
              <label>
                Tipo
                <select name="kind">
                  <option value="EXPENSE">Gasto diario</option>
                  <option value="PURCHASE">Factura de compra</option>
                </select>
              </label>
              <label>
                Pagado con
                <select name="method">
                  <option value="CASH">Efectivo de caja</option>
                  <option value="CARD">Tarjeta</option>
                  <option value="BANK_TRANSFER">Transferencia</option>
                </select>
              </label>
              <label>
                Monto (C$)
                <Input
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                />
              </label>
              <label>
                Concepto
                <Input
                  name="description"
                  required
                  maxLength={200}
                  placeholder="Insumos, transporte, limpieza…"
                />
              </label>
              <label>
                Comercio o persona
                <Input name="payee" maxLength={200} />
              </label>
              <label>
                N.º de factura / referencia
                <Input name="reference" maxLength={200} />
              </label>
              <label className="sm:col-span-2">
                Comprobante (PDF, JPG o PNG · máximo 2 MB)
                <Input
                  name="receipt"
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                />
              </label>
            </fieldset>
            <Button disabled={busy} type="submit">
              {busy
                ? "Guardando…"
                : retry
                  ? "Reintentar registro"
                  : "Guardar gasto"}
            </Button>
          </form>
        </details>
      )}
      {expenses.length ? (
        <div className="divide-y">
          {expenses.map((e) => (
            <article
              key={e.id}
              className="py-3 flex flex-wrap justify-between gap-3 text-sm"
            >
              <div>
                <strong>{e.description}</strong>
                <p className="text-xs text-slate-500 mt-1">
                  {e.kind === "PURCHASE" ? "Compra" : "Gasto"} ·{" "}
                  {e.method === "CASH"
                    ? "Efectivo"
                    : e.method === "CARD"
                      ? "Tarjeta"
                      : "Transferencia"}
                  {e.payee && ` · ${e.payee}`}
                  {e.reference && ` · ${e.reference}`}
                </p>
                {e.hasAttachment && (
                  <a
                    className="text-xs text-brand-700 underline"
                    href={`/api/bar/expenses/${e.id}/receipt`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ver comprobante
                  </a>
                )}
              </div>
              <strong>{formatMoney(e.amount)}</strong>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          Sin gastos registrados en esta jornada.
        </p>
      )}
    </section>
  );
}
