import { db } from "../server/db";
import { barCommand } from "../server/bar";
import type { Context } from "../server/auth";
export async function ingredientDemo(ctx: Context) {
  if (ctx.companyId !== "antoja2-demo")
    throw Error("Solo se permite preparar ingredientes en la demo.");
  await barCommand(ctx, "inventory-mode", {});
  let category = await db.barCategory.findFirst({
    where: { companyId: ctx.companyId, name: "Ingredientes", kind: "FOOD" },
  });
  if (!category)
    category = (await barCommand(ctx, "category", {
      name: "Ingredientes",
      kind: "FOOD",
    })) as typeof category;
  let raw = await db.barProduct.findFirst({
    where: { companyId: ctx.companyId, product: { sku: "DEMO-RAW-POLLO" } },
  });
  if (!raw)
    raw = (await barCommand(ctx, "product", {
      name: "Pollo",
      sku: "DEMO-RAW-POLLO",
      kind: "FOOD",
      categoryId: category!.id,
      ingredientOnly: true,
      trackStock: true,
      unit: "lb",
      initialStock: "1",
      cost: "10",
      price: "0",
    })) as typeof raw;
  if (
    !(await db.product.findFirst({
      where: { companyId: ctx.companyId, sku: "DEMO-PLATO-POLLO" },
    }))
  ) {
    const food = await db.barCategory.findFirstOrThrow({
      where: { companyId: ctx.companyId, name: "Platos fuertes", kind: "FOOD" },
    });
    await barCommand(ctx, "product", {
      name: "Pollo frito · ejemplo de receta",
      sku: "DEMO-PLATO-POLLO",
      kind: "FOOD",
      categoryId: food.id,
      description:
        "Usa 1 lb de pollo. Precio C$20; costo de ingredientes C$10.",
      price: "20",
      cost: "10",
      components: [{ ingredientId: raw!.id, quantity: "1" }],
    });
  }
  if (
    !(await db.product.findFirst({
      where: { companyId: ctx.companyId, sku: "DEMO-WAREHOUSE" },
    }))
  ) {
    const beerCategory = await db.barCategory.findFirstOrThrow({
      where: { companyId: ctx.companyId, name: "Cervezas", kind: "DRINK" },
    });
    const beer = (await barCommand(ctx, "product", {
      name: "Cerveza demo · almacén",
      sku: "DEMO-WAREHOUSE",
      kind: "DRINK",
      categoryId: beerCategory.id,
      cost: "38",
      price: "65",
      trackStock: true,
      initialStock: "0",
    })) as { id: string };
    await barCommand(ctx, "warehouse", {
      requestId: crypto.randomUUID(),
      productId: beer.id,
      operation: "PURCHASE",
      quantity: "10",
      boxes: true,
      packSize: 24,
      reason: "DEMO · Compra de 10 cajas de 24",
    });
    await barCommand(ctx, "warehouse", {
      requestId: crypto.randomUUID(),
      productId: beer.id,
      operation: "TO_SALE",
      quantity: "2",
      boxes: true,
      packSize: 24,
      reason: "DEMO · Dos cajas para vender",
    });
  }
}
