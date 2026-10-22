"use client";
import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { formatMoney } from "@/lib/money";
import type { Snapshot } from "./bar-workspace";
export function IngredientInventory({
  s,
  canManage,
  busy,
  command,
}: {
  s: Snapshot;
  canManage: boolean;
  busy: boolean;
  command: (action: string, body: Record<string, unknown>) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState<Snapshot["products"][number] | null>(
    null,
  );
  if (!s.fullInventory)
    return (
      <section className="panel p-5 space-y-3">
        <h2 className="font-semibold">Inventario de ingredientes · opcional</h2>
        <p className="text-sm text-slate-500">
          Para controlar pollo, carne, harina y otros insumos. Podés trabajar
          solo con el inventario de bebidas sin activar este módulo.
        </p>
        <p className="text-sm">
          Ejemplo: 1 lb de pollo cuesta C$10. Tu plato usa 1 lb, se vende a C$20
          y tiene C$10 de costo de ingredientes.
        </p>
        {canManage && (
          <Button
            disabled={busy}
            onClick={() => command("inventory-mode", {}).catch(() => {})}
          >
            Activar inventario de ingredientes
          </Button>
        )}
      </section>
    );
  const ingredients = s.products.filter((p) => p.ingredientOnly);
  const recipes = s.products.filter(
    (p) =>
      !p.ingredientOnly &&
      p.components.some((c) =>
        ingredients.some((i) => i.id === c.ingredientId),
      ),
  );
  return (
    <div className="space-y-4">
      <section className="panel p-5 space-y-3">
        <h2 className="font-semibold">Ingredientes y costos</h2>
        <p className="text-xs text-slate-500">
          Módulo opcional activado. Al tomar pedidos se reserva la cantidad; al
          cobrar se descuenta del saldo. Los platos sin ingredientes suficientes
          quedan agotados. Las compras de dinero se registran aparte en Caja.
        </p>
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr>
                {[
                  "Ingrediente",
                  "Saldo",
                  "Disponible para pedir",
                  "Costo por unidad",
                  "",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ingredients.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.product.name}
                    <small className="block text-slate-500">
                      {p.product.unit}
                    </small>
                  </td>
                  <td>{Number(p.stock)}</td>
                  <td>{Math.max(0, Number(p.availableStock))}</td>
                  <td>{formatMoney(p.cost)}</td>
                  <td>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(p)}
                      >
                        Editar costo
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!ingredients.length && (
          <p className="text-sm text-slate-500">Todavía no hay ingredientes.</p>
        )}
      </section>
      {canManage && (
        <details open={editing ? true : undefined} className="panel p-5">
          <summary className="font-medium cursor-pointer">
            {editing
              ? `Editar ${editing.product.name}`
              : "+ Agregar ingrediente"}
          </summary>
          <form
            className="space-y-3 mt-3"
            key={editing?.id || "new"}
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const d = new FormData(form);
              try {
                let categoryId =
                  editing?.categoryId ||
                  s.categories.find(
                    (c) => c.name === "Ingredientes" && c.kind === "FOOD",
                  )?.id;
                if (!categoryId)
                  categoryId = (
                    (await command("category", {
                      name: "Ingredientes",
                      kind: "FOOD",
                    })) as { id: string }
                  ).id;
                await command("product", {
                  ...(editing
                    ? { ...editing, ...editing.product, id: editing.id }
                    : {}),
                  name: String(d.get("name")),
                  sku:
                    editing?.product.sku ||
                    "ING-" + crypto.randomUUID().slice(0, 8),
                  kind: "FOOD",
                  ingredientOnly: true,
                  trackStock: true,
                  price: "0",
                  categoryId,
                  unit: editing?.product.unit || String(d.get("unit")),
                  cost: String(d.get("cost")),
                  initialStock: editing ? "0" : String(d.get("quantity")),
                  components: [],
                  customizations: [],
                });
                setEditing(null);
                form.reset();
                toast.success("Ingrediente guardado.");
              } catch {}
            }}
          >
            <fieldset disabled={busy} className="grid sm:grid-cols-2 gap-3">
              <label>
                Nombre
                <Input
                  name="name"
                  required
                  defaultValue={editing?.product.name || ""}
                  placeholder="Pollo"
                />
              </label>
              <label>
                Se cuenta en
                <select
                  name="unit"
                  disabled={Boolean(editing)}
                  defaultValue={editing?.product.unit || "lb"}
                >
                  {["lb", "kg", "g", "litro", "unidad"].map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </label>
              <label>
                Costo de 1 unidad (C$)
                <Input
                  name="cost"
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={editing?.cost || ""}
                  placeholder="10"
                />
              </label>
              {!editing && (
                <label>
                  Cantidad comprada
                  <Input
                    name="quantity"
                    required
                    type="number"
                    min="0"
                    step="0.0001"
                    placeholder="1"
                  />
                </label>
              )}
            </fieldset>
            <div className="flex gap-2">
              <Button disabled={busy}>Guardar ingrediente</Button>
              {editing && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditing(null)}
                >
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        </details>
      )}
      {canManage && ingredients.length > 0 && (
        <details className="panel p-5">
          <summary className="font-medium cursor-pointer">
            Registrar compra, uso o ajuste
          </summary>
          <form
            className="grid sm:grid-cols-2 gap-3 mt-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              try {
                await command("stock", Object.fromEntries(new FormData(form)));
                form.reset();
                toast.success("Movimiento guardado.");
              } catch {}
            }}
          >
            <label>
              Ingrediente
              <select name="productId">
                {ingredients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.product.name} ({p.product.unit})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Movimiento
              <select name="type">
                <option value="ENTRY">Compra / entrada</option>
                <option value="EXIT">Uso o merma / salida</option>
              </select>
            </label>
            <label>
              Cantidad
              <Input
                name="quantity"
                type="number"
                required
                min="0.0001"
                step="0.0001"
              />
            </label>
            <label>
              Motivo o factura
              <Input name="reason" required />
            </label>
            <Button disabled={busy}>Guardar movimiento</Button>
          </form>
        </details>
      )}
      <section className="panel p-5 space-y-3">
        <h2 className="font-semibold">Recetas y costo por plato</h2>
        <p className="text-xs text-slate-500">
          En Menú, editá un plato y abrí «Descontar ingredientes del inventario»
          para indicar qué cantidad usa.
        </p>
        {recipes.map((p) => (
          <div key={p.id} className="py-2 border-b border-slate-100 text-sm">
            <strong>{p.product.name}</strong>
            <p>
              Precio {formatMoney(p.product.price)} · Costo{" "}
              {formatMoney(p.cost)} ·{" "}
              {p.recipeAvailable ? "Disponible" : "Agotado por ingredientes"}
            </p>
          </div>
        ))}
        <Link href="/bar/menu" className="text-sm text-brand-700 underline">
          Editar platos y recetas
        </Link>
      </section>
    </div>
  );
}
