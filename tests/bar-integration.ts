import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db, transaction } from "../server/db";
import { barCommand, daySummary } from "../server/bar";
import { barReport } from "../server/bar-report";
import { createPayment, deletePayment, documentAction } from "../server/domain";
import { pdfDocument } from "../server/pdf";
import { detail, serialize } from "../server/queries";
import type { Context } from "../server/auth";
const companyId = "bar-test-" + randomUUID();
let ctx: Context;
const now = new Date("2026-10-23T18:00:00Z");
const midnight = new Date("2026-10-24T06:15:00Z");
let checks = 0;
const check = (condition: unknown, message: string) => {
  assert.ok(condition, message);
  checks++;
};
async function rejects(action: () => Promise<unknown>, pattern: RegExp) {
  await assert.rejects(action, pattern);
  checks++;
}
async function main() {
  await db.company.create({
    data: { id: companyId, name: "Bar Test", settings: { create: {} } },
  });
  const user = await db.user.create({
    data: {
      name: "Test bar",
      passwordHash: "not-a-login",
      memberships: { create: { companyId, role: "ADMIN" } },
    },
  });
  ctx = {
    companyId,
    userId: user.id,
    role: "ADMIN",
    companyName: "Bar Test",
    name: user.name,
  };
  const cmd = (action: string, data: unknown, time = now) =>
    barCommand(ctx, action, data, time);
  const drink = (await cmd("category", {
    name: "Cervezas",
    kind: "DRINK",
  })) as { id: string };
  const food = (await cmd("category", { name: "Comidas", kind: "FOOD" })) as {
    id: string;
  };
  const combo = (await cmd("category", { name: "Promos", kind: "COMBO" })) as {
    id: string;
  };
  const beer = (await cmd("product", {
    name: "Toña",
    sku: "T",
    kind: "DRINK",
    categoryId: drink.id,
    cost: "20",
    price: "50",
    trackStock: true,
    initialStock: "30",
    minimum: "5",
  })) as { id: string };
  const burger = (await cmd("product", {
    name: "Hamburguesa",
    sku: "H",
    kind: "FOOD",
    categoryId: food.id,
    cost: "40",
    price: "100",
    customizations: [
      { key: "onion", label: "cebolla", kind: "REMOVE", price: "0" },
    ],
  })) as { id: string };
  const bucket = (await cmd("product", {
    name: "Bucket 6",
    sku: "B",
    kind: "COMBO",
    categoryId: combo.id,
    cost: "120",
    price: "250",
    components: [{ ingredientId: beer.id, quantity: "6" }],
  })) as { id: string };
  await rejects(
    () =>
      cmd("product", {
        name: "Ajeno",
        sku: "X",
        kind: "DRINK",
        categoryId: "foreign",
        cost: "0",
        price: "1",
        trackStock: true,
      }),
    /Categoría/,
  );
  await rejects(
    () =>
      barCommand(
        { ...ctx, role: "VIEWER" },
        "stock",
        { productId: beer.id, type: "ENTRY", quantity: "10", reason: "no" },
        now,
      ),
    /permiso/,
  );
  await rejects(
    () => barCommand({ ...ctx, role: "WAITER" }, "pay", {}, now),
    /permiso/,
  );
  const table = (await cmd("table", { name: "Mesa 7", seats: 4 })) as {
    id: string;
  };
  await rejects(
    () => cmd("create-order", { channel: "TABLE", tableId: table.id }),
    /Abre una jornada/,
  );
  const day = (await cmd("open", { opening: "500", notes: "Prueba" })) as {
    id: string;
  };
  await rejects(() => cmd("open", { opening: "500" }), /Ya existe/);
  const [order, other] = (await Promise.all([
    cmd("create-order", { channel: "TABLE", tableId: table.id }),
    cmd("create-order", { channel: "TABLE", tableId: table.id }),
  ])) as { id: string }[];
  check(order.id === other.id, "abrir mesa concurrentemente no duplica orden");
  await cmd("add-item", { orderId: order.id, productId: beer.id, quantity: 3 });
  await cmd("add-item", {
    orderId: order.id,
    productId: bucket.id,
    quantity: 1,
  });
  await cmd(
    "add-item",
    {
      orderId: order.id,
      productId: burger.id,
      quantity: 2,
      choices: ["onion"],
      notes: "Salsa aparte",
    },
    midnight,
  );
  let saved = await db.barOrder.findUniqueOrThrow({
    where: { id: order.id },
    include: { items: true },
  });
  check(saved.total.equals(600), "total 3 cervezas + bucket + 2 hamburguesas");
  check(
    saved.businessDayId === day.id,
    "consumo después de medianoche conserva jornada",
  );
  const item = saved.items.find((i) => i.kind === "FOOD")!;
  check(
    item.notes.includes("Sin cebolla") && item.notes.includes("Salsa aparte"),
    "retiros y notas se conservan en cocina",
  );
  const dispatchKey = randomUUID();
  const dispatch = (await cmd("dispatch", {
    orderId: order.id,
    requestId: dispatchKey,
  })) as { id: string; items: unknown };
  const retryDispatch = (await cmd("dispatch", {
    orderId: order.id,
    requestId: dispatchKey,
  })) as { id: string };
  check(
    dispatch.id === retryDispatch.id,
    "reintento de comanda no duplica envío",
  );
  check(
    (dispatch.items as { notes: string }[])[0].notes.includes("Sin cebolla"),
    "comanda congela las modificaciones del plato",
  );
  await rejects(
    () => cmd("dispatch", { orderId: order.id, requestId: randomUUID() }),
    /platos nuevos/,
  );
  await rejects(
    () =>
      cmd("add-item", {
        orderId: order.id,
        productId: burger.id,
        quantity: 1,
        choices: ["inventada"],
      }),
    /Opciones/,
  );
  await rejects(
    () =>
      cmd("kitchen", { orderId: order.id, itemId: item.id, status: "READY" }),
    /Transición/,
  );
  await barCommand(
    { ...ctx, role: "KITCHEN" },
    "kitchen",
    { orderId: order.id, itemId: item.id, status: "PREPARING" },
    midnight,
  );
  await cmd("kitchen", { orderId: order.id, itemId: item.id, status: "READY" });
  await cmd("kitchen", {
    orderId: order.id,
    itemId: item.id,
    status: "SERVED",
  });
  const firstPay = randomUUID();
  await cmd(
    "pay",
    {
      orderId: order.id,
      requestId: firstPay,
      payments: [{ method: "CASH", amount: "200", person: "Ana" }],
    },
    midnight,
  );
  await cmd(
    "pay",
    {
      orderId: order.id,
      requestId: firstPay,
      payments: [{ method: "CASH", amount: "200", person: "Ana" }],
    },
    midnight,
  );
  check(
    (await db.barPayment.count({ where: { orderId: order.id } })) === 1,
    "reintento no duplica pago",
  );
  await rejects(
    () =>
      cmd("pay", {
        orderId: order.id,
        requestId: firstPay,
        payments: [{ method: "CASH", amount: "201", person: "Ana" }],
      }),
    /otros datos/,
  );
  await rejects(
    () =>
      cmd("add-item", { orderId: order.id, productId: beer.id, quantity: 1 }),
    /abonos/,
  );
  await rejects(() => cmd("close", { counted: "700" }), /órdenes/);
  await rejects(
    () =>
      cmd("pay", {
        orderId: order.id,
        requestId: randomUUID(),
        payments: [{ method: "CARD", amount: "500" }],
      }),
    /supera/,
  );
  await cmd(
    "pay",
    {
      orderId: order.id,
      requestId: randomUUID(),
      payments: [
        { method: "CARD", amount: "300", person: "Luis" },
        { method: "BANK_TRANSFER", amount: "100", person: "Marta" },
      ],
    },
    midnight,
  );
  saved = await db.barOrder.findUniqueOrThrow({
    where: { id: order.id },
    include: { items: true },
  });
  check(saved.status === "PAID", "orden pagada");
  check(
    (
      await db.barProduct.findUniqueOrThrow({ where: { id: beer.id } })
    ).stock.equals(21),
    "descuenta 3 + 6 del combo una vez",
  );
  const receipt = await db.receipt.findFirstOrThrow({
    where: { invoiceId: saved.invoiceId! },
  });
  const pdf = await pdfDocument(
    serialize(await detail(ctx, "receipts", receipt.id)),
    "receipts",
  );
  check(
    pdf.subarray(0, 4).toString() === "%PDF",
    "PDF original funciona para recibos del bar",
  );
  await rejects(
    () => deletePayment(ctx, receipt.paymentId),
    /no puede eliminarse/,
  );
  await rejects(
    () => documentAction(ctx, "invoices", saved.invoiceId!, "void"),
    /orden del bar/,
  );
  await rejects(
    () =>
      createPayment(ctx, {
        invoiceId: saved.invoiceId,
        amount: "1",
        currency: "NIO",
        paymentDate: "2026-10-23",
        method: "CASH",
      }),
    /orden del bar/,
  );
  const cancel = (await cmd("create-order", { channel: "BAR" })) as {
    id: string;
  };
  await cmd("add-item", {
    orderId: cancel.id,
    productId: beer.id,
    quantity: 1,
  });
  await cmd("cancel", { orderId: cancel.id, reason: "Cliente se retiró" });
  check(
    (
      await db.barProduct.findUniqueOrThrow({ where: { id: beer.id } })
    ).stock.equals(21),
    "anular no descuenta inventario",
  );
  const excessive = (await cmd("create-order", { channel: "TAKEAWAY" })) as {
    id: string;
  };
  await cmd("add-item", {
    orderId: excessive.id,
    productId: beer.id,
    quantity: 22,
  });
  await rejects(
    () =>
      cmd("pay", {
        orderId: excessive.id,
        requestId: randomUUID(),
        payments: [{ method: "CASH", amount: "1100" }],
      }),
    /insuficientes/,
  );
  check(
    (await db.barPayment.count({ where: { orderId: excessive.id } })) === 0,
    "stock insuficiente revierte todo el pago",
  );
  await cmd("cancel", {
    orderId: excessive.id,
    reason: "Sin stock suficiente",
  });
  const summary = await transaction((tx) => daySummary(tx, ctx, day.id));
  check(
    summary.sales === "600.00" &&
      summary.cash === "200.00" &&
      summary.card === "300.00",
    "resumen usa pagos de la jornada",
  );
  await rejects(
    () =>
      cmd("add-item", {
        orderId: excessive.id,
        productId: beer.id,
        quantity: 1,
      }),
    /cerrada/,
  );
  await rejects(
    () =>
      cmd("create-order", { channel: "BAR" }, new Date("2026-10-24T06:30:00Z")),
    /horario/,
  );
  const daily = await barReport(ctx, "day", "2026-10-23");
  const nextDay = await barReport(ctx, "day", "2026-10-24");
  const monthly = await barReport(ctx, "month", "2026-10");
  check(
    daily.metrics.sales === "600.00" &&
      monthly.metrics.sales === "600.00" &&
      nextDay.metrics.sales === "0.00",
    "reportes diario y mensual mantienen medianoche en la jornada original",
  );
  check(
    monthly.methods.find((m) => m.method === "CARD")?.total === "300.00",
    "reporte por método de pago",
  );
  await rejects(
    () => barReport({ ...ctx, role: "WAITER" }, "month", "2026-10"),
    /permiso/,
  );
  await rejects(() => barReport(ctx, "day", "2026-02-30"), /válido/);
  const close = (await cmd(
    "close",
    { counted: "695" },
    new Date("2026-10-24T06:35:00Z"),
  )) as { closeData: unknown };
  check(
    (close.closeData as { difference: string }).difference === "-5.00",
    "cierre calcula faltante 700 esperado vs 695 contado",
  );
  await rejects(
    () =>
      barCommand(
        { ...ctx, role: "MANAGER" },
        "adjust-close",
        { dayId: day.id, counted: "700", reason: "prueba" },
        now,
      ),
    /permiso/,
  );
  await cmd("adjust-close", {
    dayId: day.id,
    counted: "700",
    reason: "Recuento autorizado",
  });
  const corrected = await db.businessDay.findUniqueOrThrow({
    where: { id: day.id },
  });
  check(
    (corrected.closeData as { original: { counted: string } }).original
      .counted === "695",
    "corrección conserva cierre original",
  );
  check(
    (await db.auditLog.count({
      where: { companyId, action: "CASH_OPENED" },
    })) === 1,
    "apertura auditada",
  );
  await rejects(
    () =>
      barCommand(
        { ...ctx, companyId: "foreign" },
        "reserve",
        { tableId: table.id, reserved: true },
        now,
      ),
    /Mesa no encontrada/,
  );
  await rejects(
    () =>
      barCommand(
        { ...ctx, role: "CASHIER" },
        "open",
        { opening: "700", overrideReason: "No autorizado" },
        now,
      ),
    /ADMIN/,
  );
  const reopened = (await cmd("open", {
    opening: "700",
    overrideReason: "Turno adicional autorizado",
  })) as { id: string };
  check(
    reopened.id !== day.id,
    "segunda apertura autorizada conserva el cierre anterior",
  );
  await cmd("open", {
    opening: "100",
    previousCounted: "700",
    overrideReason: "Reemplazo controlado de turno",
  });
  check(
    (await db.businessDay.count({ where: { companyId, status: "OPEN" } })) ===
      1,
    "segunda apertura cierra y cuenta la caja anterior; queda una sola abierta",
  );
  check(
    (await db.businessDay.findUniqueOrThrow({ where: { id: day.id } }))
      .status === "CLOSED",
    "cierre original permanece cerrado e inmutable",
  );
  const expenseInput = {
    requestId: randomUUID(),
    kind: "PURCHASE",
    method: "CASH",
    amount: "25",
    description: "Insumos",
    reference: "DEMO-001",
    attachment:
      "data:application/pdf;base64," +
      Buffer.from("%PDF-1.4\nDemo").toString("base64"),
  };
  const [expenseA, expenseB] = (await Promise.all([
    cmd("expense", expenseInput),
    cmd("expense", expenseInput),
  ])) as { id: string }[];
  check(
    expenseA.id === expenseB.id,
    "reintentos concurrentes registran una única compra",
  );
  await rejects(
    () => cmd("expense", { ...expenseInput, amount: "26" }),
    /otro gasto/,
  );
  await cmd("expense", {
    requestId: randomUUID(),
    kind: "EXPENSE",
    method: "CARD",
    amount: "10",
    description: "Transporte",
  });
  await rejects(
    () => barCommand({ ...ctx, role: "WAITER" }, "expense", expenseInput, now),
    /permiso/,
  );
  await rejects(
    () =>
      cmd("expense", {
        ...expenseInput,
        requestId: randomUUID(),
        attachment: "data:image/png;base64,SGVsbG8=",
      }),
    /inválido/,
  );
  const expenseReport = await barReport(ctx, "month", "2026-10");
  check(
    expenseReport.metrics.expenses === "35.00" &&
      expenseReport.metrics.cashExpenses === "25.00",
    "reportes distinguen gastos totales y salidas de caja",
  );
  const expenseClose = (await cmd("close", { counted: "75" })) as unknown as {
    closeData: { expected: string; difference: string };
  };
  check(
    expenseClose.closeData.expected === "75.00" &&
      expenseClose.closeData.difference === "0.00",
    "cierre descuenta compra en efectivo y conserva gasto por tarjeta sin descontarlo de caja",
  );
  await rejects(
    () => cmd("expense", { ...expenseInput, requestId: randomUUID() }),
    /Abre una jornada/,
  );
  console.log(
    `${checks} verificaciones de bar pasaron: medianoche, concurrencia, pagos, combos, cocina, PDF, auditoría, cierre y permisos.`,
  );
}
async function cleanup() {
  // Remove only this run's isolated tenant and its exclusively created user.
  await db.kitchenDispatch.deleteMany({ where: { companyId } });
  await db.barPayment.deleteMany({ where: { companyId } });
  await db.barOrderItem.deleteMany({ where: { companyId } });
  await db.barOrder.deleteMany({ where: { companyId } });
  await db.receipt.deleteMany({ where: { companyId } });
  await db.payment.deleteMany({ where: { companyId } });
  await db.invoiceItem.deleteMany({ where: { companyId } });
  await db.invoice.deleteMany({ where: { companyId } });
  await db.inventoryMovement.deleteMany({ where: { companyId } });
  await db.recipePart.deleteMany({ where: { companyId } });
  await db.barProduct.deleteMany({ where: { companyId } });
  await db.product.deleteMany({ where: { companyId } });
  await db.barCategory.deleteMany({ where: { companyId } });
  await db.supplier.deleteMany({ where: { companyId } });
  await db.diningTable.deleteMany({ where: { companyId } });
  await db.barExpense.deleteMany({ where: { companyId } });
  await db.businessDay.deleteMany({ where: { companyId } });
  await db.customer.deleteMany({ where: { companyId } });
  await db.auditLog.deleteMany({ where: { companyId } });
  const members = await db.membership.findMany({ where: { companyId } });
  await db.membership.deleteMany({ where: { companyId } });
  for (const m of members) await db.user.delete({ where: { id: m.userId } });
  await db.companySettings.deleteMany({ where: { companyId } });
  await db.company.deleteMany({ where: { id: companyId } });
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    await db.$disconnect();
  });
