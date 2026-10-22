import "dotenv/config";
import { hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { barClock } from "../lib/bar-time";
import { db } from "../server/db";
import { barCommand } from "../server/bar";
import type { Context } from "../server/auth";
async function main() {
  const company = await db.company.findUniqueOrThrow({
    where: { id: "antoja2-demo" },
  });
  await db.companySettings.update({
    where: { companyId: company.id },
    data: { sandboxDemo: true },
  });
  const user = await db.user.findUniqueOrThrow({
    where: { email: "admin@antoja2.invalid" },
  });
  const ctx: Context = {
    companyId: company.id,
    userId: user.id,
    role: "ADMIN",
    name: user.name,
    companyName: company.name,
  };
  const burger = await db.barProduct.findFirstOrThrow({
    where: { companyId: company.id, product: { sku: "PLT-001" } },
  });
  if (!(burger.customizations as unknown[]).length)
    await db.barProduct.update({
      where: { id: burger.id },
      data: {
        customizations: [
          { key: "no-onion", label: "cebolla", kind: "REMOVE", price: "0" },
          { key: "no-sauce", label: "salsa", kind: "REMOVE", price: "0" },
          { key: "cheese", label: "queso", kind: "EXTRA", price: "25" },
        ],
      },
    });
  const products = await db.barProduct.findMany({
    where: { companyId: company.id },
    include: { product: true },
  });
  const product = (sku: string) => products.find((p) => p.product.sku === sku)!;
  const dates = ["2026-09-25", "2026-10-18", "2026-10-19", "2026-10-20"];
  for (const [index, date] of dates.entries()) {
    if (
      await db.businessDay.findFirst({
        where: { companyId: company.id, date: new Date(date) },
      })
    )
      continue;
    const time = new Date(date + "T12:00:00-06:00");
    const cmd = (action: string, input: unknown, at = time) =>
      barCommand(ctx, action, input, at);
    await cmd("open", {
      opening: "1000",
      notes: "DEMO: datos ficticios para presentación",
    });
    const order = (await cmd("create-order", {
      channel: "BAR",
      customerName: "DEMO · Mesa de ejemplo",
    })) as { id: string };
    await cmd("add-item", {
      orderId: order.id,
      productId: product("BEB-001").id,
      quantity: 3,
    });
    await cmd("add-item", {
      orderId: order.id,
      productId: burger.id,
      quantity: 2,
      choices: ["no-onion", "cheese"],
      notes: "Salsa aparte",
    });
    await cmd("dispatch", { orderId: order.id, requestId: randomUUID() });
    const amount = (
      await db.barOrder.findUniqueOrThrow({ where: { id: order.id } })
    ).total.toFixed(2);
    await cmd("pay", {
      orderId: order.id,
      requestId: randomUUID(),
      payments: [
        { method: "CASH", amount: "200", person: "DEMO Persona 1" },
        {
          method: "CARD",
          amount: (Number(amount) - 200).toFixed(2),
          person: "DEMO Persona 2",
        },
      ],
    });
    await cmd("invoice", { orderId: order.id });
    const second = (await cmd("create-order", {
      channel: "TAKEAWAY",
      customerName: "DEMO · Para llevar",
    })) as { id: string };
    await cmd("add-item", {
      orderId: second.id,
      productId: product("CMB-001").id,
      quantity: 1,
    });
    await cmd(
      "pay",
      {
        orderId: second.id,
        requestId: randomUUID(),
        payments: [{ method: "BANK_TRANSFER", amount: "350" }],
      },
      new Date(new Date(date + "T23:59:00-06:00").getTime() + 16 * 60000),
    );
    const cancelled = (await cmd("create-order", { channel: "BAR" })) as {
      id: string;
    };
    await cmd("add-item", {
      orderId: cancelled.id,
      productId: product("BEB-002").id,
      quantity: 1,
    });
    await cmd("cancel", {
      orderId: cancelled.id,
      reason: "DEMO: cliente cambió de opinión",
    });
    await cmd(
      "close",
      {
        counted: index === 2 ? "1195" : "1200",
        notes: "DEMO: cierre de demostración",
      },
      new Date(new Date(date + "T23:59:00-06:00").getTime() + 36 * 60000),
    );
  }
  const date = barClock().date;
  let open = await db.businessDay.findFirst({
    where: { companyId: company.id, status: "OPEN" },
  });
  if (
    !open &&
    !(await db.businessDay.findFirst({
      where: { companyId: company.id, date: new Date(date) },
    }))
  ) {
    open = (await barCommand(ctx, "open", {
      opening: "1000",
      notes: "DEMO: jornada para presentación",
    })) as typeof open;
    const table = await db.diningTable.findFirstOrThrow({
      where: { companyId: company.id, name: "Mesa 03" },
    });
    const pending = (await barCommand(ctx, "create-order", {
      channel: "TABLE",
      tableId: table.id,
      customerName: "DEMO · Consumo en local",
    })) as { id: string };
    await barCommand(ctx, "add-item", {
      orderId: pending.id,
      productId: burger.id,
      quantity: 2,
      choices: ["no-onion"],
      notes: "Salsa aparte",
    });
    await barCommand(ctx, "dispatch", {
      orderId: pending.id,
      requestId: randomUUID(),
    });
    const delivery = (await barCommand(ctx, "create-order", {
      channel: "DELIVERY",
      deliverySource: "PEYA",
      deliveryReference: "DEMO-PY-1042",
      customerName: "DEMO · Delivery",
    })) as { id: string };
    await barCommand(ctx, "add-item", {
      orderId: delivery.id,
      productId: burger.id,
      quantity: 1,
      choices: ["cheese"],
    });
    const pickup = (await barCommand(ctx, "create-order", {
      channel: "PICKUP",
      customerName: "DEMO · Recoge en el local",
    })) as { id: string };
    await barCommand(ctx, "add-item", {
      orderId: pickup.id,
      productId: product("BEB-002").id,
      quantity: 2,
    });
  }
  const staffPassword = process.env.SEED_BILLING_PASSWORD;
  if (!staffPassword)
    throw new Error("Configura SEED_BILLING_PASSWORD para usuarios demo.");
  for (const [role, username, label] of [
    ["MANAGER", "encargado.demo", "Encargado Demo"],
    ["CASHIER", "caja.demo", "Cajero Demo"],
    ["WAITER", "mesero.demo", "Mesero Demo"],
    ["KITCHEN", "cocina.demo", "Cocina Demo"],
    ["VIEWER", "consulta.demo", "Consulta Demo"],
  ] as const) {
    if (!(await db.user.findUnique({ where: { username } })))
      await db.user.create({
        data: {
          username,
          name: label,
          passwordHash: await hash(staffPassword, 12),
          memberships: { create: { companyId: company.id, role } },
        },
      });
  }
  if (process.env.VERCEL !== "1") {
    await mkdir("/workspace/.cloud", { recursive: true, mode: 0o700 });
    await writeFile(
      "/workspace/.cloud/Antoja2-demo-acceso.txt",
      `Antoja2 POS — Demo separada\nUsuario: admin@antoja2.invalid\nContraseña: ${process.env.SEED_ADMIN_PASSWORD}\nDatos ficticios en septiembre y octubre de 2026.\nReportes sugeridos: diario 2026-10-19 y mensual 2026-10.\nLa cuenta original admin pertenece a otra empresa y no comparte estas ventas.\nUsuarios empleados demo: encargado.demo, caja.demo, mesero.demo, cocina.demo, consulta.demo.\nContraseña de empleados demo: ${staffPassword}\n`,
      { mode: 0o600 },
    );
  }
  console.log(
    "Demo preparada: menú personalizable, 4 jornadas con pagos mixtos, medianoche, comandas y diferencias de caja. Datos originales preservados.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
