import "dotenv/config";
import { hash } from "bcryptjs";
import { db } from "../server/db";
import { barCommand } from "../server/bar";
import type { Context } from "../server/auth";
async function main() {
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 12)
    throw new Error("Configura SEED_ADMIN_PASSWORD (mínimo 12 caracteres).");
  if (await db.company.findUnique({ where: { id: "antoja2-demo" } })) {
    console.log("Demo Antoja2 existente preservada.");
    return;
  }
  await db.$transaction(async (tx) => {
    await tx.company.create({
      data: {
        id: "antoja2-demo",
        name: "Antoja2 Bar & Restaurante",
        tradeName: "Antoja2",
        address: "Managua, Nicaragua",
        settings: { create: { terms: "Gracias por visitarnos." } },
      },
    });
    await tx.user.create({
      data: {
        email: "admin@antoja2.invalid",
        name: "Administración Antoja2",
        passwordHash: await hash(password, 12),
        memberships: { create: { companyId: "antoja2-demo", role: "ADMIN" } },
      },
    });
  });
  const user = await db.user.findUniqueOrThrow({
    where: { email: "admin@antoja2.invalid" },
  });
  const ctx: Context = {
    companyId: "antoja2-demo",
    userId: user.id,
    role: "ADMIN",
    name: user.name,
    companyName: "Antoja2",
  };
  for (const [kind, names] of [
    [
      "DRINK",
      [
        "Bebidas alcohólicas",
        "Bebidas no alcohólicas",
        "Cervezas",
        "Licores",
        "Vinos",
        "Mixers",
        "Agua",
        "Gaseosas",
        "Jugos",
        "Otros",
      ],
    ],
    [
      "FOOD",
      [
        "Entradas",
        "Platos fuertes",
        "Hamburguesas",
        "Tacos",
        "Acompañamientos",
        "Postres",
        "Extras",
      ],
    ],
    ["COMBO", ["Promociones"]],
  ] as const)
    for (const name of names) await barCommand(ctx, "category", { kind, name });
  for (let i = 1; i <= 12; i++)
    await barCommand(ctx, "table", {
      name: "Mesa " + String(i).padStart(2, "0"),
      seats: i <= 8 ? 4 : 6,
    });
  const cats = await db.barCategory.findMany({
    where: { companyId: ctx.companyId },
  });
  const category = (name: string) => cats.find((c) => c.name === name)!.id;
  const supplier = (await barCommand(ctx, "supplier", {
    name: "Proveedor demo",
    contact: "Contacto de demostración",
  })) as { id: string };
  const beer = (await barCommand(ctx, "product", {
    name: "Cerveza Toña",
    sku: "BEB-001",
    kind: "DRINK",
    categoryId: category("Cervezas"),
    price: "65",
    cost: "38",
    presentation: "Botella 355 ml",
    unit: "unidad",
    trackStock: true,
    initialStock: "120",
    minimum: "24",
    supplierId: supplier.id,
  })) as { id: string };
  await barCommand(ctx, "product", {
    name: "Agua mineral",
    sku: "BEB-002",
    kind: "DRINK",
    categoryId: category("Agua"),
    price: "35",
    cost: "15",
    presentation: "Botella 600 ml",
    unit: "unidad",
    trackStock: true,
    initialStock: "60",
    minimum: "12",
  });
  await barCommand(ctx, "product", {
    name: "Hamburguesa de la casa",
    sku: "PLT-001",
    kind: "FOOD",
    categoryId: category("Hamburguesas"),
    price: "220",
    cost: "95",
    description: "Carne, queso, vegetales y papas.",
    notes: "Consultá por alergias.",
  });
  await barCommand(ctx, "product", {
    name: "Nachos para compartir",
    sku: "PLT-002",
    kind: "FOOD",
    categoryId: category("Entradas"),
    price: "180",
    cost: "70",
  });
  await barCommand(ctx, "product", {
    name: "Bucket 6 Toñas",
    sku: "CMB-001",
    kind: "COMBO",
    categoryId: category("Promociones"),
    price: "350",
    cost: "228",
    components: [{ ingredientId: beer.id, quantity: "6" }],
  });
  console.log(
    "Demo Antoja2 creada; sin jornada abierta ni ventas ficticias. Usuario: admin@antoja2.invalid. Contraseña en .env, no se imprime.",
  );
}
main().finally(() => db.$disconnect());
