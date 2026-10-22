import {serviceLabel} from "@/lib/bar-channels";
import { notFound } from "next/navigation";
import { pageContext } from "@/server/auth";
import { requireBar } from "@/server/bar-permissions";
import { db } from "@/server/db";
import { ThermalDocument } from "@/components/thermal-document";
export default async function ThermalPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const ctx = await pageContext();
  requireBar(ctx, "read");
  const { kind, id } = await params;
  if (!["kitchen", "invoice"].includes(kind)) notFound();
  if (kind === "invoice" && ctx.role === "KITCHEN") notFound();
  const dispatch =
    kind === "kitchen"
      ? await db.kitchenDispatch.findFirst({
          where: { id, companyId: ctx.companyId },
          include: { order: { include: { table: true, businessDay: true } } },
        })
      : null;
  const order =
    dispatch?.order ||
    (kind === "invoice"
      ? await db.barOrder.findFirst({
          where: { id, companyId: ctx.companyId },
          include: {
            items: true,
            payments: true,
            table: true,
            businessDay: true,
            invoice: true,
          },
        })
      : null);
  if (!order) notFound();
  if (kind === "invoice" && order.status !== "PAID") notFound();
  const full =
    kind === "invoice"
      ? await db.barOrder.findUniqueOrThrow({
          where: { id: order.id },
          include: { items: true, payments: true, invoice: true },
        })
      : null;
  return (
    <ThermalDocument
      data={{
        kind,
        companyName: ctx.companyName,
        orderId: order.id,
        number: order.number,
        documentNumber:
          full?.invoice?.documentNumber ||
          "COM-" + dispatch!.id.slice(-8).toUpperCase(),
        table: serviceLabel(order)+(order.table?" · "+order.table.name:"")+(order.deliveryReference?" · Ref: "+order.deliveryReference:""),
        responsible: order.responsibleName,
        customer: order.customerName || "Consumidor final",
        date: (
          dispatch?.createdAt ||
          order.closedAt ||
          order.openedAt
        ).toISOString(),
        businessDate: order.businessDay.date.toISOString().slice(0, 10),
        notes: order.notes,
        items:
          kind === "kitchen"
            ? (dispatch!.items as {
                id: string;
                name: string;
                quantity: number;
                notes: string;
              }[])
            : full!.items.map((i) => ({
                id: i.id,
                name: i.name,
                quantity: i.quantity,
                notes: i.notes,
                unitPrice: i.unitPrice.toString(),
              })),
        subtotal: order.subtotal.toString(),
        discount: order.discountTotal.toString(),
        tax: order.taxTotal.toString(),
        tip: order.tip.toString(),
        total: order.total.toString(),
        payments:
          full?.payments.map((p) => ({
            amount: p.amount.toString(),
            method: p.method,
            person: p.person,
          })) || [],
      }}
    />
  );
}
