"use client";
import { ItemCustomizer } from "./item-customizer";
import { serviceLabel, deliveryNames } from "@/lib/bar-channels";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
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
export function PosTerminal({ ctx, s }: { ctx: Context; s: Snapshot }) {
  const router = useRouter();
  const params = useSearchParams();
  const [orderId, setOrderId] = useState(params.get("order") || "");
  const [category, setCategory] = useState("ALL");
  const [menuKind, setMenuKind] = useState("");
  const [q, setQ] = useState("");
  const [panel, setPanel] = useState("menu");
  const [product, setProduct] = useState<Product | null>(null);
  const [editingItem, setEditingItem] = useState<
    Snapshot["orders"][number]["items"][number] | undefined
  >();
  const [tableId, setTableId] = useState("");
  const [channel, setChannel] = useState("");
  const [step, setStep] = useState(params.get("order") ? "menu" : "service");
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
  function reset() {
    setOrderId("");
    setTableId("");
    setChannel("");
    setDeliverySource("");
    setDeliveryReference("");
    setStep("service");
    setPanel("menu");
    setMenuKind("");
    setCategory("ALL");
    setQ("");
    setProduct(null);
    window.history.replaceState(null, "", "/bar/pos");
  }
  useEffect(() => {
    const clear = () => reset();
    window.addEventListener("antoja2-new-order", clear);
    return () => window.removeEventListener("antoja2-new-order", clear);
  }, []);

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
    if (orderId) return orderId;
    if (
      step !== "menu" ||
      !channel ||
      (channel === "TABLE" && !tableId) ||
      (channel === "DELIVERY" && !deliverySource)
    )
      throw new Error("Elegí primero el tipo de pedido y su destino.");
    const row = await command("create-order", {
      channel: tableId ? "TABLE" : channel,
      tableId: tableId || null,
      deliverySource: !tableId && channel === "DELIVERY" ? deliverySource : "",
      deliveryReference,
    });
    setOrderId(row.id);
    window.history.replaceState(null, "", "/bar/pos?order=" + row.id);
    return row.id as string;
  }
  function selectProduct(p: Product) {
    if (!writable) return;
    setProduct(p);
    setEditingItem(undefined);
  }
  const shown = s.products.filter(
    (p) =>
      p.available &&
      !p.ingredientOnly &&
      p.kind === menuKind &&
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
          <p className="text-xs font-semibold text-brand-700 uppercase tracking-widest">
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
      {step !== "menu" ? (
        <section className="panel p-5 max-w-3xl mx-auto space-y-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">
              {step === "service"
                ? "¿Qué tipo de pedido es?"
                : step === "table"
                  ? "Elegí la mesa"
                  : "¿De dónde viene el delivery?"}
            </h2>
            {step !== "service" && (
              <Button variant="ghost" onClick={() => setStep("service")}>
                Volver
              </Button>
            )}
          </div>
          {step === "service" && (
            <>
              <div className="grid sm:grid-cols-3 gap-3">
                {[
                  ["TABLE", "Mesa", "Para comer en el local"],
                  ["DELIVERY", "Delivery", "PedidosYa, WhatsApp y otros"],
                  ["PICKUP", "Para recoger", "El cliente retira en el local"],
                ].map(([key, label, detail]) => (
                  <Button
                    key={key}
                    variant="outline"
                    className="h-auto min-h-24 flex-col items-start text-left p-4 whitespace-normal"
                    onClick={() => {
                      setChannel(key);
                      setTableId("");
                      setStep(
                        key === "TABLE"
                          ? "table"
                          : key === "DELIVERY"
                            ? "delivery"
                            : "menu",
                      );
                    }}
                  >
                    <strong className="text-base">{label}</strong>
                    <span className="text-xs font-normal">{detail}</span>
                  </Button>
                ))}
              </div>
              <details>
                <summary className="text-sm text-slate-500 cursor-pointer">
                  Otros tipos de pedido
                </summary>
                <div className="flex flex-wrap gap-2 mt-3">
                  {[
                    ["TAKEAWAY", "Para llevar"],
                    ["BAR", "Barra"],
                    ["INTERNAL", "Consumo interno"],
                  ].map(([key, label]) => (
                    <Button
                      key={key}
                      variant="outline"
                      onClick={() => {
                        setChannel(key);
                        setStep("menu");
                      }}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </details>
              {orders.length > 0 && (
                <label className="border-t border-slate-100 pt-4">
                  Continuar una orden abierta
                  <select
                    aria-label="Continuar una orden abierta"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) {
                        setOrderId(e.target.value);
                        setStep("menu");
                        window.history.replaceState(
                          null,
                          "",
                          "/bar/pos?order=" + e.target.value,
                        );
                      }
                    }}
                  >
                    <option value="">Elegir orden</option>
                    {orders.map((o) => (
                      <option key={o.id} value={o.id}>
                        #{o.number} · {serviceLabel(o)} {o.table?.name || ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
          {step === "table" && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {s.tables.map((t) => {
                const existing = orders.find((o) => o.tableId === t.id);
                return (
                  <Button
                    key={t.id}
                    variant="outline"
                    className="h-auto min-h-20 flex-col"
                    onClick={() => {
                      setTableId(t.id);
                      if (existing) {
                        setOrderId(existing.id);
                        window.history.replaceState(
                          null,
                          "",
                          "/bar/pos?order=" + existing.id,
                        );
                      }
                      setStep("menu");
                    }}
                  >
                    <strong>{t.name}</strong>
                    <span className="text-xs font-normal">
                      {existing
                        ? "Continuar cuenta"
                        : t.reserved
                          ? "Reservada"
                          : `${t.seats} personas · libre`}
                    </span>
                  </Button>
                );
              })}
              {!s.tables.length && (
                <p className="text-sm text-slate-500 col-span-2">
                  No hay mesas creadas. Agregalas en Mesas para comenzar.
                </p>
              )}
            </div>
          )}
          {step === "delivery" && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Object.entries(deliveryNames).map(([key, label]) => (
                <Button
                  key={key}
                  variant="outline"
                  className="min-h-16"
                  onClick={() => {
                    setDeliverySource(key);
                    setStep("menu");
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
          )}
          {!s.day && (
            <p className="text-sm text-amber-800">
              Abrí la caja antes de comenzar a vender.
            </p>
          )}
        </section>
      ) : (
        <>
          <div className="panel p-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <strong className="text-sm">
                {order
                  ? `Orden #${order.number} · ${serviceLabel(order)} ${order.table?.name || ""}`
                  : channel === "TABLE"
                    ? s.tables.find((t) => t.id === tableId)?.name
                    : serviceLabel({ channel, deliverySource })}
              </strong>
              <p className="text-xs text-slate-500 mt-1">
                1. Tipo de pedido · 2. Destino · 3. Elegir productos
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              {order ? "Nueva orden" : "Cambiar tipo de pedido"}
            </Button>
          </div>
          {!order && channel === "DELIVERY" && (
            <label className="max-w-sm">
              Referencia del pedido (opcional)
              <Input
                value={deliveryReference}
                onChange={(e) => setDeliveryReference(e.target.value)}
                placeholder="Número de pedido o nombre"
              />
            </label>
          )}
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
              <nav
                aria-label="Secciones de productos"
                className="grid grid-cols-3 gap-2 mb-3"
              >
                {[
                  ["DRINK", "Bebidas"],
                  ["FOOD", "Comidas"],
                  ["COMBO", "Promociones"],
                ].map(([kind, label]) => (
                  <Button
                    key={kind}
                    variant={menuKind === kind ? "default" : "outline"}
                    className="px-2 min-h-12"
                    aria-pressed={menuKind === kind}
                    onClick={() => {
                      setMenuKind(kind);
                      setCategory("ALL");
                      setQ("");
                    }}
                  >
                    {label}
                  </Button>
                ))}
              </nav>
              {!menuKind && (
                <p className="text-sm text-slate-500 py-6">
                  Elegí Bebidas, Comidas o Promociones para ver sus productos.
                </p>
              )}
              {menuKind && (
                <>
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
                      Todas
                    </Button>
                    {s.categories
                      .filter(
                        (c) =>
                          c.kind === menuKind &&
                          s.products.some(
                            (p) =>
                              p.categoryId === c.id &&
                              !p.ingredientOnly &&
                              p.product.active &&
                              p.available,
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
                          !p.recipeAvailable ||
                          (p.trackStock && Number(p.stock) <= 0)
                        }
                        className="panel text-left overflow-hidden hover:border-brand-600 disabled:opacity-50 min-h-28 flex flex-col"
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
                          <span
                            className="text-brand-700 px-3 pt-3"
                            aria-hidden="true"
                          >
                            {p.kind === "DRINK" ? (
                              <Wine size={18} />
                            ) : p.kind === "FOOD" ? (
                              <UtensilsCrossed size={18} />
                            ) : (
                              <ShoppingBag size={18} />
                            )}
                          </span>
                        )}
                        <div className="p-3 flex-1">
                          <p className="font-semibold text-sm">
                            {p.product.name}
                          </p>
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                            {!p.recipeAvailable ||
                            (p.trackStock && Number(p.stock) <= 0)
                              ? "Agotado"
                              : p.product.description ||
                                p.presentation ||
                                p.category.name}
                          </p>
                          <p className="font-semibold text-brand-800 mt-3">
                            {formatMoney(p.product.price)}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                  {!shown.length && (
                    <div className="panel p-10 text-center">
                      <UtensilsCrossed className="mx-auto text-brand-600 mb-3" />
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
                </>
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
                      <span className="text-sm">
                        {formatMoney(i.unitPrice)}
                      </span>
                    </div>
                    {canBar(ctx.role, "orders") &&
                      !order.payments.length &&
                      !["PAID", "CANCELLED"].includes(order.status) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const p = s.products.find(
                              (p) => p.id === i.productId,
                            );
                            if (p) {
                              setEditingItem(i);
                              setProduct(p);
                            }
                          }}
                        >
                          Personalizar
                        </Button>
                      )}
                    {i.notes && (
                      <p className="text-xs text-amber-800 mt-2">{i.notes}</p>
                    )}
                    {writable && !order.payments.length && (
                      <button
                        className="text-xs text-red-700 mt-3 min-h-11 px-2"
                        disabled={busy}
                        onClick={async () => {
                          const reason = prompt(
                            "Motivo para retirar esta línea",
                          );
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
                      disabled={
                        busy || !order.items.some((i) => i.kind === "FOOD")
                      }
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
            <ItemCustomizer
              key={editingItem?.id || product.id}
              product={product}
              initial={editingItem}
              busy={busy}
              onClose={() => {
                setProduct(null);
                setEditingItem(undefined);
              }}
              onSave={async (data) => {
                try {
                  const id = await ensureOrder();
                  const result = await command(
                    editingItem ? "update-item" : "add-item",
                    {
                      orderId: id,
                      productId: product.id,
                      ...(editingItem ? { itemId: editingItem.id } : {}),
                      ...data,
                    },
                  );
                  setProduct(null);
                  setEditingItem(undefined);
                  toast.success("Orden actualizada.");
                  if (result.correctionDispatchId)
                    toast.success("Cambio enviado a cocina.", {
                      action: {
                        label: "Imprimir cambio",
                        onClick: () =>
                          router.push(
                            "/bar/print/kitchen/" + result.correctionDispatchId,
                          ),
                      },
                    });
                } catch {}
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
