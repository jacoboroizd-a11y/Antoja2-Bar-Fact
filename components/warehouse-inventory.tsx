"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import type { Snapshot } from "./bar-workspace";
export function WarehouseInventory({
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
  const products = s.products.filter((p) => p.trackStock);
  const [id, setId] = useState(products[0]?.id || "");
  const [boxes, setBoxes] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [pack, setPack] = useState(String(products[0]?.packSize || 24));
  const [retry, setRetry] = useState(false);
  const request = useRef<Record<string, unknown> | null>(null);
  const product = products.find((p) => p.id === id);
  const units = Number(quantity || 0) * (boxes ? Number(pack || 0) : 1);
  return (
    <div className="space-y-4">
      <section className="panel p-5">
        <h2 className="font-semibold">Almacén y existencias para vender</h2>
        <p className="text-xs text-slate-500 mt-2">
          Comprás para el almacén y trasladás lo necesario al área de venta.
          Vender descuenta solo del área de venta, nunca del almacén.
        </p>
        <div className="overflow-x-auto mt-3">
          <table className="table w-full">
            <thead>
              <tr>
                {["Producto", "Almacén", "Para vender", "Total"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.product.name}
                    <small className="block text-slate-500">
                      {p.product.unit}
                      {p.packSize > 1 ? ` · ${p.packSize} por caja` : ""}
                    </small>
                  </td>
                  <td>{Number(p.warehouseStock)}</td>
                  <td>{Number(p.stock)}</td>
                  <td>{Number(p.warehouseStock) + Number(p.stock)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!products.length && (
          <p className="text-sm text-slate-500 mt-3">
            Primero agregá una bebida en Menú o un ingrediente en el módulo
            opcional.
          </p>
        )}
      </section>
      {canManage && products.length > 0 && (
        <section className="panel p-5 space-y-3">
          <h2 className="font-semibold">Compra o traslado</h2>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              try {
                request.current ||= {
                  ...Object.fromEntries(new FormData(form)),
                  productId: id,
                  quantity,
                  boxes,
                  packSize: Number(pack),
                  requestId: crypto.randomUUID(),
                };
                await command("warehouse", request.current);
                request.current = null;
                toast.success("Movimiento guardado.");
              } catch {
              } finally {
                setRetry(Boolean(request.current));
              }
            }}
          >
            <fieldset
              disabled={busy || retry}
              className="grid sm:grid-cols-2 gap-3"
            >
              <label>
                Producto
                <select
                  value={id}
                  onChange={(e) => {
                    setId(e.target.value);
                    setPack(
                      String(
                        products.find((p) => p.id === e.target.value)
                          ?.packSize || 24,
                      ),
                    );
                  }}
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.product.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                ¿Qué vas a hacer?
                <select name="operation">
                  <option value="PURCHASE">Compra → almacén</option>
                  <option value="TO_SALE">Almacén → para vender</option>
                  <option value="TO_WAREHOUSE">Devolver al almacén</option>
                  <option value="LOSS">Pérdida o merma del almacén</option>
                </select>
              </label>
              <label>
                Cantidad
                <Input
                  required
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </label>
              <label>
                Ingresar cantidad en
                <select
                  value={boxes ? "boxes" : "units"}
                  onChange={(e) => setBoxes(e.target.value === "boxes")}
                >
                  <option value="units">
                    {product?.product.unit || "Unidades"}
                  </option>
                  <option value="boxes">Cajas</option>
                </select>
              </label>
              {boxes && (
                <label>
                  Unidades por caja
                  <Input
                    type="number"
                    required
                    min="1"
                    max="1000"
                    step="1"
                    value={pack}
                    onChange={(e) => setPack(e.target.value)}
                  />
                </label>
              )}
              <label>
                Factura o motivo
                <Input
                  name="reason"
                  required
                  placeholder="Compra factura 123, reposición de barra…"
                />
              </label>
            </fieldset>
            <p className="text-sm font-medium text-brand-800">
              Vas a mover {Number.isFinite(units) ? units : 0}{" "}
              {product?.product.unit || "unidades"}.
            </p>
            <p className="text-xs text-slate-500">
              Este registro mueve productos. Si hubo un pago, registrá el gasto
              en Caja.
            </p>
            <Button disabled={busy}>
              {busy
                ? "Guardando…"
                : retry
                  ? "Reintentar movimiento"
                  : "Guardar movimiento"}
            </Button>
            {retry && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  request.current = null;
                  setRetry(false);
                }}
              >
                Editar datos
              </Button>
            )}
          </form>
        </section>
      )}
    </div>
  );
}
