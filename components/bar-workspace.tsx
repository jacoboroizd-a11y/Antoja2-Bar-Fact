"use client";
import { serviceLabel, deliveryNames } from "@/lib/bar-channels";
import {
  useEffect,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  UtensilsCrossed,
  Clock,
  Banknote,
  AlertTriangle,
  ArrowRight,
  Printer,
  Search,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { formatMoney, decimal, amount } from "@/lib/money";
import { canBar } from "@/lib/bar-permissions";
import type { Context } from "@/server/auth";
import type { barSnapshot } from "@/server/bar";
// Wire representation converts Prisma Decimal and Date to strings.
type Wire<T> = T extends string | number | boolean | null
  ? T
  : T extends Date
    ? string
    : T extends { toFixed: (digits?: number) => string }
      ? string
      : T extends Array<infer U>
        ? Wire<U>[]
        : T extends object
          ? { [K in keyof T]: Wire<T[K]> }
          : T;
export type Snapshot = Wire<Awaited<ReturnType<typeof barSnapshot>>>;
type Order = Snapshot["orders"][number];
const labels: Record<string, string> = {
  dashboard: "Dashboard",
  tables: "Mesas",
  orders: "Órdenes",
  kitchen: "Cocina",
  cash: "Caja",
  drinks: "Bebidas",
  food: "Platos",
  combos: "Promociones",
  categories: "Categorías",
  inventory: "Existencias",
  movements: "Movimientos",
  suppliers: "Proveedores",
  reports: "Reportes",
  OPEN: "Abierta",
  IN_PROGRESS: "En preparación",
  READY: "Lista",
  SERVED: "Servida",
  PAID: "Pagada",
  CANCELLED: "Anulada",
  PENDING: "Pendiente",
  PREPARING: "Preparando",
  CASH: "Efectivo",
  CARD: "Tarjeta",
  BANK_TRANSFER: "Transferencia",
  COURTESY: "Cortesía",
  OTHER: "Otros",
  DRINK: "Bebida",
  FOOD: "Plato",
  COMBO: "Promoción",
  TABLE: "Comer en el local · Mesa",
  DINE_IN: "Comer en el local",
  PICKUP: "Recoger en el local",
  BAR: "Barra",
  TAKEAWAY: "Para llevar",
  DELIVERY: "Delivery",
  INTERNAL: "Consumo interno",
};
const active = (o: Order) => !["PAID", "CANCELLED"].includes(o.status);
const fmt = (s: string) =>
  new Date(s).toLocaleString("es-NI", {
    timeZone: "America/Managua",
    dateStyle: "short",
    timeStyle: "short",
  });
const sum = (values: string[]) =>
  amount(values.reduce((n, v) => n.plus(v), decimal(0)));
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="text-xs font-medium space-y-2">
      <span className="block">{label}</span>
      {children}
    </label>
  );
}
function Pill({
  children,
  tone = "green",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${tone === "amber" ? "bg-amber-100 text-amber-900" : tone === "red" ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-900"}`}
    >
      {children}
    </span>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="panel p-10 text-center text-slate-500 text-sm">{children}</p>
  );
}
function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="panel p-5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
    </div>
  );
}
function DataRows({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="panel overflow-x-auto">
      <table className="table w-full">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((v, j) => (
                <td key={j}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <p className="p-8 text-sm text-slate-500">Sin registros.</p>
      )}
    </div>
  );
}
function Form({
  children,
  onSubmit,
  busy,
}: {
  children: ReactNode;
  onSubmit: (data: FormData) => Promise<void>;
  busy: boolean;
}) {
  return (
    <form
      className="space-y-4"
      onSubmit={async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = e.currentTarget;
        try {
          await onSubmit(new FormData(form));
          form.reset();
        } catch {}
      }}
    >
      {children}
      <Button disabled={busy} type="submit">
        {busy ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}
const value = (d: FormData, k: string) => String(d.get(k) || "");
export function BarWorkspace({
  ctx,
  initial: s,
  view,
}: {
  ctx: Context;
  initial: Snapshot;
  view: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [selected, setSelected] = useState<string | null>(params.get("order"));
  const [editingProduct, setEditingProduct] = useState<
    Snapshot["products"][number] | null
  >(null);
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("ALL");
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [payRows, setPayRows] = useState([
    { method: "CASH", amount: "", person: "", reference: "" },
  ]);
  const [payKey, setPayKey] = useState(() => crypto.randomUUID());
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(timer);
  }, [router]);
  const busy = pending || saving;
  async function command(action: string, body: Record<string, unknown>) {
    if (saving) throw new Error("Operación en curso");
    setSaving(true);
    try {
      const r = await fetch("/api/bar/" + action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "No se pudo guardar.");
      startTransition(() => router.refresh());
      return data;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo conectar.");
      throw e;
    } finally {
      setSaving(false);
    }
  }
  async function run(action: string, body: Record<string, unknown>) {
    try {
      await command(action, body);
      toast.success("Cambios guardados.");
    } catch {}
  }
  const can = (p: Parameters<typeof canBar>[1]) => canBar(ctx.role, p);
  const orders = s.orders.filter(active);
  const selectedOrder = s.orders.find((o) => o.id === selected);
  const low = s.products.filter(
    (p) => p.trackStock && decimal(p.stock).lte(p.minimum),
  );
  const current = s.orders.filter((o) => o.businessDayId === s.day?.id);
  const summary = s.summary;
  const reportOrders = s.orders.filter(
    (o) =>
      (!rangeStart || o.businessDay.date.slice(0, 10) >= rangeStart) &&
      (!rangeEnd || o.businessDay.date.slice(0, 10) <= rangeEnd),
  );
  const reportPaid = reportOrders.filter((o) => o.status === "PAID");
  const writable = can("orders");
  async function create(
    tableId: string | null,
    channel: string,
    customerId: string | null = null,
    customerName = "",
    notes = "",
    deliverySource = "",
    deliveryReference = "",
  ) {
    try {
      const order = await command("create-order", {
        tableId,
        channel,
        customerId,
        customerName,
        notes,
        deliverySource: channel === "DELIVERY" ? deliverySource : "",
        deliveryReference,
      });
      setSelected(order.id);
      router.push("/bar/orders?order=" + order.id);
    } catch {}
  }
  const kinds =
    view === "drinks" ? "DRINK" : view === "food" ? "FOOD" : "COMBO";
  const filteredProducts = s.products.filter(
    (p) =>
      (view === "inventory" || p.kind === kinds) &&
      p.product.name.toLowerCase().includes(search.toLowerCase()),
  );
  function rank(
    rows: Order[],
    mode: "product" | "category" | "employee" | "hour",
    filter?: string,
  ) {
    const map = new Map<
      string,
      { count: number; total: ReturnType<typeof decimal> }
    >();
    for (const o of rows) {
      if (mode === "employee" || mode === "hour") {
        const key =
          mode === "employee"
            ? o.responsibleName
            : new Date(o.closedAt || o.openedAt).toLocaleTimeString("es-NI", {
                timeZone: "America/Managua",
                hour: "2-digit",
                hour12: false,
              }) + ":00";
        const prev = map.get(key) || { count: 0, total: decimal(0) };
        map.set(key, {
          count: prev.count + 1,
          total: prev.total.plus(o.total),
        });
      } else
        for (const i of o.items) {
          if (filter && i.kind !== filter) continue;
          const p = s.products.find((p) => p.id === i.productId);
          const key =
            mode === "category" ? p?.category.name || "Sin categoría" : i.name;
          const prev = map.get(key) || { count: 0, total: decimal(0) };
          const net = decimal(i.unitPrice)
            .times(i.quantity)
            .times(decimal(1).minus(decimal(o.discountRate).div(100)));
          map.set(key, {
            count: prev.count + i.quantity,
            total: prev.total.plus(net),
          });
        }
    }
    return [...map]
      .sort((a, b) => b[1].total.comparedTo(a[1].total))
      .map(([key, v]) => [key, String(v.count), formatMoney(v.total)]);
  }
  const orderCards = (rows: Order[]) =>
    rows.length ? (
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {rows.map((o) => (
          <button
            key={o.id}
            onClick={() => setSelected(o.id)}
            className="panel p-5 text-left hover:border-emerald-600"
          >
            <div className="flex justify-between">
              <strong>Orden #{o.number}</strong>
              <Pill tone={o.status === "CANCELLED" ? "red" : "green"}>
                {labels[o.status]}
              </Pill>
            </div>
            <p className="text-sm mt-4">
              {serviceLabel(o)} {o.table?.name || ""} ·{" "}
              {o.customerName || "Consumidor final"}
            </p>
            <p className="text-xs text-slate-500 mt-2">
              {o.responsibleName} · {fmt(o.openedAt)}
            </p>
            <div className="flex justify-between mt-5">
              <span>
                {o.items.reduce((n, i) => n + i.quantity, 0)} artículos
              </span>
              <strong>{formatMoney(o.total)}</strong>
            </div>
          </button>
        ))}
      </div>
    ) : (
      <Empty>No hay órdenes en esta vista.</Empty>
    );
  return (
    <div className="space-y-6">
      {s.demo && (
        <p className="bg-amber-50 rounded-xl p-3 text-xs text-amber-900">
          DEMOSTRACIÓN · Empresa de prueba con horario flexible. Tus datos
          reales están separados.
        </p>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-widest text-emerald-700 uppercase mb-2">
            Antoja2 · Bar & restaurante
          </p>
          <h1 className="text-3xl font-semibold">{labels[view]}</h1>
          <p className="text-sm text-slate-500 mt-2">
            {s.day
              ? `Jornada ${s.day.date.slice(0, 10)} · Abierta desde ${fmt(s.day.openedAt)}`
              : "Sin jornada abierta"}{" "}
            · 11:30 AM – 12:30 AM
          </p>
        </div>
        <div className="flex gap-2">
          <Pill tone={s.day ? "green" : "amber"}>
            {s.day ? "Caja abierta" : "Caja cerrada"}
          </Pill>
          {writable && (
            <Button asChild size="sm">
              <Link href="/bar/pos">
                <Plus size={16} />
                Nueva orden
              </Link>
            </Button>
          )}
        </div>
      </div>
      {!s.clock.operating && (
        <p className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-sm">
          Fuera del horario de consumo. Podés cobrar pendientes y cerrar la
          jornada.
        </p>
      )}
      {view === "dashboard" && (
        <>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Metric
              label="Ventas de la jornada"
              value={formatMoney(summary?.sales || "0")}
            />
            <Metric label="Órdenes abiertas" value={orders.length} />
            <Metric
              label="Mesas ocupadas"
              value={orders.filter((o) => o.tableId).length}
            />
            <Metric
              label="Efectivo esperado"
              value={formatMoney(
                sum([s.day?.opening || "0", summary?.cash || "0"]),
              )}
            />
            <Metric
              label="Cobros en efectivo"
              value={formatMoney(summary?.cash || "0")}
            />
            <Metric
              label="Cobros con tarjeta"
              value={formatMoney(summary?.card || "0")}
            />
            <Metric
              label="Ticket promedio"
              value={formatMoney(summary?.average || "0")}
            />
            <Metric
              label="Anulaciones / descuentos"
              value={`${summary?.cancelled || 0} / ${formatMoney(summary?.discounts || "0")}`}
            />
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              ["tables", "Mesas y órdenes", "Abrí una mesa y agregá consumo."],
              ["kitchen", "Cocina", "Platos pendientes, listos y servidos."],
              [
                "cash",
                "Control de caja",
                "Apertura, conteo y cierre de jornada.",
              ],
            ].map(([v, title, desc]) => (
              <Link href={"/bar/" + v} key={v} className="panel p-6">
                <h2 className="font-semibold flex justify-between">
                  {title}
                  <ArrowRight size={18} />
                </h2>
                <p className="text-sm text-slate-500 mt-2">{desc}</p>
              </Link>
            ))}
          </div>
          {low.length > 0 && (
            <div className="panel p-5">
              <h2 className="font-semibold flex gap-2 items-center text-amber-800">
                <AlertTriangle size={18} />
                Inventario bajo · {low.length}
              </h2>
              <div className="flex gap-2 mt-4 flex-wrap">
                {low.map((p) => (
                  <Pill key={p.id} tone="amber">
                    {p.product.name}: {p.stock} {p.product.unit}
                  </Pill>
                ))}
              </div>
            </div>
          )}
          <div className="grid xl:grid-cols-2 gap-5">
            <section>
              <h2 className="font-semibold mb-4">Bebidas más vendidas</h2>
              <DataRows
                headers={["Producto", "Unidades", "Venta neta"]}
                rows={rank(
                  current.filter((o) => o.status === "PAID"),
                  "product",
                  "DRINK",
                )}
              />
            </section>
            <section>
              <h2 className="font-semibold mb-4">Platos más vendidos</h2>
              <DataRows
                headers={["Plato", "Unidades", "Venta neta"]}
                rows={rank(
                  current.filter((o) => o.status === "PAID"),
                  "product",
                  "FOOD",
                )}
              />
            </section>
          </div>
          <div className="grid xl:grid-cols-2 gap-5">
            <DataRows
              headers={["Hora de cobro", "Órdenes", "Ventas"]}
              rows={rank(
                current.filter((o) => o.status === "PAID"),
                "hour",
              )}
            />
            <DataRows
              headers={["Responsable", "Órdenes", "Ventas"]}
              rows={rank(
                current.filter((o) => o.status === "PAID"),
                "employee",
              )}
            />
          </div>
        </>
      )}
      {view === "tables" && (
        <>
          <div className="flex gap-3 text-xs">
            <Pill>Libre</Pill>
            <Pill tone="amber">Ocupada / pendiente de pago</Pill>
            <Pill tone="red">Reservada</Pill>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {s.tables.map((t) => {
              const o = orders.find((o) => o.tableId === t.id);
              return (
                <div className="panel p-5" key={t.id}>
                  <button
                    className="text-left w-full"
                    disabled={!o && !writable}
                    onClick={() =>
                      o ? setSelected(o.id) : create(t.id, "TABLE")
                    }
                  >
                    <UtensilsCrossed className="text-emerald-700 mb-4" />
                    <strong className="text-lg">{t.name}</strong>
                    <p className="text-xs text-slate-500 mt-2">
                      {t.seats} personas
                    </p>
                    <div className="mt-4">
                      <Pill tone={o ? "amber" : t.reserved ? "red" : "green"}>
                        {o
                          ? o.status === "SERVED" || o.payments.length
                            ? "Pendiente de pago"
                            : "Ocupada"
                          : t.reserved
                            ? "Reservada"
                            : "Libre"}
                      </Pill>
                    </div>
                    {o && (
                      <p className="mt-3 text-sm">
                        #{o.number} · {formatMoney(o.total)}
                      </p>
                    )}
                  </button>
                  {!o && writable && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      disabled={busy}
                      onClick={() =>
                        run("reserve", { tableId: t.id, reserved: !t.reserved })
                      }
                    >
                      {t.reserved ? "Liberar reserva" : "Reservar"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          {!s.tables.length && <Empty>Agregá las mesas para comenzar.</Empty>}
          {can("catalog") && (
            <details className="panel p-5">
              <summary className="font-medium cursor-pointer">
                Agregar mesa
              </summary>
              <div className="mt-4 max-w-lg">
                <Form
                  busy={busy}
                  onSubmit={async (d) => {
                    await command("table", {
                      name: value(d, "name"),
                      seats: value(d, "seats"),
                    });
                  }}
                >
                  <Field label="Nombre">
                    <Input name="name" required placeholder="Mesa 1" />
                  </Field>
                  <Field label="Capacidad">
                    <Input
                      name="seats"
                      type="number"
                      min="1"
                      max="100"
                      defaultValue="4"
                      required
                    />
                  </Field>
                </Form>
              </div>
            </details>
          )}
        </>
      )}
      {view === "orders" && (
        <>
          {writable && (
            <details className="panel p-5" open={!orders.length}>
              <summary className="font-medium cursor-pointer">
                Abrir nueva orden
              </summary>
              <div className="mt-4">
                <Form
                  busy={busy}
                  onSubmit={async (d) => {
                    const channel = value(d, "channel");
                    const tableId = value(d, "tableId");
                    if (channel === "TABLE" && !tableId) {
                      toast.error("Seleccioná una mesa.");
                      throw new Error();
                    }
                    await create(
                      channel === "TABLE" ? tableId : null,
                      channel,
                      value(d, "customerId") || null,
                      value(d, "customerName"),
                      value(d, "notes"),
                      value(d, "deliverySource"),
                      value(d, "deliveryReference"),
                    );
                  }}
                >
                  <div className="grid sm:grid-cols-3 gap-4">
                    <Field label="Tipo de servicio">
                      <select name="channel">
                        {[
                          "TABLE",
                          "BAR",
                          "TAKEAWAY",
                          "PICKUP",
                          "DINE_IN",
                          "DELIVERY",
                          "COURTESY",
                          "INTERNAL",
                        ].map((k) => (
                          <option value={k} key={k}>
                            {labels[k]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Mesa (si aplica)">
                      <select name="tableId">
                        <option value="">Seleccionar mesa</option>
                        {s.tables.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Origen (si es delivery)">
                      <select name="deliverySource">
                        {Object.entries(deliveryNames).map(([key, label]) => (
                          <option value={key} key={key}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Referencia del pedido">
                      <Input name="deliveryReference" />
                    </Field>
                    <Field label="Cliente registrado (opcional)">
                      <select name="customerId">
                        <option value="">Consumidor final</option>
                        {s.customers.map((c) => (
                          <option value={c.id} key={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Nombre / referencia">
                      <Input name="customerName" placeholder="Opcional" />
                    </Field>
                    <Field label="Notas">
                      <Input name="notes" />
                    </Field>
                  </div>
                </Form>
              </div>
            </details>
          )}
          <div className="flex gap-2">
            <Button
              variant={group === "ALL" ? "default" : "outline"}
              onClick={() => setGroup("ALL")}
            >
              Abiertas ({orders.length})
            </Button>
            <Button
              variant={group === "HISTORY" ? "default" : "outline"}
              onClick={() => setGroup("HISTORY")}
            >
              Historial reciente
            </Button>
          </div>
          {orderCards(
            group === "HISTORY" ? s.orders.filter((o) => !active(o)) : orders,
          )}
        </>
      )}
      {view === "kitchen" && (
        <>
          <p className="text-sm text-slate-500">
            Actualización cada 15 segundos. Los cambios se guardan por plato.
          </p>
          <div className="grid lg:grid-cols-2 xl:grid-cols-3 gap-5">
            {orders
              .filter((o) =>
                o.items.some(
                  (i) => i.kind === "FOOD" && i.kitchenStatus !== "SERVED",
                ),
              )
              .map((o) => (
                <section className="panel p-5" key={o.id}>
                  <div className="flex justify-between">
                    <h2 className="font-semibold">
                      Orden #{o.number} · {serviceLabel(o)}{" "}
                      {o.table?.name || ""}
                    </h2>
                    <Clock size={17} />
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    {fmt(o.openedAt)}
                  </p>
                  {o.items
                    .filter(
                      (i) => i.kind === "FOOD" && i.kitchenStatus !== "SERVED",
                    )
                    .map((i) => (
                      <div
                        className="border-t border-slate-100 mt-4 pt-4"
                        key={i.id}
                      >
                        <strong>
                          {i.quantity} × {i.name}
                        </strong>
                        {i.notes && (
                          <p className="text-amber-800 mt-2">{i.notes}</p>
                        )}
                        <p className="text-xs my-3">
                          {labels[i.kitchenStatus]}
                        </p>
                        {can("kitchen") && (
                          <Button
                            disabled={busy}
                            size="sm"
                            onClick={() =>
                              run("kitchen", {
                                orderId: o.id,
                                itemId: i.id,
                                status: {
                                  PENDING: "PREPARING",
                                  PREPARING: "READY",
                                  READY: "SERVED",
                                  SERVED: "SERVED",
                                }[i.kitchenStatus],
                              })
                            }
                          >
                            {i.kitchenStatus === "PENDING"
                              ? "Preparar"
                              : i.kitchenStatus === "PREPARING"
                                ? "Marcar listo"
                                : "Marcar servido"}
                          </Button>
                        )}
                      </div>
                    ))}
                </section>
              ))}
          </div>
          {!orders.some((o) =>
            o.items.some(
              (i) => i.kind === "FOOD" && i.kitchenStatus !== "SERVED",
            ),
          ) && <Empty>No hay platos pendientes.</Empty>}
        </>
      )}
      {view === "cash" && (
        <>
          <div className="grid sm:grid-cols-3 gap-4">
            <Metric
              label="Fondo inicial"
              value={formatMoney(s.day?.opening || "0")}
            />
            <Metric
              label="Efectivo cobrado"
              value={formatMoney(summary?.cash || "0")}
            />
            <Metric
              label="Efectivo esperado"
              value={formatMoney(
                sum([s.day?.opening || "0", summary?.cash || "0"]),
              )}
            />
          </div>
          {can("cash") && (
            <section className="panel p-6 max-w-2xl">
              <h2 className="font-semibold mb-4">
                {s.day ? "Cerrar jornada" : "Abrir jornada"}
              </h2>
              {s.day && (
                <p className="text-sm text-slate-500 mb-5">
                  {summary?.open || 0} órdenes pendientes. El cierre conserva
                  ventas, impuestos, propinas, anulaciones y diferencias.
                </p>
              )}
              <Form
                busy={busy}
                onSubmit={async (d) => {
                  await command(s.day ? "close" : "open", {
                    [s.day ? "counted" : "opening"]: value(d, "cash"),
                    notes: value(d, "notes"),
                    ...(!s.day
                      ? { overrideReason: value(d, "overrideReason") }
                      : {}),
                  });
                }}
              >
                <Field
                  label={
                    s.day
                      ? "Efectivo contado físicamente (C$)"
                      : "Fondo inicial (C$)"
                  }
                >
                  <Input
                    name="cash"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                  />
                </Field>
                {!s.day && ctx.role === "ADMIN" && (
                  <Field label="Motivo de segunda apertura (solo si ya hubo jornada hoy)">
                    <Input name="overrideReason" />
                  </Field>
                )}
                <Field label="Notas">
                  <textarea name="notes" />
                </Field>
              </Form>
            </section>
          )}
          {s.day && ctx.role === "ADMIN" && (
            <details className="panel p-5 max-w-2xl">
              <summary className="cursor-pointer">
                Autorizar segunda apertura
              </summary>
              <p className="text-sm text-slate-500 my-4">
                Requiere cerrar la caja anterior con conteo y todas las órdenes
                resueltas. Cada apertura conserva sus movimientos y cierre.
              </p>
              <Form
                busy={busy}
                onSubmit={async (d) => {
                  await command("open", {
                    opening: value(d, "opening"),
                    previousCounted: value(d, "counted"),
                    overrideReason: value(d, "reason"),
                  });
                }}
              >
                <Field label="Efectivo contado de la caja anterior">
                  <Input
                    name="counted"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                  />
                </Field>
                <Field label="Fondo de nueva apertura">
                  <Input
                    name="opening"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                  />
                </Field>
                <Field label="Motivo de autorización">
                  <Input name="reason" required />
                </Field>
              </Form>
            </details>
          )}
          <h2 className="font-semibold">Cierres guardados</h2>
          {s.days
            .filter((d) => d.status === "CLOSED")
            .map((d) => {
              const close = d.closeData as Record<string, unknown>;
              return (
                <details key={d.id} className="panel p-5">
                  <summary className="cursor-pointer flex flex-wrap justify-between gap-3">
                    <strong>{d.date.slice(0, 10)}</strong>
                    <span>
                      Contado {formatMoney(String(close.counted))} · Diferencia{" "}
                      {formatMoney(String(close.difference))}
                    </span>
                  </summary>
                  <div className="grid sm:grid-cols-3 gap-3 mt-5">
                    {[
                      ["Ventas", "sales"],
                      ["Efectivo", "cash"],
                      ["Tarjeta", "card"],
                      ["Transferencia", "transfer"],
                      ["Descuentos", "discounts"],
                      ["Impuestos", "tax"],
                      ["Propinas", "tips"],
                      ["Esperado", "expected"],
                      ["Ticket promedio", "average"],
                    ].map(([label, k]) => (
                      <Metric
                        key={k}
                        label={label}
                        value={formatMoney(String(close[k] || "0"))}
                      />
                    ))}
                  </div>
                  <p className="text-xs mt-4">
                    Órdenes: {String(close.orderCount)} · Anuladas:{" "}
                    {String(close.cancelled)} · Abrió: {d.openedBy} · Cerró:{" "}
                    {d.closedBy} · {d.closedAt && fmt(d.closedAt)}
                  </p>
                  {ctx.role === "ADMIN" && (
                    <details className="mt-4">
                      <summary>Corrección auditada</summary>
                      <Form
                        busy={busy}
                        onSubmit={async (data) => {
                          await command("adjust-close", {
                            dayId: d.id,
                            counted: value(data, "counted"),
                            reason: value(data, "reason"),
                          });
                        }}
                      >
                        <Field label="Conteo corregido">
                          <Input
                            name="counted"
                            type="number"
                            min="0"
                            step="0.01"
                            required
                          />
                        </Field>
                        <Field label="Motivo obligatorio">
                          <Input name="reason" required />
                        </Field>
                      </Form>
                    </details>
                  )}
                </details>
              );
            })}
        </>
      )}
      {["drinks", "food", "combos", "inventory"].includes(view) && (
        <>
          <div className="flex items-center gap-3">
            <Search size={18} />
            <Input
              aria-label="Buscar productos"
              placeholder="Buscar por nombre…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <DataRows
            headers={[
              "Producto",
              "Categoría",
              "Precio",
              "Costo",
              "Existencia / mínimo",
              "Estado",
              "",
            ]}
            rows={filteredProducts.map((p) => [
              <div key={p.id}>
                <strong>{p.product.name}</strong>
                <p className="text-xs text-slate-500">
                  {p.presentation} · {p.product.unit}
                </p>
              </div>,
              p.category.name,
              formatMoney(p.product.price),
              formatMoney(p.cost),
              p.trackStock ? (
                <Pill
                  tone={decimal(p.stock).lte(p.minimum) ? "amber" : "green"}
                >
                  {p.stock} / {p.minimum}
                </Pill>
              ) : (
                "Por receta / sin stock"
              ),
              !p.product.active
                ? "Inactivo"
                : p.available
                  ? "Disponible"
                  : "No disponible",
              can("catalog") ? (
                <Button
                  key="toggle"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    run("product", {
                      ...p,
                      ...p.product,
                      id: p.id,
                      kind: p.kind,
                      categoryId: p.categoryId,
                      cost: p.cost,
                      minimum: p.minimum,
                      supplierId: p.supplierId,
                      taxId: p.product.taxId,
                      trackStock: p.trackStock,
                      available: !p.available,
                      components: p.components.map((c) => ({
                        ingredientId: c.ingredientId,
                        quantity: c.quantity,
                      })),
                    })
                  }
                >
                  {p.available ? "No disponible" : "Habilitar"}
                </Button>
              ) : null,
            ])}
          />
          {can("catalog") && (
            <div className="panel p-5">
              <label>
                Editar producto existente
                <select
                  value={editingProduct?.id || ""}
                  onChange={(e) =>
                    setEditingProduct(
                      s.products.find((p) => p.id === e.target.value) || null,
                    )
                  }
                >
                  <option value="">Seleccionar producto</option>
                  {filteredProducts.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.product.name}
                    </option>
                  ))}
                </select>
              </label>
              {editingProduct && (
                <ProductForm
                  key={editingProduct.id}
                  initial={editingProduct}
                  s={s}
                  kind={editingProduct.kind}
                  busy={busy}
                  save={async (body) => {
                    await command("product", body);
                    setEditingProduct(null);
                  }}
                />
              )}
            </div>
          )}
          {can("catalog") && view !== "inventory" && (
            <details className="panel p-6">
              <summary className="cursor-pointer font-semibold">
                Agregar {labels[kinds].toLowerCase()}
              </summary>
              <ProductForm
                key={kinds}
                s={s}
                kind={kinds}
                busy={busy}
                save={async (body) => {
                  await command("product", body);
                }}
              />
            </details>
          )}
          {can("catalog") && view === "inventory" && (
            <section className="panel p-6 max-w-2xl">
              <h2 className="font-semibold mb-4">Entrada, salida o ajuste</h2>
              <Form
                busy={busy}
                onSubmit={async (d) => {
                  await command("stock", {
                    productId: value(d, "productId"),
                    type: value(d, "type"),
                    quantity: value(d, "quantity"),
                    direction: value(d, "direction"),
                    reason: value(d, "reason"),
                  });
                }}
              >
                <Field label="Producto">
                  <select name="productId" required>
                    {s.products
                      .filter((p) => p.trackStock)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.product.name} ({p.product.unit})
                        </option>
                      ))}
                  </select>
                </Field>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Movimiento">
                    <select name="type">
                      <option value="ENTRY">Entrada</option>
                      <option value="EXIT">Salida manual</option>
                      <option value="ADJUSTMENT">Ajuste</option>
                    </select>
                  </Field>
                  <Field label="Dirección del ajuste">
                    <select name="direction">
                      <option value="ADD">Sumar</option>
                      <option value="SUBTRACT">Restar</option>
                    </select>
                  </Field>
                </div>
                <Field label="Cantidad en unidad de inventario">
                  <Input
                    name="quantity"
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    required
                  />
                </Field>
                <Field label="Motivo obligatorio">
                  <Input name="reason" required />
                </Field>
              </Form>
            </section>
          )}
        </>
      )}
      {view === "categories" && (
        <>
          <DataRows
            headers={["Categoría", "Tipo"]}
            rows={s.categories.map((c) => [c.name, labels[c.kind]])}
          />
          {can("catalog") && (
            <section className="panel p-6 max-w-xl">
              <Form
                busy={busy}
                onSubmit={async (d) => {
                  await command("category", {
                    name: value(d, "name"),
                    kind: value(d, "kind"),
                  });
                }}
              >
                <Field label="Nombre">
                  <Input name="name" required />
                </Field>
                <Field label="Tipo">
                  <select name="kind">
                    {["DRINK", "FOOD", "COMBO"].map((k) => (
                      <option key={k} value={k}>
                        {labels[k]}
                      </option>
                    ))}
                  </select>
                </Field>
              </Form>
            </section>
          )}
        </>
      )}
      {view === "suppliers" && (
        <>
          <DataRows
            headers={["Proveedor", "Contacto", "Estado"]}
            rows={s.suppliers.map((p) => [
              p.name,
              p.contact,
              p.active ? "Activo" : "Inactivo",
            ])}
          />
          {can("catalog") && (
            <section className="panel p-6 max-w-xl">
              <Form
                busy={busy}
                onSubmit={async (d) => {
                  await command("supplier", {
                    name: value(d, "name"),
                    contact: value(d, "contact"),
                  });
                }}
              >
                <Field label="Nombre">
                  <Input name="name" required />
                </Field>
                <Field label="Contacto">
                  <Input name="contact" />
                </Field>
              </Form>
            </section>
          )}
        </>
      )}
      {view === "movements" && (
        <DataRows
          headers={[
            "Fecha",
            "Producto",
            "Tipo",
            "Cantidad",
            "Saldo",
            "Motivo",
            "Usuario",
          ]}
          rows={s.movements.map((m) => [
            fmt(m.createdAt),
            m.product.product.name,
            m.type,
            m.quantity,
            m.balance,
            m.reason,
            m.userId,
          ])}
        />
      )}
      {view === "reports" && can("reports") && (
        <>
          <p className="text-sm text-slate-500">
            Órdenes de los últimos 31 días y hasta 60 jornadas. Las fechas
            corresponden a la jornada operativa. Las ventas por producto se
            muestran netas, sin impuestos ni propina.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 max-w-xl">
            <Field label="Desde">
              <Input
                type="date"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
              />
            </Field>
            <Field label="Hasta">
              <Input
                type="date"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
              />
            </Field>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <Metric
              label="Ventas pagadas"
              value={formatMoney(sum(reportPaid.map((o) => o.total)))}
            />
            <Metric
              label="Descuentos"
              value={formatMoney(sum(reportPaid.map((o) => o.discountTotal)))}
            />
            <Metric
              label="Anulaciones"
              value={
                reportOrders.filter((o) => o.status === "CANCELLED").length
              }
            />
          </div>
          <DataRows
            headers={["Jornada", "Apertura", "Cierre", "Ventas", "Diferencia"]}
            rows={s.days
              .filter(
                (d) =>
                  (!rangeStart || d.date.slice(0, 10) >= rangeStart) &&
                  (!rangeEnd || d.date.slice(0, 10) <= rangeEnd),
              )
              .map((d) => {
                const c = d.closeData as Record<string, unknown> | null;
                return [
                  d.date.slice(0, 10),
                  fmt(d.openedAt),
                  d.closedAt ? fmt(d.closedAt) : "Abierta",
                  c ? formatMoney(String(c.sales)) : "En curso",
                  c ? formatMoney(String(c.difference)) : "—",
                ];
              })}
          />
          <div className="grid xl:grid-cols-2 gap-5">
            {(["product", "category", "employee", "hour"] as const).map(
              (mode) => (
                <DataRows
                  key={mode}
                  headers={[
                    {
                      product: "Producto",
                      category: "Categoría",
                      employee: "Empleado",
                      hour: "Hora de cobro",
                    }[mode],
                    "Cantidad",
                    "Ventas",
                  ]}
                  rows={rank(reportPaid, mode)}
                />
              ),
            )}
          </div>
          <DataRows
            headers={["Método", "Cobros"]}
            rows={["CASH", "CARD", "BANK_TRANSFER", "COURTESY", "OTHER"].map(
              (method) => [
                labels[method],
                formatMoney(
                  sum(
                    reportOrders
                      .flatMap((o) => o.payments)
                      .filter((p) => p.method === method)
                      .map((p) => p.amount),
                  ),
                ),
              ],
            )}
          />
          <Button variant="outline" onClick={() => window.print()}>
            <Printer size={16} />
            Imprimir / guardar PDF
          </Button>
        </>
      )}
      {selectedOrder && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/30 flex justify-end"
          onClick={() => setSelected(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={"Orden " + selectedOrder.number}
            className="w-full max-w-3xl bg-[#f4f7f6] overflow-y-auto p-5 sm:p-8 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs text-emerald-700">
                  {serviceLabel(selectedOrder)}{" "}
                  {selectedOrder.table?.name || ""} ·{" "}
                  {selectedOrder.responsibleName}
                </p>
                <h2 className="text-2xl font-semibold mt-2">
                  Orden #{selectedOrder.number}
                </h2>
              </div>
              <Button variant="outline" onClick={() => setSelected(null)}>
                Cerrar
              </Button>
            </div>
            <div className="mt-4 flex gap-3">
              <Pill>{labels[selectedOrder.status]}</Pill>
              <span className="text-xs text-slate-500">
                {fmt(selectedOrder.openedAt)}
              </span>
            </div>
            {selectedOrder.notes && (
              <p className="text-sm mt-4">{selectedOrder.notes}</p>
            )}
            <div className="mt-5 space-y-3">
              {selectedOrder.items.map((i) => (
                <div className="panel p-4" key={i.id}>
                  <div className="flex justify-between gap-3">
                    <div>
                      <strong>
                        {i.quantity} × {i.name}
                      </strong>
                      <p className="text-xs text-slate-500 mt-1">
                        {formatMoney(i.unitPrice)} c/u · IVA {i.taxRate}%{" "}
                        {i.kind === "FOOD" && "· " + labels[i.kitchenStatus]}
                      </p>
                      {i.notes && (
                        <p className="text-sm text-amber-800 mt-2">{i.notes}</p>
                      )}
                    </div>
                    {writable &&
                      active(selectedOrder) &&
                      !selectedOrder.payments.length && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            const reason = prompt(
                              "Motivo para quitar el producto",
                            );
                            if (reason)
                              run("remove-item", {
                                orderId: selectedOrder.id,
                                itemId: i.id,
                                reason,
                              });
                          }}
                        >
                          Quitar
                        </Button>
                      )}
                  </div>
                </div>
              ))}
            </div>
            <div className="panel p-5 mt-4 space-y-2 text-sm">
              <p className="flex justify-between">
                Subtotal<span>{formatMoney(selectedOrder.subtotal)}</span>
              </p>
              <p className="flex justify-between">
                Descuentos
                <span>−{formatMoney(selectedOrder.discountTotal)}</span>
              </p>
              <p className="flex justify-between">
                Impuestos<span>{formatMoney(selectedOrder.taxTotal)}</span>
              </p>
              <p className="flex justify-between">
                Propina<span>{formatMoney(selectedOrder.tip)}</span>
              </p>
              <p className="flex justify-between font-semibold text-xl pt-3">
                Total<span>{formatMoney(selectedOrder.total)}</span>
              </p>
              <p className="flex justify-between">
                Saldo
                <span>
                  {formatMoney(
                    decimal(selectedOrder.total).minus(
                      sum(selectedOrder.payments.map((p) => p.amount)),
                    ),
                  )}
                </span>
              </p>
            </div>
            {active(selectedOrder) &&
              !selectedOrder.payments.length &&
              writable && (
                <section className="mt-5 panel p-5">
                  <h3 className="font-semibold mb-4">Agregar consumo</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
                    {s.products
                      .filter((p) => p.available && p.product.active)
                      .slice(0, 18)
                      .map((p) => (
                        <Button
                          variant="outline"
                          key={p.id}
                          disabled={busy}
                          className="h-auto min-h-20 flex-col items-start text-left whitespace-normal p-3"
                          onClick={() =>
                            run("add-item", {
                              orderId: selectedOrder.id,
                              productId: p.id,
                              quantity: 1,
                            })
                          }
                        >
                          <span>{p.product.name}</span>
                          <span className="text-emerald-700">
                            {formatMoney(p.product.price)}
                          </span>
                        </Button>
                      ))}
                  </div>
                  <Form
                    busy={busy}
                    onSubmit={async (d) => {
                      await command("add-item", {
                        orderId: selectedOrder.id,
                        productId: value(d, "productId"),
                        quantity: value(d, "quantity"),
                        notes: value(d, "notes"),
                      });
                    }}
                  >
                    <Field label="Producto">
                      <select name="productId" required>
                        {s.products
                          .filter((p) => p.available && p.product.active)
                          .map((p) => (
                            <option value={p.id} key={p.id}>
                              {p.product.name} · {formatMoney(p.product.price)}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Cantidad">
                        <Input
                          name="quantity"
                          type="number"
                          min="1"
                          max="1000"
                          defaultValue="1"
                          required
                        />
                      </Field>
                      <Field label="Notas de preparación">
                        <Input name="notes" placeholder="Sin cebolla…" />
                      </Field>
                    </div>
                  </Form>
                </section>
              )}
            {active(selectedOrder) &&
              !selectedOrder.payments.length &&
              can("catalog") && (
                <details className="panel p-5 mt-4">
                  <summary className="cursor-pointer">
                    Descuento, propina o precio autorizado
                  </summary>
                  <Form
                    busy={busy}
                    onSubmit={async (d) => {
                      await command("terms", {
                        orderId: selectedOrder.id,
                        discountRate: value(d, "discountRate"),
                        tip: value(d, "tip"),
                        reason: value(d, "reason"),
                        ...(value(d, "itemId")
                          ? {
                              itemId: value(d, "itemId"),
                              unitPrice: value(d, "unitPrice"),
                            }
                          : {}),
                      });
                    }}
                  >
                    <Field label="Descuento global (%)">
                      <Input
                        name="discountRate"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        defaultValue={selectedOrder.discountRate}
                      />
                    </Field>
                    <Field label="Propina voluntaria (C$)">
                      <Input
                        name="tip"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={selectedOrder.tip}
                      />
                    </Field>
                    <Field label="Línea a cambiar (opcional)">
                      <select name="itemId">
                        <option value="">Conservar precios</option>
                        {selectedOrder.items.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Nuevo precio unitario">
                      <Input
                        name="unitPrice"
                        type="number"
                        min="0"
                        step="0.01"
                      />
                    </Field>
                    <Field label="Motivo">
                      <Input name="reason" required />
                    </Field>
                  </Form>
                </details>
              )}
            {active(selectedOrder) &&
              can("cash") &&
              selectedOrder.items.length > 0 && (
                <section className="panel p-5 mt-5">
                  <h3 className="font-semibold mb-2">Registrar cobro</h3>
                  <p className="text-xs text-slate-500 mb-4">
                    Dividí por método o persona. Un abono congela el consumo de
                    la orden. Moneda: C$.
                  </p>
                  <form
                    className="space-y-3"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        await command("pay", {
                          orderId: selectedOrder.id,
                          requestId: payKey,
                          payments: payRows,
                        });
                        setPayKey(crypto.randomUUID());
                        setPayRows([
                          {
                            method: "CASH",
                            amount: "",
                            person: "",
                            reference: "",
                          },
                        ]);
                        toast.success("Cobro registrado.");
                      } catch {}
                    }}
                  >
                    {payRows.map((p, index) => (
                      <div
                        key={index}
                        className="border border-slate-200 rounded-xl p-3 grid sm:grid-cols-2 gap-3"
                      >
                        <Field label="Método">
                          <select
                            value={p.method}
                            onChange={(e) =>
                              setPayRows((rows) =>
                                rows.map((r, i) =>
                                  i === index
                                    ? { ...r, method: e.target.value }
                                    : r,
                                ),
                              )
                            }
                          >
                            {[
                              "CASH",
                              "CARD",
                              "BANK_TRANSFER",
                              ...(can("catalog") ? ["COURTESY"] : []),
                              "OTHER",
                            ].map((m) => (
                              <option key={m} value={m}>
                                {labels[m]}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Monto C$">
                          <Input
                            value={p.amount}
                            type="number"
                            min="0.01"
                            step="0.01"
                            required
                            onChange={(e) =>
                              setPayRows((rows) =>
                                rows.map((r, i) =>
                                  i === index
                                    ? { ...r, amount: e.target.value }
                                    : r,
                                ),
                              )
                            }
                          />
                        </Field>
                        <Field label="Persona">
                          <Input
                            value={p.person}
                            onChange={(e) =>
                              setPayRows((rows) =>
                                rows.map((r, i) =>
                                  i === index
                                    ? { ...r, person: e.target.value }
                                    : r,
                                ),
                              )
                            }
                          />
                        </Field>
                        <Field label="Referencia">
                          <Input
                            value={p.reference}
                            onChange={(e) =>
                              setPayRows((rows) =>
                                rows.map((r, i) =>
                                  i === index
                                    ? { ...r, reference: e.target.value }
                                    : r,
                                ),
                              )
                            }
                          />
                        </Field>
                        {payRows.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() =>
                              setPayRows((rows) =>
                                rows.filter((_, i) => i !== index),
                              )
                            }
                          >
                            Quitar pago
                          </Button>
                        )}
                      </div>
                    ))}
                    <div className="flex gap-3 flex-wrap">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setPayRows((r) => [
                            ...r,
                            {
                              method: "CARD",
                              amount: "",
                              person: "",
                              reference: "",
                            },
                          ])
                        }
                      >
                        Agregar método / persona
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setPayRows((r) =>
                            r.map((p, i) =>
                              i === 0
                                ? {
                                    ...p,
                                    amount: amount(
                                      decimal(selectedOrder.total).minus(
                                        sum(
                                          selectedOrder.payments.map(
                                            (p) => p.amount,
                                          ),
                                        ),
                                      ),
                                    ),
                                  }
                                : p,
                            ),
                          )
                        }
                      >
                        Usar saldo
                      </Button>
                      <Button disabled={busy} type="submit">
                        <Banknote size={16} />
                        Registrar pago
                      </Button>
                    </div>
                  </form>
                </section>
              )}
            {selectedOrder.payments.length > 0 && (
              <section className="panel p-5 mt-4">
                <h3 className="font-semibold mb-3">Pagos y recibos</h3>
                {selectedOrder.payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex justify-between gap-3 border-t py-3 text-sm"
                  >
                    <span>
                      {labels[p.method]} · {p.person || "General"} ·{" "}
                      {formatMoney(p.amount)}
                    </span>
                    <a
                      className="text-emerald-700"
                      href={"/api/pdf/receipts/" + p.payment.receipt?.id}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {p.payment.receipt?.documentNumber} · PDF
                    </a>
                  </div>
                ))}
              </section>
            )}
            <div className="panel p-5 mt-5 space-y-3">
              <h3 className="font-semibold">Impresión térmica</h3>
              {active(selectedOrder) && writable && (
                <Button
                  disabled={busy}
                  onClick={async () => {
                    try {
                      const dispatch = await command("dispatch", {
                        orderId: selectedOrder.id,
                        requestId: crypto.randomUUID(),
                      });
                      router.push("/bar/print/kitchen/" + dispatch.id);
                    } catch {}
                  }}
                >
                  Enviar platos nuevos · Comanda de cocina
                </Button>
              )}
              <div className="flex flex-wrap gap-3">
                {selectedOrder.dispatches.map((d, i) => (
                  <Link
                    className="text-sm text-emerald-700 underline"
                    key={d.id}
                    href={"/bar/print/kitchen/" + d.id}
                  >
                    Reimprimir comanda {i + 1}
                  </Link>
                ))}
              </div>
              {selectedOrder.status === "PAID" && (
                <Button variant="outline" asChild>
                  <Link href={"/bar/print/invoice/" + selectedOrder.id}>
                    Factura restaurante · 58 / 80 mm
                  </Link>
                </Button>
              )}
            </div>
            <div className="flex gap-3 mt-5 flex-wrap">
              <Button variant="outline" asChild>
                <Link href={"/bar/ticket/" + selectedOrder.id}>
                  <Printer size={16} />
                  Ticket de consumo
                </Link>
              </Button>
              {selectedOrder.status === "PAID" &&
                can("cash") &&
                !selectedOrder.formalInvoice && (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      run("invoice", { orderId: selectedOrder.id })
                    }
                  >
                    Emitir factura de restaurante
                  </Button>
                )}
              {selectedOrder.formalInvoice && (
                <Button variant="outline" asChild>
                  <a
                    href={"/bar/print/invoice/" + selectedOrder.id}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Factura térmica
                  </a>
                </Button>
              )}
              {active(selectedOrder) &&
                can("catalog") &&
                !selectedOrder.payments.length && (
                  <Button
                    variant="destructive"
                    disabled={busy}
                    onClick={() => {
                      const reason = prompt("Motivo de anulación");
                      if (reason)
                        run("cancel", { orderId: selectedOrder.id, reason });
                    }}
                  >
                    Anular orden
                  </Button>
                )}
              {active(selectedOrder) &&
                !selectedOrder.payments.length &&
                writable &&
                selectedOrder.status !== "SERVED" && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      run("status", {
                        orderId: selectedOrder.id,
                        status: {
                          OPEN: "IN_PROGRESS",
                          IN_PROGRESS: "READY",
                          READY: "SERVED",
                          SERVED: "SERVED",
                          PAID: "SERVED",
                          CANCELLED: "SERVED",
                        }[selectedOrder.status],
                      })
                    }
                  >
                    Pasar a{" "}
                    {
                      labels[
                        {
                          OPEN: "IN_PROGRESS",
                          IN_PROGRESS: "READY",
                          READY: "SERVED",
                          SERVED: "SERVED",
                          PAID: "SERVED",
                          CANCELLED: "SERVED",
                        }[selectedOrder.status]
                      ]
                    }
                  </Button>
                )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
function ProductForm({
  s,
  kind,
  busy,
  save,
  initial,
}: {
  initial?: Snapshot["products"][number];
  s: Snapshot;
  kind: string;
  busy: boolean;
  save: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [customizations, setCustomizations] = useState<
    { key: string; label: string; kind: string; price: string }[]
  >(
    (initial?.customizations as {
      key: string;
      label: string;
      kind: string;
      price: string;
    }[]) || [],
  );
  const [parts, setParts] = useState<
    { ingredientId: string; quantity: string }[]
  >(
    initial?.components.map((c) => ({
      ingredientId: c.ingredientId,
      quantity: c.quantity,
    })) || [],
  );
  return (
    <div className="mt-5">
      <Form
        busy={busy}
        onSubmit={async (d) => {
          await save({
            ...(initial ? { id: initial.id } : {}),
            active: value(d, "active") !== "INACTIVE",
            available: value(d, "available") !== "UNAVAILABLE",
            name: value(d, "name"),
            sku: value(d, "sku"),
            description: value(d, "description"),
            kind,
            categoryId: value(d, "categoryId"),
            price: value(d, "price"),
            cost: value(d, "cost"),
            presentation: value(d, "presentation"),
            unit: value(d, "unit"),
            initialStock: value(d, "initialStock") || "0",
            minimum: value(d, "minimum") || "0",
            trackStock: kind === "DRINK",
            supplierId: value(d, "supplierId") || null,
            taxId: value(d, "taxId") || null,
            image: value(d, "image"),
            notes: value(d, "notes"),
            components: parts,
            customizations,
          });
          if (!initial) setParts([]);
        }}
      >
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[
            ["Nombre", "name"],
            ["Código", "sku"],
          ].map(([l, n]) => (
            <Field key={n} label={l}>
              <Input
                name={n}
                required
                defaultValue={initial?.product[n as "name" | "sku"] || ""}
              />
            </Field>
          ))}
          <Field label="Categoría">
            <select
              name="categoryId"
              defaultValue={initial?.categoryId || ""}
              required
            >
              <option value="">Seleccionar</option>
              {s.categories
                .filter((c) => c.kind === kind)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Precio de venta C$">
            <Input
              name="price"
              defaultValue={initial?.product.price || ""}
              type="number"
              min="0.01"
              step="0.01"
              required
            />
          </Field>
          <Field label="Costo estimado C$">
            <Input
              name="cost"
              defaultValue={initial?.cost || ""}
              type="number"
              min="0"
              step="0.01"
              required
            />
          </Field>
          <Field label="Impuesto">
            <select name="taxId" defaultValue={initial?.product.taxId || ""}>
              <option value="">Sin impuesto</option>
              {s.taxes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.rate}%
                </option>
              ))}
            </select>
          </Field>
          <Field label="Presentación">
            <Input
              name="presentation"
              defaultValue={initial?.presentation || ""}
              placeholder="Botella 355 ml"
            />
          </Field>
          <Field label="Unidad de inventario">
            <Input
              name="unit"
              defaultValue={initial?.product.unit || "unidad"}
              required
            />
          </Field>
          <Field label="Proveedor">
            <select name="supplierId" defaultValue={initial?.supplierId || ""}>
              <option value="">Sin proveedor</option>
              {s.suppliers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          {kind === "DRINK" && (
            <>
              <Field label="Existencia inicial">
                <Input
                  name="initialStock"
                  disabled={Boolean(initial)}
                  type="number"
                  min="0"
                  step="0.0001"
                  defaultValue="0"
                />
              </Field>
              <Field label="Existencia mínima">
                <Input
                  name="minimum"
                  type="number"
                  min="0"
                  step="0.0001"
                  defaultValue={initial?.minimum || "0"}
                />
              </Field>
            </>
          )}
          <Field label="Estado">
            <select
              name="active"
              defaultValue={
                initial?.product.active === false ? "INACTIVE" : "ACTIVE"
              }
            >
              <option value="ACTIVE">Activo</option>
              <option value="INACTIVE">Inactivo</option>
            </select>
          </Field>
          <Field label="Disponibilidad">
            <select
              name="available"
              defaultValue={
                initial?.available === false ? "UNAVAILABLE" : "AVAILABLE"
              }
            >
              <option value="AVAILABLE">Disponible</option>
              <option value="UNAVAILABLE">No disponible</option>
            </select>
          </Field>
          <Field label="Descripción">
            <Input
              name="description"
              defaultValue={initial?.product.description || ""}
            />
          </Field>
          <Field label="Imagen HTTPS (opcional)">
            <Input
              name="image"
              defaultValue={initial?.image || ""}
              type="url"
            />
          </Field>
          <Field label="Notas">
            <Input name="notes" defaultValue={initial?.notes || ""} />
          </Field>
        </div>
        <div className="space-y-3">
          <p className="font-semibold text-sm">
            Opciones al ordenar · retirar ingredientes o agregar extras
          </p>
          {customizations.map((c, index) => (
            <div
              key={c.key}
              className="grid sm:grid-cols-3 gap-3 border p-3 rounded-xl"
            >
              <Input
                aria-label="Ingrediente"
                placeholder="Cebolla, salsa…"
                required
                value={c.label}
                onChange={(e) =>
                  setCustomizations((rows) =>
                    rows.map((r, i) =>
                      i === index ? { ...r, label: e.target.value } : r,
                    ),
                  )
                }
              />
              <select
                value={c.kind}
                onChange={(e) =>
                  setCustomizations((rows) =>
                    rows.map((r, i) =>
                      i === index
                        ? {
                            ...r,
                            kind: e.target.value,
                            price: e.target.value === "REMOVE" ? "0" : r.price,
                          }
                        : r,
                    ),
                  )
                }
              >
                <option value="REMOVE">Retirar / sin</option>
                <option value="EXTRA">Extra</option>
              </select>
              <Input
                aria-label="Precio del extra"
                disabled={c.kind === "REMOVE"}
                value={c.price}
                type="number"
                min="0"
                step="0.01"
                onChange={(e) =>
                  setCustomizations((rows) =>
                    rows.map((r, i) =>
                      i === index ? { ...r, price: e.target.value } : r,
                    ),
                  )
                }
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setCustomizations((rows) =>
                    rows.filter((_, i) => i !== index),
                  )
                }
              >
                Quitar opción
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            type="button"
            onClick={() =>
              setCustomizations((rows) => [
                ...rows,
                {
                  key: crypto.randomUUID(),
                  label: "",
                  kind: "REMOVE",
                  price: "0",
                },
              ])
            }
          >
            Agregar opción
          </Button>
        </div>
        {kind !== "DRINK" && (
          <div className="space-y-3">
            <p className="text-sm font-medium">
              Componentes de inventario{" "}
              {kind === "COMBO" ? "(obligatorios)" : "(opcional)"}
            </p>
            {parts.map((p, index) => (
              <div key={index} className="flex gap-3">
                <select
                  required
                  value={p.ingredientId}
                  onChange={(e) =>
                    setParts((rows) =>
                      rows.map((r, i) =>
                        i === index
                          ? { ...r, ingredientId: e.target.value }
                          : r,
                      ),
                    )
                  }
                >
                  <option value="">Seleccionar ingrediente</option>
                  {s.products
                    .filter((p) => p.trackStock)
                    .map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.product.name} ({p.product.unit})
                      </option>
                    ))}
                </select>
                <Input
                  aria-label="Cantidad por producto"
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  value={p.quantity}
                  onChange={(e) =>
                    setParts((rows) =>
                      rows.map((r, i) =>
                        i === index ? { ...r, quantity: e.target.value } : r,
                      ),
                    )
                  }
                />
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() =>
                    setParts((r) => r.filter((_, i) => i !== index))
                  }
                >
                  Quitar
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setParts((r) => [...r, { ingredientId: "", quantity: "1" }])
              }
            >
              <Plus size={16} />
              Agregar componente
            </Button>
          </div>
        )}
      </Form>
    </div>
  );
}
