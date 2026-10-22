import { serviceLabel } from "@/lib/bar-channels";
import { notFound } from "next/navigation";
import { pageContext } from "@/server/auth";
import { requireBar } from "@/server/bar-permissions";
import { db } from "@/server/db";
import { formatMoney } from "@/lib/money";
import { PrintButton } from "@/components/print-button";
export default async function Ticket({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await pageContext();
  if (ctx.role === "KITCHEN") notFound();
  requireBar(ctx, "read");
  const order = await db.barOrder.findFirst({
    where: { id: (await params).id, companyId: ctx.companyId },
    include: { items: true, table: true, businessDay: true, payments: true },
  });
  if (!order) notFound();
  return (
    <article className="panel p-8 max-w-xl mx-auto">
      <div className="no-print mb-6">
        <PrintButton />
      </div>
      <h1 className="text-2xl font-semibold">{ctx.companyName}</h1>
      <p className="mt-2">Ticket de consumo #{order.number}</p>
      <p className="text-sm mt-2">
        {serviceLabel(order)} {order.table?.name || ""} · Jornada{" "}
        {order.businessDay.date.toISOString().slice(0, 10)}
      </p>
      <p className="text-sm mt-1">
        {order.openedAt.toLocaleString("es-NI", {
          timeZone: "America/Managua",
        })}{" "}
        · {order.responsibleName}
      </p>
      <p className="text-sm mt-1">
        {order.customerName || "Consumidor final"} · {order.status}
      </p>
      <table className="w-full text-sm my-6">
        <thead>
          <tr>
            <th className="text-left">Consumo</th>
            <th className="text-right">Precio unitario</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((i) => (
            <tr key={i.id} className="border-b">
              <td className="py-3">
                {i.quantity} × {i.name}
                <p className="text-xs">{i.notes}</p>
              </td>
              <td className="text-right">
                {formatMoney(i.unitPrice.toString())}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {[
        ["Subtotal", order.subtotal],
        ["Descuentos", order.discountTotal],
        ["Impuestos", order.taxTotal],
        ["Propina", order.tip],
        ["Total", order.total],
      ].map(([label, v]) => (
        <p className="flex justify-between py-1" key={String(label)}>
          <span>{String(label)}</span>
          <strong>{formatMoney(String(v))}</strong>
        </p>
      ))}
      <p className="text-xs text-slate-500 mt-6">
        Ticket de consumo. Solicitá tu recibo o factura al completar el pago.
      </p>
    </article>
  );
}
