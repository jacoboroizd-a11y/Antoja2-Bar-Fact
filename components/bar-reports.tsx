"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { formatMoney } from "@/lib/money";
import { Printer, Download } from "lucide-react";
import type { barReport } from "@/server/bar-report";
type Report = Awaited<ReturnType<typeof barReport>>;
function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | number)[][];
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
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <p className="text-sm text-slate-500 p-6">
          Sin movimientos en el período.
        </p>
      )}
    </div>
  );
}
export function BarReports({ report: r }: { report: Report }) {
  const router = useRouter();
  const [period, setPeriod] = useState(r.period);
  const m = r.metrics;
  const methods: Record<string, string> = {
    CASH: "Efectivo",
    CARD: "Tarjeta",
    BANK_TRANSFER: "Transferencia",
    COURTESY: "Cortesía",
    OTHER: "Otro",
  };
  const states: Record<string, string> = {
    OPEN: "Abierta",
    IN_PROGRESS: "En preparación",
    READY: "Lista",
    SERVED: "Servida",
    PAID: "Pagada",
    CANCELLED: "Anulada",
  };
  function csv() {
    const rows: (string | number)[][] = [
      ["Antoja2 POS", r.label],
      ["Generado", r.generatedAt],
      [],
      ["Resumen", "C$"],
      ["Ventas pagadas", m.sales],
      ["Ventas netas", m.net],
      ["Impuestos", m.tax],
      ["Propinas", m.tips],
      ["Descuentos", m.discounts],
      ["Anulaciones", m.cancelledOrders],
      ["Monto anulado", m.voidedAmount],
      ["Cobros", m.collections],
      ["Diferencia de caja", m.difference],
      [],
      ["Método", "Cobros"],
      ...r.methods.map((v) => [methods[v.method], v.total]),
      [],
      ["Producto", "Cantidad", "Neto", "Impuesto", "Total"],
      ...r.products.map((v) => [v.name, v.quantity, v.net, v.tax, v.total]),
      [],
      [
        "Jornada",
        "Orden",
        "Mesa/canal",
        "Responsable",
        "Estado",
        "Total",
        "Cobrado",
      ],
      ...r.orders.map((o) => [
        o.date,
        o.number,
        o.table,
        o.responsible,
        states[o.status],
        o.total,
        o.paid,
      ]),
    ];
    const escape = (v: string | number) =>
      '"' +
      String(v)
        .replace(/^[=+@\-]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const blob = new Blob(
      ["\uFEFF" + rows.map((row) => row.map(escape).join(",")).join("\r\n")],
      { type: "text/csv;charset=utf-8;" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Antoja2-${r.kind}-${r.period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <p className="text-xs text-brand-700 font-semibold uppercase tracking-widest">
            Antoja2 POS · Control del negocio
          </p>
          <h1 className="text-3xl font-semibold mt-2">
            Reporte {r.kind === "day" ? "diario" : "mensual"}
          </h1>
          <p className="text-sm text-slate-500 mt-2">
            {r.company} · {r.label} · America/Managua
          </p>
        </div>
        <div className="flex gap-2 no-print">
          <Button variant="outline" onClick={csv}>
            <Download size={16} />
            CSV
          </Button>
          <Button onClick={() => window.print()}>
            <Printer size={16} />
            Imprimir / PDF
          </Button>
        </div>
      </div>
      <div className="no-print panel p-5 flex flex-wrap gap-4 items-end">
        <div className="flex gap-2">
          <Button variant={r.kind === "day" ? "default" : "outline"} asChild>
            <Link href="/bar/reports?kind=day">Diario</Link>
          </Button>
          <Button variant={r.kind === "month" ? "default" : "outline"} asChild>
            <Link href="/bar/reports?kind=month">Mensual</Link>
          </Button>
        </div>
        <form
          className="flex items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(
              "/bar/reports?kind=" +
                r.kind +
                "&period=" +
                encodeURIComponent(period),
            );
          }}
        >
          <label>
            {r.kind === "day" ? "Fecha operativa" : "Mes"}
            <Input
              type={r.kind === "day" ? "date" : "month"}
              value={period}
              required
              onChange={(e) => setPeriod(e.target.value)}
            />
          </label>
          <Button type="submit">Consultar</Button>
        </form>
      </div>
      <p className="text-xs text-slate-500">
        Las ventas incluyen únicamente órdenes pagadas. El total incluye
        impuestos y propinas; los cobros incluyen abonos y cortesías. Una
        jornada de viernes conserva las ventas del sábado antes de las 00:30.
      </p>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          ["Ventas pagadas", m.sales],
          ["Ventas netas", m.net],
          ["Cobros de la jornada", m.collections],
          ["Ticket promedio", m.average],
          ["Efectivo", m.cash],
          ["Tarjeta", m.card],
          ["Transferencia", m.transfer],
          ["Diferencia de caja", m.difference],
          ["Descuentos", m.discounts],
          ["Impuestos", m.tax],
          ["Propinas", m.tips],
          ["Monto anulado", m.voidedAmount],
        ].map(([label, v]) => (
          <div key={label} className="panel p-4">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-xl font-semibold mt-3">{formatMoney(v)}</p>
          </div>
        ))}
      </div>
      <p className="panel p-4 text-sm">
        {m.paidOrders} órdenes pagadas · {m.openOrders} abiertas ·{" "}
        {m.cancelledOrders} anuladas
      </p>
      <section>
        <h2 className="font-semibold mb-3">
          Ventas por jornada y cierres de caja
        </h2>
        <Table
          headers={[
            "Jornada",
            "Estado",
            "Fondo",
            "Ventas",
            "Esperado",
            "Contado",
            "Diferencia",
          ]}
          rows={r.closings.map((d) => {
            const c = d.closeData as Record<string, unknown> | null;
            return [
              d.date,
              d.status === "OPEN" ? "Abierta" : "Cerrada",
              formatMoney(d.opening),
              c ? formatMoney(String(c.sales)) : "En curso",
              c ? formatMoney(String(c.expected)) : "—",
              c ? formatMoney(String(c.counted)) : "—",
              c ? formatMoney(String(c.difference)) : "—",
            ];
          })}
        />
      </section>
      <div className="grid xl:grid-cols-2 gap-6">
        <section>
          <h2 className="font-semibold mb-3">Métodos de pago</h2>
          <Table
            headers={["Método", "Operaciones", "Cobrado"]}
            rows={r.methods.map((v) => [
              methods[v.method],
              v.count,
              formatMoney(v.total),
            ])}
          />
        </section>
        <section>
          <h2 className="font-semibold mb-3">Ventas por empleado</h2>
          <Table
            headers={["Responsable", "Órdenes", "Ventas"]}
            rows={r.staff.map((v) => [v.name, v.orders, formatMoney(v.total)])}
          />
        </section>
      </div>
      <section>
        <h2 className="font-semibold mb-3">Productos más vendidos</h2>
        <Table
          headers={["Producto", "Cantidad", "Neto", "Impuestos", "Total"]}
          rows={r.products.map((v) => [
            v.name,
            v.quantity,
            formatMoney(v.net),
            formatMoney(v.tax),
            formatMoney(v.total),
          ])}
        />
      </section>
      <div className="grid xl:grid-cols-2 gap-6">
        <section>
          <h2 className="font-semibold mb-3">Ventas por categoría</h2>
          <Table
            headers={["Categoría", "Cantidad", "Venta neta"]}
            rows={r.categories.map((v) => [
              v.name,
              v.quantity,
              formatMoney(v.net),
            ])}
          />
        </section>
        <section>
          <h2 className="font-semibold mb-3">Cobros por hora</h2>
          <Table
            headers={["Hora", "Pagos", "Cobrado"]}
            rows={r.hourly.map((v) => [v.hour, v.count, formatMoney(v.total)])}
          />
        </section>
      </div>
      <section>
        <h2 className="font-semibold mb-3">
          Órdenes, descuentos y anulaciones
        </h2>
        <Table
          headers={[
            "Jornada",
            "Orden",
            "Mesa / canal",
            "Responsable",
            "Estado",
            "Descuento",
            "Total",
            "Cobrado",
          ]}
          rows={r.orders.map((o) => [
            o.date,
            "#" + o.number,
            o.table,
            o.responsible,
            states[o.status],
            formatMoney(o.discount),
            formatMoney(o.total),
            formatMoney(o.paid),
          ])}
        />
      </section>
      <section>
        <h2 className="font-semibold mb-3">
          Movimientos de inventario del período
        </h2>
        <Table
          headers={["Fecha", "Producto", "Tipo", "Cantidad", "Saldo", "Motivo"]}
          rows={r.movements.map((v) => [
            new Date(v.date).toLocaleString("es-NI", {
              timeZone: "America/Managua",
            }),
            v.product,
            v.type,
            v.quantity,
            v.balance,
            v.reason,
          ])}
        />
      </section>
      <p className="text-xs text-slate-400">
        Generado{" "}
        {new Date(r.generatedAt).toLocaleString("es-NI", {
          timeZone: "America/Managua",
        })}
        . Los cierres conservan su conteo y ajustes auditados.
      </p>
    </div>
  );
}
