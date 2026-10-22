"use client";
import { serviceLabel, deliveryNames } from "@/lib/bar-channels";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  Minus,
  Search,
  UtensilsCrossed,
  Wine,
  ChefHat,
  ShoppingBag,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { formatMoney } from "@/lib/money";
import { canBar } from "@/lib/bar-permissions";
import type { Context } from "@/server/auth";
import type { Snapshot } from "./bar-workspace";
type Product = Snapshot["products"][number];
type Choice = { key: string; label: string; kind: string; price: string };
export function PosTerminal({ ctx, s }: { ctx: Context; s: Snapshot }) {
  const router = useRouter();
  const params = useSearchParams();
  const [orderId, setOrderId] = useState(params.get("order") || "");
  const [category, setCategory] = useState("ALL");
  const [q, setQ] = useState("");
  const [panel, setPanel] = useState("menu");
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [choices, setChoices] = useState<string[]>([]);
  const [tableId, setTableId] = useState("");
  const [channel, setChannel] = useState("BAR");
  const [deliverySource, setDeliverySource] = useState("DIRECT");
  const [deliveryReference, setDeliveryReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [pending, startTransition] = useTransition();
  const busy = saving || pending;
  const orders = s.orders.filter(
    (o) => !["PAID", "CANCELLED"].includes(o.status),
  );
  const order = orders.find((o) => o.id === orderId);
  const writable = canBar(ctx.role, "orders");
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(timer);
  }, [router]);
  async function command(action: string, body: Record<string, unknown>) {
    setSaving(true);
    try {
      const r = await fetch("/api/bar/" + action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      startTransition(() => router.refresh());
      return data;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo conectar.");
      throw e;
    } finally {
      setSaving(false);
    }
  }
  async function ensureOrder() {
    if (order) return order.id;
    const row = await command("create-order", {
      channel: tableId ? "TABLE" : channel,
      tableId: tableId || null,
      deliverySource: !tableId && channel === "DELIVERY" ? deliverySource : "",
      deliveryReference,
    });
    setOrderId(row.id);
    return row.id as string;
  }
  function selectProduct(p: Product) {
    if (!writable) return;
    setProduct(p);
    setQuantity(1);
    setNotes("");
    setChoices([]);
  }
  const shown = s.products.filter(
    (p) =>
      p.available &&
      p.product.active &&
      (category === "ALL" || p.categoryId === category) &&
      p.product.name.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div className="pos-terminal space-y-4">
      {s.demo && (
        <p className="bg-amber-50 rounded-xl p-3 text-xs text-amber-900">
          DEMOSTRACIÓN · Datos ficticios · Horario flexible para presentación
        </p>
      )}
      <div className="flex flex-wrap justify-between gap-3 items-center">
        <div>
          <p className="text-xs font-semibold text-emerald-700 uppercase tracking-widest">
            Antoja2 POS
          </p>
          <h1 className="text-2xl font-semibold mt-1">Tomar orden</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/bar/tables">Mesas</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/bar/orders">Órdenes y cobros</Link>
          </Button>
        </div>
      </div>
      <div className="panel p-3 flex flex-wrap gap-3 items-end">
        <label className="grow m-0">
          Orden activa
          <select
            value={orderId}
            onChange={(e) => {
              setOrderId(e.target.value);
              setPanel("menu");
            }}
          >
            <option value="">Nueva orden</option>
            {orders.map((o) => (
              <option value={o.id} key={o.id}>
                #{o.number} · {serviceLabel(o)} {o.table?.name || ""} ·{" "}
                {formatMoney(o.total)}
              </option>
            ))}
          </select>
        </label>
        {!order && (
          <>
            <label className="grow m-0">
              Mesa
              <select
                value={tableId}
                onChange={(e) => setTableId(e.target.value)}
              >
                <option value="">Sin mesa</option>
                {s.tables.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            {!tableId && (
              <label className="grow m-0">
                Servicio
                <select
                  aria-label="Servicio"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                >
                  <option value="DINE_IN">Comer en el local</option>
                  <option value="BAR">Barra</option>
                  <option value="TAKEAWAY">Para llevar</option>
                  <option value="PICKUP">Recoger en el local</option>
                  <option value="DELIVERY">Delivery</option>
                  <option value="COURTESY">Cortesía</option>
                  <option value="INTERNAL">Consumo interno</option>
                </select>
              </label>
            )}
          </>
        )}
        {!order && !tableId && channel === "DELIVERY" && (
          <>
            <label className="grow m-0">
              Origen del delivery
              <select
                value={deliverySource}
                onChange={(e) => setDeliverySource(e.target.value)}
              >
                {Object.entries(deliveryNames).map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grow m-0">
              Referencia del pedido
              <Input
                value={deliveryReference}
                onChange={(e) => setDeliveryReference(e.target.value)}
                placeholder="Número externo / contacto"
              />
            </label>
          </>
        )}
        <span
          className={`rounded-full px-3 py-2 text-xs ${s.day ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}
        >
          {s.day
            ? "Jornada " + s.day.date.slice(0, 10)
            : "Abrí caja para vender"}
        </span>
      </div>
      <div className="pos-mobile-tabs flex gap-2">
        <Button
          className="flex-1"
          variant={panel === "menu" ? "default" : "outline"}
          onClick={() => setPanel("menu")}
        >
          Menú
        </Button>
        <Button
          className="flex-1"
          variant={panel === "cart" ? "default" : "outline"}
          onClick={() => setPanel("cart")}
        >
          Cuenta · {order?.items.reduce((n, i) => n + i.quantity, 0) || 0}
        </Button>
      </div>
      <div className="pos-columns gap-5">
        <section
          className={`pos-menu ${panel === "menu" ? "" : "pos-hidden-mobile"}`}
        >
          <div className="flex items-center gap-2 mb-3">
            <Search size={18} />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar en el menú…"
              aria-label="Buscar en el menú"
            />
          </div>
          <nav
            aria-label="Categorías del menú"
            className="flex gap-2 overflow-x-auto pb-3"
          >
            <Button
              size="sm"
              variant={category === "ALL" ? "default" : "outline"}
              onClick={() => setCategory("ALL")}
            >
              Todo
            </Button>
            {s.categories
              .filter((c) =>
                s.products.some(
                  (p) => p.categoryId === c.id && p.product.active,
                ),
              )
              .map((c) => (
                <Button
                  size="sm"
                  className="shrink-0"
                  variant={category === c.id ? "default" : "outline"}
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                >
                  {c.name}
                </Button>
              ))}
          </nav>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {shown.map((p) => (
              <button
                key={p.id}
                disabled={
                  busy ||
                  !writable ||
                  !s.day ||
                  Boolean(order?.payments.length) ||
                  (p.trackStock && Number(p.stock) <= 0)
                }
                className="panel text-left overflow-hidden hover:border-emerald-600 disabled:opacity-50 min-h-36 flex flex-col"
                onClick={() => selectProduct(p)}
              >
                {p.image ? (
                  <div
                    className="h-24 bg-slate-100 bg-cover bg-center"
                    style={{
                      backgroundImage: `url(${JSON.stringify(p.image)})`,
                    }}
                  />
                ) : (
                  <div className="h-16 bg-emerald-50/80 text-emerald-700 flex items-center justify-center">
                    {p.kind === "DRINK" ? (
                      <Wine />
                    ) : p.kind === "FOOD" ? (
                      <UtensilsCrossed />
                    ) : (
                      <ShoppingBag />
                    )}
                  </div>
                )}
                <div className="p-3 flex-1">
                  <p className="font-semibold text-sm">{p.product.name}</p>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                    {p.trackStock && Number(p.stock) <= 0
                      ? "Agotado"
                      : p.product.description ||
                        p.presentation ||
                        p.category.name}
                  </p>
                  <p className="font-semibold text-emerald-800 mt-3">
                    {formatMoney(p.product.price)}
                  </p>
                </div>
              </button>
            ))}
          </div>
          {!shown.length && (
            <div className="panel p-10 text-center">
              <UtensilsCrossed className="mx-auto text-emerald-600 mb-3" />
              <p className="font-semibold">Tu menú comienza aquí</p>
              <p className="text-sm text-slate-500 mt-2">
                Agregá tus bebidas, platos y promociones desde Menú. Las
                categorías y opciones se pueden configurar desde cero.
              </p>
              {canBar(ctx.role, "catalog") && (
                <Button asChild className="mt-4">
                  <Link href="/bar/food">Configurar menú</Link>
                </Button>
              )}
            </div>
          )}
        </section>
        <aside
          className={`pos-cart panel p-5 self-start ${panel === "cart" ? "" : "pos-hidden-mobile"}`}
        >
          <h2 className="text-xl font-semibold">
            {order ? "Orden #" + order.number : "Nueva cuenta"}
          </h2>
          <p className="text-xs text-slate-500 mt-2">
            {order
              ? serviceLabel(order) +
                (order.table ? " · " + order.table.name : "")
              : "Seleccioná productos para comenzar"}
          </p>
          {order?.payments.length ? (
            <p className="rounded-xl p-3 bg-amber-50 text-sm mt-3">
              La cuenta tiene abonos. Completá el cobro desde Órdenes.
            </p>
          ) : null}
          <div className="divide-y divide-slate-100 my-4">
            {order?.items.map((i) => (
              <div key={i.id} className="py-4">
                <div className="flex justify-between gap-3">
                  <strong className="text-sm">
                    {i.quantity} × {i.name}
                  </strong>
                  <span className="text-sm">{formatMoney(i.unitPrice)}</span>
                </div>
                {i.notes && (
                  <p className="text-xs text-amber-800 mt-2">{i.notes}</p>
                )}
                {writable && !order.payments.length && (
                  <button
                    className="text-xs text-red-700 mt-3 min-h-11 px-2"
                    disabled={busy}
                    onClick={async () => {
                      const reason = prompt("Motivo para retirar esta línea");
                      if (reason)
                        try {
                          await command("remove-item", {
                            orderId: order.id,
                            itemId: i.id,
                            reason,
                          });
                        } catch {}
                    }}
                  >
                    Retirar línea
                  </button>
                )}
              </div>
            ))}
          </div>
          {!order?.items.length && (
            <p className="text-sm text-slate-500 py-8 text-center">
              Tocá un producto del menú para agregarlo.
            </p>
          )}
          <div className="border-t pt-4 space-y-2 text-sm">
            {[
              ["Subtotal", order?.subtotal],
              ["Descuentos", order?.discountTotal],
              ["Impuestos", order?.taxTotal],
              ["Propina", order?.tip],
            ].map(([l, v]) => (
              <p key={l} className="flex justify-between">
                <span>{l}</span>
                <span>{formatMoney(v || "0")}</span>
              </p>
            ))}
            <p className="flex justify-between font-bold text-xl pt-3">
              <span>Total</span>
              <span>{formatMoney(order?.total || "0")}</span>
            </p>
          </div>
          {order && (
            <div className="space-y-3 mt-5">
              {writable && (
                <Button
                  className="w-full"
                  disabled={busy || !order.items.some((i) => i.kind === "FOOD")}
                  onClick={async () => {
                    try {
                      const d = await command("dispatch", {
                        orderId: order.id,
                        requestId: crypto.randomUUID(),
                      });
                      router.push("/bar/print/kitchen/" + d.id);
                    } catch {}
                  }}
                >
                  <ChefHat size={18} />
                  Enviar a cocina
                </Button>
              )}
              <Button asChild variant="outline" className="w-full">
                <Link href={"/bar/orders?order=" + order.id}>
                  Cobrar / dividir cuenta
                  <ArrowRight size={17} />
                </Link>
              </Button>
            </div>
          )}
        </aside>
      </div>
      {product && (
        <div
          className="fixed inset-0 z-50 bg-black/40 p-3 flex items-center justify-center"
          onClick={() => setProduct(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={"Personalizar " + product.product.name}
            className="bg-white rounded-2xl p-5 sm:p-7 w-full max-w-lg max-h-[90dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold">{product.product.name}</h2>
            <p className="text-sm text-slate-500 mt-2">
              {product.product.description}
            </p>
            <p className="font-semibold text-emerald-800 mt-3">
              {formatMoney(product.product.price)} + extras e impuestos, si
              aplica
            </p>
            <fieldset className="mt-5 space-y-2">
              <legend className="text-sm font-medium mb-2">Preparación</legend>
              {(product.customizations as Choice[]).map((c) => (
                <label
                  key={c.key}
                  className="flex gap-3 items-center border rounded-xl p-3 min-h-12 text-sm"
                >
                  <input
                    className="w-5 h-5 accent-emerald-700"
                    type="checkbox"
                    checked={choices.includes(c.key)}
                    onChange={(e) =>
                      setChoices((r) =>
                        e.target.checked
                          ? [...r, c.key]
                          : r.filter((k) => k !== c.key),
                      )
                    }
                  />
                  <span>
                    {c.kind === "REMOVE" ? "Sin " : "Extra "}
                    {c.label}
                    {Number(c.price) > 0 ? " + " + formatMoney(c.price) : ""}
                  </span>
                </label>
              ))}
            </fieldset>
            <label className="mt-4">
              Otras indicaciones
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Punto de cocción, salsa aparte…"
              />
            </label>
            <div className="flex justify-between items-center mt-4">
              <div className="flex gap-3 items-center">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Reducir cantidad"
                  disabled={quantity <= 1}
                  onClick={() => setQuantity((n) => n - 1)}
                >
                  <Minus size={18} />
                </Button>
                <span className="text-xl font-semibold">{quantity}</span>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Aumentar cantidad"
                  disabled={quantity >= 1000}
                  onClick={() => setQuantity((n) => n + 1)}
                >
                  <Plus size={18} />
                </Button>
              </div>
              <Button variant="ghost" onClick={() => setProduct(null)}>
                Cancelar
              </Button>
            </div>
            <Button
              className="mt-5 w-full"
              disabled={busy}
              onClick={async () => {
                try {
                  const id = await ensureOrder();
                  await command("add-item", {
                    orderId: id,
                    productId: product.id,
                    quantity,
                    notes,
                    choices,
                  });
                  setProduct(null);
                  toast.success("Agregado a la orden.");
                } catch {}
              }}
            >
              Agregar {quantity} a la orden
            </Button>
          </section>
        </div>
      )}
    </div>
  );
}
