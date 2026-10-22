import { serviceLabel } from "@/lib/bar-channels";
import { transaction } from "./db";
import { requireBar } from "./bar-permissions";
import type { Context } from "./auth";
import { AppError } from "./auth";
import { barPeriod } from "@/lib/bar-period";
import { amount, decimal, calculateDocument } from "@/lib/money";
export async function barReport(
  ctx: Context,
  kind: "day" | "month",
  period?: string,
) {
  requireBar(ctx, "reports");
  let p: ReturnType<typeof barPeriod>;
  try {
    p = barPeriod(kind, period);
  } catch {
    throw new AppError("Seleccioná un día o mes válido.");
  }
  return transaction(async (tx) => {
    const scope = {
      companyId: ctx.companyId,
      date: { gte: p.start, lt: p.end },
    };
    const [orders, days, movements] = await Promise.all([
      tx.barOrder.findMany({
        where: { companyId: ctx.companyId, businessDay: scope },
        include: {
          items: { include: { product: { include: { category: true } } } },
          payments: true,
          table: true,
        },
        orderBy: { number: "asc" },
      }),
      tx.businessDay.findMany({ where: scope, orderBy: { date: "asc" } }),
      tx.inventoryMovement.findMany({
        where: {
          companyId: ctx.companyId,
          createdAt: {
            gte: new Date(
              p.start.toISOString().slice(0, 10) + "T00:30:00-06:00",
            ),
            lt: new Date(p.end.toISOString().slice(0, 10) + "T00:30:00-06:00"),
          },
        },
        include: { product: { include: { product: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    const paid = orders.filter((o) => o.status === "PAID");
    const sum = (
      field: "total" | "subtotal" | "discountTotal" | "taxTotal" | "tip",
    ) => amount(paid.reduce((n, o) => n.plus(o[field].toString()), decimal(0)));
    const payments = orders.flatMap((o) =>
      o.payments.map((payment) => ({
        ...payment,
        orderNumber: o.number,
        day: days
          .find((d) => d.id === o.businessDayId)!
          .date.toISOString()
          .slice(0, 10),
      })),
    );
    const methods = ["CASH", "CARD", "BANK_TRANSFER", "COURTESY", "OTHER"].map(
      (method) => ({
        method,
        count: payments.filter((v) => v.method === method).length,
        total: amount(
          payments
            .filter((v) => v.method === method)
            .reduce((n, v) => n.plus(v.amount.toString()), decimal(0)),
        ),
      }),
    );
    type SalesRow = {
      name: string;
      quantity: number;
      net: string;
      tax: string;
      total: string;
    };
    const products = new Map<string, SalesRow>();
    const categories = new Map<string, SalesRow>();
    const staff = new Map<
      string,
      { name: string; orders: number; total: string }
    >();
    const hourly = new Map<
      string,
      { hour: string; count: number; total: string }
    >();
    const bump = (
      map: Map<string, SalesRow>,
      key: string,
      name: string,
      q: number,
      net: string,
      tax: string,
      total: string,
    ) => {
      const prev = map.get(key) || {
        name,
        quantity: 0,
        net: "0",
        tax: "0",
        total: "0",
      };
      map.set(key, {
        name,
        quantity: prev.quantity + q,
        net: amount(decimal(prev.net).plus(net)),
        tax: amount(decimal(prev.tax).plus(tax)),
        total: amount(decimal(prev.total).plus(total)),
      });
    };
    for (const o of paid) {
      const calc = calculateDocument(
        o.items.map((i) => ({
          productId: i.productId,
          description: i.name,
          quantity: String(i.quantity),
          unitPrice: i.unitPrice.toString(),
          discountRate: "0",
          taxRate: i.taxRate.toString(),
        })),
        o.discountRate.toString(),
      );
      for (const [index, i] of o.items.entries()) {
        const line = calc.items[index];
        const net = amount(decimal(line.subtotal).minus(line.discount));
        bump(
          products,
          i.productId + "|" + i.name,
          i.name,
          i.quantity,
          net,
          line.tax,
          line.total,
        );
        bump(
          categories,
          i.product.categoryId,
          i.product.category.name,
          i.quantity,
          net,
          line.tax,
          line.total,
        );
      }
      const prev = staff.get(o.responsibleId) || {
        name: o.responsibleName,
        orders: 0,
        total: "0",
      };
      staff.set(o.responsibleId, {
        name: o.responsibleName,
        orders: prev.orders + 1,
        total: amount(decimal(prev.total).plus(o.total.toString())),
      });
    }
    for (const payment of payments) {
      const hour =
        new Date(payment.createdAt).toLocaleTimeString("es-NI", {
          timeZone: "America/Managua",
          hour: "2-digit",
          hour12: false,
        }) + ":00";
      const prev = hourly.get(hour) || { hour, count: 0, total: "0" };
      hourly.set(hour, {
        hour,
        count: prev.count + 1,
        total: amount(decimal(prev.total).plus(payment.amount.toString())),
      });
    }
    const closings = days.map((d) => ({
      id: d.id,
      date: d.date.toISOString().slice(0, 10),
      status: d.status,
      openedAt: d.openedAt.toISOString(),
      closedAt: d.closedAt?.toISOString() || null,
      openedBy: d.openedBy,
      closedBy: d.closedBy,
      opening: d.opening.toFixed(2),
      closeData: d.closeData,
    }));
    const cancelled = orders.filter((o) => o.status === "CANCELLED");
    return {
      kind: p.kind,
      period: p.period,
      label: p.label,
      company: ctx.companyName,
      generatedAt: new Date().toISOString(),
      metrics: {
        sales: sum("total"),
        net: amount(decimal(sum("subtotal")).minus(sum("discountTotal"))),
        tax: sum("taxTotal"),
        discounts: sum("discountTotal"),
        tips: sum("tip"),
        paidOrders: paid.length,
        openOrders: orders.filter(
          (o) => !["PAID", "CANCELLED"].includes(o.status),
        ).length,
        cancelledOrders: cancelled.length,
        voidedAmount: amount(
          cancelled.reduce((n, o) => n.plus(o.total.toString()), decimal(0)),
        ),
        average: amount(
          paid.length ? decimal(sum("total")).div(paid.length) : 0,
        ),
        collections: amount(
          payments.reduce((n, v) => n.plus(v.amount.toString()), decimal(0)),
        ),
        cash: methods[0].total,
        card: methods[1].total,
        transfer: methods[2].total,
        difference: amount(
          days.reduce(
            (n, d) =>
              n.plus(
                d.closeData
                  ? String(
                      (d.closeData as { difference: string }).difference || "0",
                    )
                  : "0",
              ),
            decimal(0),
          ),
        ),
      },
      methods,
      products: [...products.values()].sort((a, b) =>
        decimal(b.total).comparedTo(a.total),
      ),
      categories: [...categories.values()],
      staff: [...staff.values()],
      hourly: [...hourly.values()].sort((a, b) => a.hour.localeCompare(b.hour)),
      closings,
      orders: orders.map((o) => ({
        id: o.id,
        number: o.number,
        date: days
          .find((d) => d.id === o.businessDayId)!
          .date.toISOString()
          .slice(0, 10),
        table:
          serviceLabel(o) +
          (o.table ? " · " + o.table.name : "") +
          (o.deliveryReference ? " · " + o.deliveryReference : ""),
        responsible: o.responsibleName,
        status: o.status,
        total: o.total.toFixed(2),
        discount: o.discountTotal.toFixed(2),
        paid: amount(
          o.payments.reduce((n, v) => n.plus(v.amount.toString()), decimal(0)),
        ),
      })),
      movements: movements.map((m) => ({
        date: m.createdAt.toISOString(),
        product: m.product.product.name,
        type: m.type,
        quantity: m.quantity.toString(),
        balance: m.balance.toString(),
        reason: m.reason,
      })),
    };
  });
}
