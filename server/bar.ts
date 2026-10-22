import {
  selectModifiers,
  modifierLabel,
  type Modifier,
} from "@/lib/bar-modifiers";
import { salesForecast } from "./sales-forecast";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { db, transaction } from "./db";
import { AppError, type Context } from "./auth";
import { requireBar } from "./bar-permissions";
import { audit, nextNumber } from "./domain";
import { barClock } from "@/lib/bar-time";
import {
  amount,
  decimal,
  calculateDocument,
  paymentBalance,
} from "@/lib/money";
type Tx = Prisma.TransactionClient;
const id = z.string().min(1).max(100);
const text = z.string().trim().max(2000).default("");
const name = z.string().trim().min(1).max(200);
const money = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/);
const quantity = z.string().regex(/^\d{1,9}(\.\d{1,4})?$/);
const rate = z
  .string()
  .regex(/^\d{1,3}(\.\d{1,4})?$/)
  .refine((v) => Number(v) <= 100);
const kind = z.enum(["DRINK", "FOOD", "COMBO"]);
const paidInclude = {
  items: { orderBy: { createdAt: "asc" as const } },
  payments: { include: { payment: { include: { receipt: true } } } },
  table: true,
  businessDay: true,
  invoice: true,
  dispatches: { orderBy: { createdAt: "asc" as const } },
};
const closed = (status: string) => ["PAID", "CANCELLED"].includes(status);
async function companyLock(tx: Tx, ctx: Context) {
  await tx.$queryRaw`SELECT id FROM "Company" WHERE id=${ctx.companyId} FOR UPDATE`;
}
async function openDay(tx: Tx, ctx: Context, now: Date, consumption = false) {
  const day = await tx.businessDay.findFirst({
    where: { companyId: ctx.companyId, status: "OPEN" },
  });
  if (!day) throw new AppError("Abre una jornada antes de operar.", 409);
  const settings = await tx.companySettings.findUniqueOrThrow({
    where: { companyId: ctx.companyId },
  });
  if (
    consumption &&
    !settings.sandboxDemo &&
    (!barClock(now).operating ||
      day.date.toISOString().slice(0, 10) !== barClock(now).date)
  )
    throw new AppError(
      "Fuera del horario de consumo (11:30–00:30). Cobra y cierra la jornada pendiente.",
      409,
    );
  return day;
}
async function getOrder(tx: Tx, ctx: Context, orderId: string) {
  const row = await tx.barOrder.findFirst({
    where: { id: orderId, companyId: ctx.companyId },
    include: paidInclude,
  });
  if (!row) throw new AppError("Orden no encontrada.", 404);
  return row;
}
function editable(order: Awaited<ReturnType<typeof getOrder>>) {
  if (closed(order.status) || order.payments.length)
    throw new AppError(
      "La orden está cerrada o tiene abonos; no se puede modificar.",
      409,
    );
}
async function totals(tx: Tx, ctx: Context, orderId: string) {
  const order = await getOrder(tx, ctx, orderId);
  const calculation = calculateDocument(
    order.items.map((i) => ({
      productId: i.productId,
      description: i.name,
      quantity: String(i.quantity),
      unitPrice: i.unitPrice.toString(),
      taxRate: i.taxRate.toString(),
      discountRate: "0",
    })),
    order.discountRate.toString(),
  );
  if (
    order.items.length &&
    decimal(calculation.total).plus(order.tip.toString()).lte(0)
  )
    throw new AppError(
      "El total debe ser positivo. Para consumo sin cobro usa el método cortesía.",
    );
  return tx.barOrder.update({
    where: { id: order.id },
    data: {
      subtotal: calculation.subtotal,
      discountTotal: calculation.discountTotal,
      taxTotal: calculation.taxTotal,
      total: amount(decimal(calculation.total).plus(order.tip.toString())),
    },
  });
}
async function movement(
  tx: Tx,
  ctx: Context,
  productId: string,
  delta: string,
  type: string,
  reason: string,
  orderId?: string,
  location: "SALE" | "WAREHOUSE" = "SALE",
) {
  const product = await tx.barProduct.findFirst({
    where: { id: productId, companyId: ctx.companyId },
  });
  if (!product || !product.trackStock)
    throw new AppError("Producto de inventario no encontrado.", 404);
  const balance = decimal(
    (location === "WAREHOUSE"
      ? product.warehouseStock
      : product.stock
    ).toString(),
  ).plus(delta);
  if (balance.lt(0))
    throw new AppError("Existencias insuficientes. Revisa el inventario.", 409);
  await tx.barProduct.update({
    where: { id: productId },
    data:
      location === "WAREHOUSE"
        ? { warehouseStock: balance.toFixed(4) }
        : { stock: balance.toFixed(4) },
  });
  await tx.inventoryMovement.create({
    data: {
      companyId: ctx.companyId,
      productId,
      type,
      location,
      quantity: delta,
      balance: balance.toFixed(4),
      reason,
      userId: ctx.userId,
      orderId,
    },
  });
  await audit(tx, ctx, "Product", productId, "INVENTORY_" + type, {
    quantity: delta,
    location,
    balance: balance.toFixed(4),
    reason,
    ...(orderId ? { orderId } : {}),
  });
}
async function assertIngredientStock(
  tx: Tx,
  ctx: Context,
  parts: { productId: string; quantity: string }[],
  count: number,
  excludeItem?: string,
  allTracked = false,
) {
  const raw = await tx.barProduct.findMany({
    where: {
      companyId: ctx.companyId,
      ...(allTracked ? { trackStock: true } : { ingredientOnly: true }),
      id: { in: parts.map((p) => p.productId) },
    },
    include: { product: { select: { name: true } } },
  });
  if (!raw.length) return;
  const pending = await tx.barOrderItem.findMany({
    where: {
      companyId: ctx.companyId,
      ...(excludeItem ? { id: { not: excludeItem } } : {}),
      order: { status: { notIn: ["PAID", "CANCELLED"] } },
    },
    select: { quantity: true, inventoryParts: true },
  });
  for (const ingredient of raw) {
    const reserved = pending.reduce(
      (n, item) =>
        n.plus(
          (item.inventoryParts as { productId: string; quantity: string }[])
            .filter((p) => p.productId === ingredient.id)
            .reduce(
              (m, p) => m.plus(decimal(p.quantity).times(item.quantity)),
              decimal(0),
            ),
        ),
      decimal(0),
    );
    const needed = parts
      .filter((p) => p.productId === ingredient.id)
      .reduce((n, p) => n.plus(decimal(p.quantity).times(count)), decimal(0));
    if (decimal(ingredient.stock.toString()).minus(reserved).lt(needed))
      throw new AppError(
        "Agotado: no alcanza " + ingredient.product.name + " para este pedido.",
        409,
      );
  }
}
const beverageCounts = z
  .array(z.object({ productId: id, counted: quantity }))
  .max(5000)
  .optional();
async function closeBeverages(
  tx: Tx,
  ctx: Context,
  input: z.infer<typeof beverageCounts>,
) {
  const products = await tx.barProduct.findMany({
    where: {
      companyId: ctx.companyId,
      kind: "DRINK",
      trackStock: true,
      OR: [{ product: { active: true } }, { stock: { gt: 0 } }],
    },
    include: { product: { select: { name: true, unit: true } } },
    orderBy: { product: { name: "asc" } },
  });
  if (!products.length) return [];
  if (
    !input ||
    input.length !== products.length ||
    new Set(input.map((i) => i.productId)).size !== input.length ||
    input.some((i) => !products.some((p) => p.id === i.productId))
  )
    throw new AppError(
      "Completá el conteo físico de todas las bebidas antes de cerrar.",
      409,
    );
  return products.map((p) => {
    const counted = input.find((i) => i.productId === p.id)!.counted;
    return {
      productId: p.id,
      name: p.product.name,
      unit: p.product.unit,
      expected: p.stock.toFixed(4),
      counted: decimal(counted).toFixed(4),
      difference: decimal(counted).minus(p.stock.toString()).toFixed(4),
    };
  });
}
export async function barCommand(
  ctx: Context,
  action: string,
  input: unknown,
  now = new Date(),
) {
  // Permission checks precede all reads/mutations. All operational writes serialize per company.
  const permission = ["open", "close", "pay", "invoice", "expense"].includes(
    action,
  )
    ? "cash"
    : action === "adjust-close"
      ? "adjustClose"
      : [
            "product",
            "category",
            "supplier",
            "stock",
            "availability",
            "inventory-mode",
            "warehouse",
          ].includes(action)
        ? "catalog"
        : action === "kitchen"
          ? "kitchen"
          : "orders";
  requireBar(ctx, permission);
  return transaction(async (tx) => {
    await companyLock(tx, ctx);
    if (action === "expense") {
      const data = z
        .object({
          requestId: z.uuid(),
          kind: z.enum(["EXPENSE", "PURCHASE"]),
          method: z.enum(["CASH", "CARD", "BANK_TRANSFER"]),
          amount: money.refine(
            (v) => decimal(v).gt(0),
            "El monto debe ser positivo.",
          ),
          description: name,
          payee: z.string().trim().max(200).default(""),
          reference: z.string().trim().max(200).default(""),
          attachment: z.string().max(2800000).default(""),
        })
        .parse(input);
      if (data.attachment) {
        const match =
          /^data:(application\/pdf|image\/png|image\/jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
            data.attachment,
          );
        if (!match)
          throw new AppError(
            "Adjunta una imagen PNG/JPG o un PDF (máximo 2 MB).",
          );
        const bytes = Buffer.from(match[2], "base64");
        const valid =
          match[1] === "application/pdf"
            ? bytes.subarray(0, 5).toString() === "%PDF-"
            : match[1] === "image/png"
              ? bytes
                  .subarray(0, 8)
                  .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
              : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
        if (!valid || bytes.length > 2 * 1024 * 1024)
          throw new AppError("Archivo inválido o mayor a 2 MB.");
      }
      const fingerprint = createHash("sha256")
        .update(JSON.stringify(data))
        .digest("hex");
      const existing = await tx.barExpense.findUnique({
        where: {
          companyId_requestId: {
            companyId: ctx.companyId,
            requestId: data.requestId,
          },
        },
      });
      if (existing) {
        if (existing.fingerprint !== fingerprint)
          throw new AppError(
            "La solicitud ya fue utilizada para otro gasto.",
            409,
          );
        return { id: existing.id };
      }
      const day = await openDay(tx, ctx, now);
      const row = await tx.barExpense.create({
        data: {
          ...data,
          fingerprint,
          companyId: ctx.companyId,
          businessDayId: day.id,
          createdBy: ctx.userId,
          createdAt: now,
        },
      });
      await audit(tx, ctx, "BarExpense", row.id, "EXPENSE_RECORDED", {
        amount: data.amount,
        kind: data.kind,
        method: data.method,
        reference: data.reference,
      });
      return { id: row.id };
    }
    if (action === "warehouse") {
      requireBar(ctx, "catalog");
      const data = z
        .object({
          requestId: z.uuid(),
          productId: id,
          operation: z.enum(["PURCHASE", "TO_SALE", "TO_WAREHOUSE", "LOSS"]),
          quantity: quantity.refine((v) => Number(v) > 0),
          boxes: z.boolean().default(false),
          packSize: z.coerce.number().int().min(1).max(1000).default(1),
          reason: name,
        })
        .parse(input);
      const fingerprint = createHash("sha256")
        .update(JSON.stringify(data))
        .digest("hex");
      const previous = await tx.auditLog.findFirst({
        where: {
          companyId: ctx.companyId,
          entityType: "WarehouseOperation",
          entityId: data.requestId,
          action: "WAREHOUSE_OPERATION",
        },
      });
      if (previous) {
        if (
          (previous.metadata as { fingerprint: string }).fingerprint !==
          fingerprint
        )
          throw new AppError(
            "Esta solicitud ya se usó para otro movimiento.",
            409,
          );
        return { ok: true };
      }
      const product = await tx.barProduct.findFirst({
        where: {
          id: data.productId,
          companyId: ctx.companyId,
          trackStock: true,
        },
      });
      if (!product)
        throw new AppError("Producto de inventario no encontrado.", 404);
      const units = decimal(data.quantity)
        .times(data.boxes ? data.packSize : 1)
        .toFixed(4);
      if (data.operation === "PURCHASE")
        await movement(
          tx,
          ctx,
          product.id,
          units,
          "WAREHOUSE_PURCHASE",
          data.reason,
          undefined,
          "WAREHOUSE",
        );
      else if (data.operation === "TO_SALE") {
        await movement(
          tx,
          ctx,
          product.id,
          "-" + units,
          "TRANSFER_OUT",
          data.reason,
          undefined,
          "WAREHOUSE",
        );
        await movement(tx, ctx, product.id, units, "TRANSFER_IN", data.reason);
      } else if (data.operation === "TO_WAREHOUSE") {
        await assertIngredientStock(
          tx,
          ctx,
          [{ productId: product.id, quantity: units }],
          1,
          undefined,
          true,
        );
        await movement(
          tx,
          ctx,
          product.id,
          "-" + units,
          "TRANSFER_OUT",
          data.reason,
        );
        await movement(
          tx,
          ctx,
          product.id,
          units,
          "TRANSFER_IN",
          data.reason,
          undefined,
          "WAREHOUSE",
        );
      } else
        await movement(
          tx,
          ctx,
          product.id,
          "-" + units,
          "WAREHOUSE_LOSS",
          data.reason,
          undefined,
          "WAREHOUSE",
        );
      if (data.boxes)
        await tx.barProduct.update({
          where: { id: product.id },
          data: { packSize: data.packSize },
        });
      await audit(
        tx,
        ctx,
        "WarehouseOperation",
        data.requestId,
        "WAREHOUSE_OPERATION",
        {
          fingerprint,
          productId: product.id,
          operation: data.operation,
          units,
          boxes: data.boxes,
          quantity: data.quantity,
          packSize: data.packSize,
          reason: data.reason,
        },
      );
      return { ok: true };
    }
    if (action === "inventory-mode") {
      requireBar(ctx, "catalog");
      await tx.companySettings.update({
        where: { companyId: ctx.companyId },
        data: { fullInventory: true },
      });
      await audit(
        tx,
        ctx,
        "CompanySettings",
        ctx.companyId,
        "INGREDIENT_INVENTORY_ENABLED",
      );
      return { ok: true };
    }
    if (action === "availability") {
      const data = z
        .object({ productId: id, available: z.boolean() })
        .parse(input);
      const product = await tx.barProduct.findFirst({
        where: { id: data.productId, companyId: ctx.companyId },
      });
      if (!product) throw new AppError("Producto no encontrado.", 404);
      await tx.barProduct.update({
        where: { id: product.id },
        data: { available: data.available },
      });
      await audit(
        tx,
        ctx,
        "BarProduct",
        product.id,
        "PRODUCT_AVAILABILITY_CHANGED",
        { before: product.available, available: data.available },
      );
      return { ok: true };
    }
    if (action === "category") {
      const data = z.object({ name, kind }).parse(input);
      const row = await tx.barCategory.create({
        data: { ...data, companyId: ctx.companyId },
      });
      await audit(tx, ctx, "BarCategory", row.id, "CATEGORY_CREATED", data);
      return row;
    }
    if (action === "supplier") {
      const data = z.object({ name, contact: text }).parse(input);
      const row = await tx.supplier.create({
        data: { ...data, companyId: ctx.companyId },
      });
      await audit(tx, ctx, "Supplier", row.id, "SUPPLIER_CREATED");
      return row;
    }
    if (action === "product") {
      const data = z
        .object({
          id: id.optional(),
          name,
          sku: name,
          description: text,
          kind,
          categoryId: id,
          supplierId: id.nullable().default(null),
          presentation: text,
          unit: name.default("unidad"),
          cost: money,
          price: money,
          ingredientOnly: z.boolean().default(false),
          minimum: quantity.default("0"),
          initialStock: quantity.default("0"),
          active: z.boolean().default(true),
          available: z.boolean().default(true),
          trackStock: z.boolean().default(false),
          image: z
            .union([
              z.literal(""),
              z.url().refine((v) => v.startsWith("https://")),
            ])
            .default(""),
          notes: text,
          taxId: id.nullable().default(null),
          customizations: z
            .array(
              z.object({
                key: name,
                label: name,
                kind: z.enum(["REMOVE", "EXTRA", "OPTION"]),
                group: z.string().trim().max(100).optional(),
                required: z.boolean().optional(),
                price: money.default("0"),
              }),
            )
            .max(40)
            .default([]),
          components: z
            .array(
              z.object({
                ingredientId: id,
                quantity: quantity.refine((v) => Number(v) > 0),
              }),
            )
            .max(50)
            .default([]),
        })
        .parse(input);
      if (!data.ingredientOnly && Number(data.price) <= 0)
        throw new AppError("El precio debe ser positivo.");
      if (data.ingredientOnly) {
        const settings = await tx.companySettings.findUniqueOrThrow({
          where: { companyId: ctx.companyId },
        });
        if (!settings.fullInventory)
          throw new AppError("Activá primero el inventario de ingredientes.");
        if (data.kind !== "FOOD" || !data.trackStock || data.components.length)
          throw new AppError("Ingrediente de inventario inválido.");
      }
      const category = await tx.barCategory.findFirst({
        where: {
          id: data.categoryId,
          companyId: ctx.companyId,
          kind: data.kind,
        },
      });
      if (!category)
        throw new AppError("Categoría no válida para este producto.");
      if (
        data.supplierId &&
        !(await tx.supplier.findFirst({
          where: {
            id: data.supplierId,
            companyId: ctx.companyId,
            active: true,
          },
        }))
      )
        throw new AppError("Proveedor no válido.");
      if (
        data.taxId &&
        !(await tx.tax.findFirst({
          where: { id: data.taxId, companyId: ctx.companyId, active: true },
        }))
      )
        throw new AppError("Impuesto no válido.");
      if (data.kind === "COMBO" && !data.components.length)
        throw new AppError("Agrega los componentes de la promoción.");
      if (data.kind === "DRINK" && !data.trackStock)
        throw new AppError("Las bebidas deben controlar inventario.");
      if (data.components.length && data.trackStock)
        throw new AppError("Usa existencias propias o una receta, no ambos.");
      const existing = data.id
        ? await tx.barProduct.findFirst({
            where: { id: data.id, companyId: ctx.companyId },
          })
        : null;
      if (data.id && !existing)
        throw new AppError("Producto no encontrado.", 404);
      if (existing && existing.ingredientOnly !== data.ingredientOnly)
        throw new AppError(
          "No se puede convertir un ingrediente en un producto del menú.",
        );
      if (existing && existing.trackStock !== data.trackStock)
        throw new AppError(
          "No se puede cambiar el control de inventario de un producto existente.",
        );
      const ingredients = await tx.barProduct.findMany({
        where: {
          companyId: ctx.companyId,
          id: { in: data.components.map((c) => c.ingredientId) },
          trackStock: true,
        },
        include: { product: true },
      });
      if (
        new Set(data.components.map((c) => c.ingredientId)).size !==
          data.components.length ||
        ingredients.length !== data.components.length ||
        data.components.some((c) => c.ingredientId === data.id)
      )
        throw new AppError(
          "Componentes inválidos. Usa ingredientes con existencias propias, sin duplicados.",
        );
      const productData = {
        name: data.name,
        sku: data.sku,
        description: data.description,
        category: category.name,
        type: data.trackStock ? ("PRODUCT" as const) : ("SERVICE" as const),
        unit: data.unit,
        price: data.price,
        currency: "NIO" as const,
        active: data.active,
        taxId: data.taxId,
      };
      const product = existing
        ? await tx.product.update({
            where: { id: existing.id },
            data: productData,
          })
        : await tx.product.create({
            data: { ...productData, companyId: ctx.companyId },
          });
      if (
        new Set(data.customizations.map((c) => c.key)).size !==
          data.customizations.length ||
        data.customizations.some(
          (c) => c.kind === "REMOVE" && Number(c.price) !== 0,
        )
      )
        throw new AppError("Opciones duplicadas o retiro con precio inválido.");
      const meta = {
        customizations: data.customizations,
        kind: data.kind,
        categoryId: data.categoryId,
        supplierId: data.supplierId,
        presentation: data.presentation,
        ingredientOnly: data.ingredientOnly,
        cost:
          data.components.length && ingredients.some((i) => i.ingredientOnly)
            ? amount(
                data.components.reduce(
                  (n, c) =>
                    n.plus(
                      decimal(
                        ingredients
                          .find((i) => i.id === c.ingredientId)!
                          .cost.toString(),
                      ).times(c.quantity),
                    ),
                  decimal(0),
                ),
              )
            : data.cost,
        minimum: data.minimum,
        trackStock: data.trackStock,
        available: data.available,
        image: data.image,
        notes: data.notes,
      };
      if (existing)
        await tx.barProduct.update({ where: { id: product.id }, data: meta });
      else
        await tx.barProduct.create({
          data: { id: product.id, companyId: ctx.companyId, ...meta },
        });
      await tx.recipePart.deleteMany({
        where: { parentId: product.id, companyId: ctx.companyId },
      });
      for (const component of data.components)
        await tx.recipePart.create({
          data: {
            ...component,
            companyId: ctx.companyId,
            parentId: product.id,
          },
        });
      if (!existing && data.trackStock && Number(data.initialStock) > 0)
        await movement(
          tx,
          ctx,
          product.id,
          data.initialStock,
          "ENTRY",
          "Existencia inicial",
        );
      await audit(
        tx,
        ctx,
        "Product",
        product.id,
        existing ? "BAR_PRODUCT_UPDATED" : "BAR_PRODUCT_CREATED",
        { price: data.price, cost: data.cost },
      );
      return product;
    }
    if (action === "stock") {
      const data = z
        .object({
          productId: id,
          type: z.enum(["ENTRY", "EXIT", "ADJUSTMENT"]),
          quantity: quantity.refine((v) => Number(v) > 0),
          direction: z.enum(["ADD", "SUBTRACT"]).default("ADD"),
          reason: name,
        })
        .parse(input);
      const negative =
        data.type === "EXIT" ||
        (data.type === "ADJUSTMENT" && data.direction === "SUBTRACT");
      await movement(
        tx,
        ctx,
        data.productId,
        (negative ? "-" : "") + data.quantity,
        data.type,
        data.reason,
      );
      return { ok: true };
    }
    if (action === "table") {
      requireBar(ctx, "catalog");
      const data = z
        .object({ name, seats: z.coerce.number().int().min(1).max(100) })
        .parse(input);
      const row = await tx.diningTable.create({
        data: { ...data, companyId: ctx.companyId },
      });
      await audit(tx, ctx, "DiningTable", row.id, "TABLE_CREATED");
      return row;
    }
    if (action === "reserve") {
      const data = z
        .object({ tableId: id, reserved: z.boolean() })
        .parse(input);
      const table = await tx.diningTable.findFirst({
        where: { id: data.tableId, companyId: ctx.companyId },
      });
      if (!table) throw new AppError("Mesa no encontrada.", 404);
      if (
        await tx.barOrder.count({
          where: {
            companyId: ctx.companyId,
            tableId: table.id,
            status: { notIn: ["PAID", "CANCELLED"] },
          },
        })
      )
        throw new AppError("La mesa tiene una orden activa.", 409);
      await tx.diningTable.update({
        where: { id: table.id },
        data: { reserved: data.reserved },
      });
      await audit(tx, ctx, "DiningTable", table.id, "TABLE_RESERVATION", {
        reserved: data.reserved,
      });
      return { ok: true };
    }
    if (action === "open") {
      const data = z
        .object({
          opening: money,
          notes: text,
          overrideReason: text,
          previousCounted: money.optional(),
          inventoryCounts: beverageCounts,
        })
        .parse(input);
      const settings = await tx.companySettings.findUniqueOrThrow({
        where: { companyId: ctx.companyId },
      });
      if (!settings.sandboxDemo && !barClock(now).operating)
        throw new AppError(
          "La apertura está disponible de 11:30 a 00:30.",
          409,
        );
      const previous = await tx.businessDay.findFirst({
        where: { companyId: ctx.companyId, status: "OPEN" },
      });
      const date = new Date(barClock(now).date);
      const already = await tx.businessDay.findFirst({
        where: { companyId: ctx.companyId, date },
      });
      if (previous || already) {
        if (ctx.role !== "ADMIN" || !data.overrideReason)
          throw new AppError(
            "Ya existe una jornada abierta o registrada. Una segunda apertura requiere ADMIN y motivo.",
            409,
          );
        if (previous) {
          if (data.previousCounted === undefined)
            throw new AppError(
              "Registrá el efectivo contado de la caja anterior para autorizar una nueva apertura.",
              409,
            );
          if (
            await tx.barOrder.count({
              where: {
                companyId: ctx.companyId,
                businessDayId: previous.id,
                status: { notIn: ["PAID", "CANCELLED"] },
              },
            })
          )
            throw new AppError(
              "Cobra o anula las órdenes pendientes antes de reemplazar la caja.",
              409,
            );
          const beverages = await closeBeverages(tx, ctx, data.inventoryCounts);
          const summary = await daySummary(tx, ctx, previous.id);
          const expected = amount(
            decimal(previous.opening.toString())
              .plus(summary.cash)
              .minus(summary.cashExpenses),
          );
          const difference = amount(
            decimal(data.previousCounted).minus(expected),
          );
          const closeData = {
            beverages,
            ...summary,
            opening: previous.opening.toFixed(2),
            expected,
            counted: data.previousCounted,
            difference,
            result: decimal(difference).isZero()
              ? "BALANCED"
              : decimal(difference).gt(0)
                ? "SURPLUS"
                : "SHORTAGE",
            notes: "Cierre por reapertura autorizada: " + data.overrideReason,
          };
          await tx.businessDay.update({
            where: { id: previous.id },
            data: {
              status: "CLOSED",
              closedAt: now,
              closedBy: ctx.userId,
              closeData,
            },
          });
          await audit(
            tx,
            ctx,
            "BusinessDay",
            previous.id,
            "CASH_CLOSED",
            closeData,
          );
        }
        await audit(
          tx,
          ctx,
          "BusinessDay",
          previous?.id || already!.id,
          "CASH_REOPEN_AUTHORIZED",
          { reason: data.overrideReason, opening: data.opening },
        );
      }
      const row = await tx.businessDay.create({
        data: {
          companyId: ctx.companyId,
          date,
          openedBy: ctx.userId,
          openedAt: now,
          opening: data.opening,
          notes: data.notes,
        },
      });
      await audit(tx, ctx, "BusinessDay", row.id, "CASH_OPENED", {
        opening: data.opening,
        notes: data.notes,
      });
      return row;
    }
    if (action === "create-order") {
      const data = z
        .object({
          tableId: id.nullable().default(null),
          channel: z.enum([
            "TABLE",
            "BAR",
            "TAKEAWAY",
            "PICKUP",
            "DINE_IN",
            "DELIVERY",
            "COURTESY",
            "INTERNAL",
          ]),
          deliverySource: z
            .enum(["PEYA", "WHATSAPP", "VALAZO", "DIRECT", "OTHER"])
            .or(z.literal(""))
            .default(""),
          deliveryReference: text,
          customerId: id.nullable().default(null),
          customerName: text,
          notes: text,
        })
        .parse(input);
      if (data.channel === "DELIVERY" && !data.deliverySource)
        throw new AppError("Indicá el origen del pedido delivery.");
      if (data.channel !== "DELIVERY" && data.deliverySource)
        throw new AppError("El origen externo solo aplica a delivery.");
      const day = await openDay(tx, ctx, now, true);
      if ((data.channel === "TABLE") !== Boolean(data.tableId))
        throw new AppError("Selecciona una mesa o un canal sin mesa.");
      if (data.tableId) {
        const table = await tx.diningTable.findFirst({
          where: { id: data.tableId, companyId: ctx.companyId, active: true },
        });
        if (!table) throw new AppError("Mesa no encontrada.", 404);
        const active = await tx.barOrder.findFirst({
          where: {
            companyId: ctx.companyId,
            tableId: data.tableId,
            status: { notIn: ["PAID", "CANCELLED"] },
          },
        });
        if (active) return active;
        await tx.diningTable.update({
          where: { id: data.tableId },
          data: { reserved: false },
        });
      }
      if (
        data.customerId &&
        !(await tx.customer.findFirst({
          where: {
            id: data.customerId,
            companyId: ctx.companyId,
            active: true,
          },
        }))
      )
        throw new AppError("Cliente no válido.");
      const last = await tx.barOrder.aggregate({
        where: { companyId: ctx.companyId },
        _max: { number: true },
      });
      const row = await tx.barOrder.create({
        data: {
          ...data,
          companyId: ctx.companyId,
          businessDayId: day.id,
          number: (last._max.number || 0) + 1,
          responsibleId: ctx.userId,
          responsibleName: ctx.name,
          openedAt: now,
        },
      });
      await audit(tx, ctx, "BarOrder", row.id, "ORDER_CREATED", {
        number: row.number,
        channel: row.channel,
      });
      return row;
    }
    if (action === "close") {
      const data = z
        .object({
          counted: money,
          notes: text,
          inventoryCounts: beverageCounts,
        })
        .parse(input);
      const day = await openDay(tx, ctx, now);
      if (
        await tx.barOrder.count({
          where: {
            companyId: ctx.companyId,
            businessDayId: day.id,
            status: { notIn: ["PAID", "CANCELLED"] },
          },
        })
      )
        throw new AppError(
          "Cobra o anula todas las órdenes antes de cerrar.",
          409,
        );
      const beverages = await closeBeverages(tx, ctx, data.inventoryCounts);
      const summary = await daySummary(tx, ctx, day.id);
      const expected = amount(
        decimal(day.opening.toString())
          .plus(summary.cash)
          .minus(summary.cashExpenses),
      );
      const difference = amount(decimal(data.counted).minus(expected));
      const closeData = {
        beverages,
        ...summary,
        opening: day.opening.toFixed(2),
        expected,
        counted: data.counted,
        difference,
        result: decimal(difference).isZero()
          ? "BALANCED"
          : decimal(difference).gt(0)
            ? "SURPLUS"
            : "SHORTAGE",
        notes: data.notes,
      };
      const row = await tx.businessDay.update({
        where: { id: day.id },
        data: {
          status: "CLOSED",
          closedAt: now,
          closedBy: ctx.userId,
          closeData,
        },
      });
      await audit(tx, ctx, "BusinessDay", row.id, "CASH_CLOSED", closeData);
      return row;
    }
    if (action === "adjust-close") {
      const data = z
        .object({ dayId: id, counted: money, reason: name })
        .parse(input);
      const day = await tx.businessDay.findFirst({
        where: { id: data.dayId, companyId: ctx.companyId, status: "CLOSED" },
      });
      if (!day || !day.closeData)
        throw new AppError("Cierre no encontrado.", 404);
      const previous = day.closeData as Record<string, Prisma.InputJsonValue>;
      const difference = amount(
        decimal(data.counted).minus(String(previous.expected)),
      );
      const correction = {
        ...previous,
        counted: data.counted,
        difference,
        result: decimal(difference).isZero()
          ? "BALANCED"
          : decimal(difference).gt(0)
            ? "SURPLUS"
            : "SHORTAGE",
        adjustedBy: ctx.userId,
        adjustedAt: now.toISOString(),
        reason: data.reason,
        original: previous.original || previous,
      };
      await tx.businessDay.update({
        where: { id: day.id },
        data: { closeData: correction },
      });
      await audit(tx, ctx, "BusinessDay", day.id, "CASH_CLOSE_ADJUSTED", {
        before: previous,
        after: correction,
        reason: data.reason,
      });
      return { ok: true };
    }
    const orderId = z.object({ orderId: id }).parse(input).orderId;
    const order = await getOrder(tx, ctx, orderId);
    if (action === "dispatch") {
      const data = z.object({ requestId: z.uuid() }).parse(input);
      const existing = await tx.kitchenDispatch.findUnique({
        where: {
          companyId_requestId: {
            companyId: ctx.companyId,
            requestId: data.requestId,
          },
        },
      });
      if (existing) {
        if (existing.orderId !== order.id)
          throw new AppError("Solicitud usada para otra orden.", 409);
        return existing;
      }
      if (closed(order.status))
        throw new AppError("La orden está cerrada.", 409);
      const sent = new Set(
        order.dispatches.flatMap((d) =>
          (d.items as { id: string }[]).map((i) => i.id),
        ),
      );
      const pending = order.items.filter(
        (i) => i.kind === "FOOD" && !sent.has(i.id),
      );
      if (!pending.length)
        throw new AppError("No hay platos nuevos para enviar a cocina.", 409);
      const dispatchProducts = await tx.barProduct.findMany({
        where: {
          companyId: ctx.companyId,
          id: { in: pending.map((i) => i.productId) },
        },
        select: {
          id: true,
          available: true,
          customizations: true,
          product: { select: { name: true, active: true } },
        },
      });
      const unavailable = dispatchProducts.filter(
        (p) => !p.available || !p.product.active,
      );
      if (unavailable.length)
        throw new AppError(
          "No se envió la comanda. Productos agotados o retirados del menú: " +
            unavailable.map((p) => p.product.name).join(", ") +
            ". Quitalos o reemplazalos antes de enviar.",
          409,
        );
      for (const item of pending) {
        await assertIngredientStock(
          tx,
          ctx,
          item.inventoryParts as { productId: string; quantity: string }[],
          item.quantity,
          item.id,
        );
        const product = dispatchProducts.find((p) => p.id === item.productId);
        if (!product) throw new AppError("Producto no encontrado.", 404);
        const options = product.customizations as Modifier[];
        const saved = item.customizations as Modifier[];
        try {
          selectModifiers(
            [
              ...options,
              ...saved.filter((c) => !options.some((o) => o.key === c.key)),
            ],
            saved.map((c) => c.key),
          );
        } catch (error) {
          throw new AppError(
            item.name +
              ": " +
              (error instanceof Error
                ? error.message
                : "Revisá su preparación."),
            409,
          );
        }
      }
      const dispatch = await tx.kitchenDispatch.create({
        data: {
          companyId: ctx.companyId,
          orderId: order.id,
          requestId: data.requestId,
          createdBy: ctx.userId,
          createdAt: now,
          items: pending.map((i) => ({
            id: i.id,
            name: i.name,
            quantity: i.quantity,
            notes: i.notes,
          })),
        },
      });
      await tx.barOrder.update({
        where: { id: order.id },
        data: { status: "IN_PROGRESS" },
      });
      await audit(tx, ctx, "BarOrder", order.id, "KITCHEN_DISPATCH_CREATED", {
        dispatchId: dispatch.id,
        itemIds: pending.map((i) => i.id),
      });
      return dispatch;
    }
    if (action === "invoice") {
      if (order.status !== "PAID" || !order.invoiceId)
        throw new AppError("Primero completa el pago.", 409);
      if (order.formalInvoice) return order.invoice;
      const invoice = await tx.invoice.update({
        where: { id: order.invoiceId },
        data: {
          documentNumber: await nextNumber(tx, ctx.companyId, "invoice"),
        },
      });
      await tx.barOrder.update({
        where: { id: order.id },
        data: { formalInvoice: true },
      });
      await audit(tx, ctx, "Invoice", invoice.id, "INVOICE_ISSUED", {
        orderId: order.id,
        documentNumber: invoice.documentNumber,
      });
      return invoice;
    }
    if (action === "pay") return payOrder(tx, ctx, order, input, now);
    if (action === "kitchen") {
      const data = z
        .object({
          itemId: id,
          status: z.enum(["PREPARING", "READY", "SERVED"]),
        })
        .parse(input);
      if (closed(order.status))
        throw new AppError("La orden está cerrada.", 409);
      const item = order.items.find(
        (i) => i.id === data.itemId && i.kind === "FOOD",
      );
      const next = {
        PENDING: "PREPARING",
        PREPARING: "READY",
        READY: "SERVED",
        SERVED: "",
      };
      if (!item || next[item.kitchenStatus] !== data.status)
        throw new AppError("Transición de cocina no válida.", 409);
      await tx.barOrderItem.update({
        where: { id: item.id },
        data: { kitchenStatus: data.status },
      });
      const foods = order.items
        .filter((i) => i.kind === "FOOD")
        .map((i) => (i.id === item.id ? data.status : i.kitchenStatus));
      const status = foods.every((s) => s === "SERVED")
        ? "SERVED"
        : foods.every((s) => s === "READY" || s === "SERVED")
          ? "READY"
          : "IN_PROGRESS";
      await tx.barOrder.update({ where: { id: order.id }, data: { status } });
      await audit(tx, ctx, "BarOrder", order.id, "KITCHEN_STATUS_CHANGED", {
        itemId: item.id,
        status: data.status,
      });
      return { ok: true };
    }
    editable(order);
    await openDay(tx, ctx, now, action !== "cancel");
    if (action === "add-item" || action === "update-item") {
      const data = z
        .object({
          choices: z.array(name).max(40).default([]),
          productId: id,
          itemId: id.optional(),
          quantity: z.coerce.number().int().min(1).max(1000),
          notes: text,
        })
        .parse(input);
      const p = await tx.barProduct.findFirst({
        where: {
          id: data.productId,
          companyId: ctx.companyId,
          ingredientOnly: false,
          ...(action === "add-item"
            ? { available: true, product: { active: true } }
            : {}),
        },
        include: {
          product: { include: { tax: true } },
          components: { include: { ingredient: true } },
        },
      });
      if (!p) throw new AppError("Producto no disponible.", 404);
      const previous =
        action === "update-item"
          ? order.items.find(
              (i) => i.id === data.itemId && i.productId === p.id,
            )
          : null;
      if (action === "update-item" && !previous)
        throw new AppError("Artículo no encontrado.", 404);
      if (previous?.kind === "FOOD" && previous.kitchenStatus !== "PENDING")
        requireBar(ctx, "catalog");
      const parts = p.trackStock
        ? [{ productId: p.id, quantity: "1" }]
        : p.components.map((c) => ({
            productId: c.ingredientId,
            quantity: c.quantity.toString(),
            ...(c.ingredient.ingredientOnly
              ? { unitCost: c.ingredient.cost.toString() }
              : {}),
          }));
      await assertIngredientStock(
        tx,
        ctx,
        (previous?.inventoryParts as
          { productId: string; quantity: string }[] | undefined) || parts,
        data.quantity,
        previous?.id,
      );
      const catalogOptions = p.customizations as Modifier[];
      const savedOptions = (previous?.customizations ||
        []) as typeof catalogOptions;
      const available = [
        ...catalogOptions.map(
          (c) => savedOptions.find((s) => s.key === c.key) || c,
        ),
        ...savedOptions.filter(
          (c) => !catalogOptions.some((s) => s.key === c.key),
        ),
      ];
      let selected: Modifier[];
      try {
        selected = selectModifiers(available, data.choices);
      } catch (error) {
        throw new AppError(
          error instanceof Error ? error.message : "Opciones no válidas.",
        );
      }
      const unitPrice = amount(
        selected.reduce(
          (n, c) => n.plus(c.price),
          previous
            ? decimal(previous.unitPrice.toString()).minus(
                (previous.customizations as { price: string }[]).reduce(
                  (n, c) => n.plus(c.price),
                  decimal(0),
                ),
              )
            : decimal(p.product.price.toString()),
        ),
      );
      if (decimal(unitPrice).lt(0))
        throw new AppError(
          "Revisá el precio autorizado antes de quitar este extra.",
        );
      const notes = [...selected.map(modifierLabel), data.notes]
        .filter(Boolean)
        .join(" · ");
      const itemData = {
        companyId: ctx.companyId,
        orderId: order.id,
        productId: p.id,
        name: p.product.name,
        kind: p.kind,
        quantity: data.quantity,
        unitPrice,
        customizations: selected,
        taxRate:
          previous?.taxRate ??
          (p.product.tax?.active ? p.product.tax.rate : "0"),
        notes,
        inventoryParts: previous?.inventoryParts || parts,
        kitchenStatus:
          p.kind === "FOOD" ? ("PENDING" as const) : ("SERVED" as const),
      };
      if (
        previous &&
        previous.quantity === data.quantity &&
        previous.notes === notes &&
        previous.unitPrice.equals(unitPrice) &&
        JSON.stringify(previous.customizations) === JSON.stringify(selected)
      )
        return { ...previous, correctionDispatchId: null };
      const item = previous
        ? await tx.barOrderItem.update({
            where: { id: previous.id },
            data: itemData,
          })
        : await tx.barOrderItem.create({ data: itemData });
      let correctionDispatchId: string | null = null;
      if (
        previous &&
        order.dispatches.some((d) =>
          (d.items as { id: string }[]).some((i) => i.id === previous.id),
        )
      ) {
        const dispatch = await tx.kitchenDispatch.create({
          data: {
            companyId: ctx.companyId,
            orderId: order.id,
            requestId: crypto.randomUUID(),
            createdBy: ctx.userId,
            createdAt: now,
            items: [
              {
                id: item.id,
                name: "CAMBIO · " + item.name,
                quantity: item.quantity,
                notes: `ANTES: ${previous.quantity} × ${previous.name} · ${previous.notes || "Sin cambios"}\nAHORA: ${item.quantity} × ${item.name} · ${item.notes || "Sin cambios"}\nReemplaza la preparación anterior; no es un plato adicional.`,
              },
            ],
          },
        });
        correctionDispatchId = dispatch.id;
      }
      await tx.barOrder.update({
        where: { id: order.id },
        data: { status: correctionDispatchId ? "IN_PROGRESS" : "OPEN" },
      });
      await totals(tx, ctx, order.id);
      await audit(
        tx,
        ctx,
        "BarOrder",
        order.id,
        previous ? "ORDER_ITEM_UPDATED" : "ORDER_ITEM_ADDED",
        {
          itemId: item.id,
          quantity: data.quantity,
          productId: p.id,
          ...(previous
            ? {
                before: { quantity: previous.quantity, notes: previous.notes },
                correctionDispatchId,
              }
            : {}),
        },
      );
      return { ...item, correctionDispatchId };
    }
    if (action === "remove-item") {
      const data = z.object({ itemId: id, reason: name }).parse(input);
      const item = order.items.find((i) => i.id === data.itemId);
      if (!item) throw new AppError("Línea no encontrada.", 404);
      if (item.kitchenStatus !== "PENDING" && item.kind === "FOOD")
        requireBar(ctx, "catalog");
      await tx.barOrderItem.delete({ where: { id: item.id } });
      await totals(tx, ctx, order.id);
      await audit(tx, ctx, "BarOrder", order.id, "ORDER_ITEM_REMOVED", {
        itemId: item.id,
        name: item.name,
        quantity: item.quantity,
        reason: data.reason,
      });
      return { ok: true };
    }
    if (action === "terms") {
      requireBar(ctx, "catalog");
      const data = z
        .object({
          discountRate: rate,
          tip: money,
          reason: name,
          itemId: id.optional(),
          unitPrice: money.optional(),
        })
        .parse(input);
      if (data.itemId) {
        if (
          !order.items.some((i) => i.id === data.itemId) ||
          data.unitPrice === undefined
        )
          throw new AppError("Línea o precio no válido.");
        await tx.barOrderItem.update({
          where: { id: data.itemId },
          data: { unitPrice: data.unitPrice },
        });
        await audit(tx, ctx, "BarOrder", order.id, "ORDER_PRICE_CHANGED", {
          itemId: data.itemId,
          unitPrice: data.unitPrice,
          reason: data.reason,
        });
      }
      await tx.barOrder.update({
        where: { id: order.id },
        data: { discountRate: data.discountRate, tip: data.tip },
      });
      await totals(tx, ctx, order.id);
      await audit(tx, ctx, "BarOrder", order.id, "ORDER_DISCOUNT_CHANGED", {
        discountRate: data.discountRate,
        tip: data.tip,
        reason: data.reason,
      });
      return { ok: true };
    }
    if (action === "cancel") {
      const data = z.object({ reason: name }).parse(input);
      requireBar(ctx, "catalog");
      await tx.barOrder.update({
        where: { id: order.id },
        data: {
          status: "CANCELLED",
          closedAt: now,
          notes: order.notes + "\nAnulación: " + data.reason,
        },
      });
      await audit(tx, ctx, "BarOrder", order.id, "ORDER_CANCELLED", {
        reason: data.reason,
      });
      return { ok: true };
    }
    if (action === "status") {
      const data = z
        .object({ status: z.enum(["IN_PROGRESS", "READY", "SERVED"]) })
        .parse(input);
      const transitions: Record<string, string[]> = {
        OPEN: ["IN_PROGRESS"],
        IN_PROGRESS: ["READY"],
        READY: ["SERVED"],
        SERVED: [],
      };
      if (!transitions[order.status]?.includes(data.status))
        throw new AppError("Transición de orden no válida.", 409);
      if (
        order.items.some(
          (i) =>
            i.kind === "FOOD" &&
            (data.status === "SERVED"
              ? i.kitchenStatus !== "SERVED"
              : data.status === "READY" &&
                !["READY", "SERVED"].includes(i.kitchenStatus)),
        )
      )
        throw new AppError("Actualiza primero los platos de cocina.", 409);
      await tx.barOrder.update({
        where: { id: order.id },
        data: { status: data.status },
      });
      await audit(tx, ctx, "BarOrder", order.id, "ORDER_STATUS_CHANGED", {
        status: data.status,
      });
      return { ok: true };
    }
    throw new AppError("Acción no válida.", 404);
  }, true);
}
async function payOrder(
  tx: Tx,
  ctx: Context,
  order: Awaited<ReturnType<typeof getOrder>>,
  input: unknown,
  now: Date,
) {
  const data = z
    .object({
      requestId: z.uuid(),
      payments: z
        .array(
          z.object({
            amount: money.refine((v) => Number(v) > 0),
            method: z.enum([
              "CASH",
              "CARD",
              "BANK_TRANSFER",
              "COURTESY",
              "OTHER",
            ]),
            person: text,
            reference: text,
          }),
        )
        .min(1)
        .max(50),
    })
    .parse(input);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(data.payments))
    .digest("hex");
  const previous = await tx.auditLog.findFirst({
    where: {
      companyId: ctx.companyId,
      action: "ORDER_PAYMENT_BATCH",
      metadata: { path: ["requestId"], equals: data.requestId },
    },
  });
  if (previous) {
    if (
      previous.entityId !== order.id ||
      (previous.metadata as Record<string, string>).fingerprint !== fingerprint
    )
      throw new AppError("Clave de pago usada con otros datos.", 409);
    return getOrder(tx, ctx, order.id);
  }
  if (closed(order.status) || !order.items.length)
    throw new AppError("La orden está cerrada o no contiene productos.", 409);
  const day = await openDay(tx, ctx, now);
  if (day.id !== order.businessDayId)
    throw new AppError("La jornada de esta orden no está abierta.", 409);
  if (data.payments.some((p) => p.method === "COURTESY"))
    requireBar(ctx, "catalog");
  const incoming = data.payments.reduce((n, p) => n.plus(p.amount), decimal(0));
  const already = order.payments.reduce(
    (n, p) => n.plus(p.amount.toString()),
    decimal(0),
  );
  const balances = paymentBalance(order.total.toString(), already, incoming);
  let invoiceId = order.invoiceId;
  if (!invoiceId) {
    const company = await tx.company.findUniqueOrThrow({
      where: { id: ctx.companyId },
      include: { settings: true },
    });
    let customer = order.customerId
      ? await tx.customer.findFirst({
          where: { id: order.customerId, companyId: ctx.companyId },
        })
      : null;
    if (!customer) {
      const walkinId = "bar-walkin-" + ctx.companyId;
      customer = await tx.customer.upsert({
        where: { id: walkinId },
        create: {
          id: walkinId,
          companyId: ctx.companyId,
          name: "Consumidor final",
        },
        update: {},
      });
    }
    const calc = calculateDocument(
      order.items.map((i) => ({
        productId: i.productId,
        description: i.name,
        quantity: String(i.quantity),
        unitPrice: i.unitPrice.toString(),
        taxRate: i.taxRate.toString(),
        discountRate: "0",
      })),
      order.discountRate.toString(),
    );
    const items = calc.items.map((i) => ({
      ...i,
      reportGroup: "BAR",
    }));
    if (order.tip.gt(0))
      items.push({
        productId: null,
        description: "Propina voluntaria",
        quantity: "1",
        unitPrice: order.tip.toString(),
        discountRate: "0",
        taxRate: "0",
        subtotal: order.tip.toString(),
        discount: "0",
        tax: "0",
        total: order.tip.toString(),
        position: items.length,
        reportGroup: "BAR",
      });
    const invoice = await tx.invoice.create({
      data: {
        companyId: ctx.companyId,
        customerId: customer.id,
        documentNumber: `ORD-${String(order.number).padStart(6, "0")}`,
        date: day.date,
        currency: "NIO",
        exchangeRate: company.settings!.exchangeRate,
        status: "PENDING",
        discountRate: order.discountRate,
        subtotal: amount(
          decimal(order.subtotal.toString()).plus(order.tip.toString()),
        ),
        discountTotal: order.discountTotal,
        taxTotal: order.taxTotal,
        total: order.total,
        balanceDue: order.total,
        notes: order.notes,
        customerSnapshot: JSON.parse(JSON.stringify(customer)),
        companySnapshot: JSON.parse(JSON.stringify(company)),
        items: { create: items },
      },
    });
    invoiceId = invoice.id;
    await tx.barOrder.update({ where: { id: order.id }, data: { invoiceId } });
  }
  let running = already;
  for (const [index, p] of data.payments.entries()) {
    running = running.plus(p.amount);
    const payment = await tx.payment.create({
      data: {
        companyId: ctx.companyId,
        invoiceId,
        amount: p.amount,
        currency: "NIO",
        paymentDate: day.date,
        method: p.method,
        reference: p.reference,
        notes: p.person,
        createdAt: now,
      },
    });
    const receipt = await tx.receipt.create({
      data: {
        companyId: ctx.companyId,
        paymentId: payment.id,
        invoiceId,
        documentNumber: await nextNumber(tx, ctx.companyId, "receipt"),
        balanceRemaining: amount(
          decimal(order.total.toString()).minus(running),
        ),
      },
    });
    await tx.barPayment.create({
      data: {
        companyId: ctx.companyId,
        orderId: order.id,
        paymentId: payment.id,
        amount: p.amount,
        method: p.method,
        person: p.person,
        reference: p.reference,
        requestId: data.requestId + ":" + index,
        createdAt: now,
      },
    });
    await audit(tx, ctx, "Payment", payment.id, "PAYMENT_CREATED", {
      orderId: order.id,
      receiptId: receipt.id,
      amount: p.amount,
      method: p.method,
      person: p.person,
    });
  }
  await tx.invoice.update({
    where: { id: invoiceId },
    data: {
      ...balances,
      status: decimal(balances.balanceDue).isZero() ? "PAID" : "PARTIALLY_PAID",
    },
  });
  if (decimal(balances.balanceDue).isZero()) {
    // Aggregate all direct/recipe components before decrementing; transaction rolls back payments if insufficient.
    const usage = new Map<string, ReturnType<typeof decimal>>();
    for (const item of order.items)
      for (const part of item.inventoryParts as {
        productId: string;
        quantity: string;
      }[]) {
        usage.set(
          part.productId,
          (usage.get(part.productId) || decimal(0)).plus(
            decimal(part.quantity).times(item.quantity),
          ),
        );
      }
    if (order.stockApplied)
      throw new AppError("El inventario ya fue aplicado.", 409);
    for (const [productId, q] of usage)
      await movement(
        tx,
        ctx,
        productId,
        q.negated().toFixed(4),
        "SALE",
        `Venta orden #${order.number}`,
        order.id,
      );
    await tx.barOrder.update({
      where: { id: order.id },
      data: { status: "PAID", closedAt: now, stockApplied: true },
    });
    await audit(tx, ctx, "BarOrder", order.id, "ORDER_PAID", {
      total: order.total.toString(),
    });
  }
  await audit(tx, ctx, "BarOrder", order.id, "ORDER_PAYMENT_BATCH", {
    requestId: data.requestId,
    fingerprint,
  });
  return getOrder(tx, ctx, order.id);
}
export async function daySummary(tx: Tx, ctx: Context, dayId: string) {
  const orders = await tx.barOrder.findMany({
    where: { companyId: ctx.companyId, businessDayId: dayId },
    include: { payments: true, items: true },
  });
  const expenses = await tx.barExpense.findMany({
    where: { companyId: ctx.companyId, businessDayId: dayId },
  });
  const paid = orders.filter((o) => o.status === "PAID");
  const sum = (field: "total" | "taxTotal" | "discountTotal" | "tip") =>
    amount(paid.reduce((n, o) => n.plus(o[field].toString()), decimal(0)));
  const methods = ["CASH", "CARD", "BANK_TRANSFER", "COURTESY", "OTHER"].map(
    (method) => ({
      method,
      amount: amount(
        orders
          .flatMap((o) => o.payments)
          .filter((p) => p.method === method)
          .reduce((n, p) => n.plus(p.amount.toString()), decimal(0)),
      ),
    }),
  );
  return {
    expenses: amount(
      expenses.reduce((n, e) => n.plus(e.amount.toString()), decimal(0)),
    ),
    cashExpenses: amount(
      expenses
        .filter((e) => e.method === "CASH")
        .reduce((n, e) => n.plus(e.amount.toString()), decimal(0)),
    ),
    sales: sum("total"),
    tax: sum("taxTotal"),
    discounts: sum("discountTotal"),
    tips: sum("tip"),
    cash: methods[0].amount,
    card: methods[1].amount,
    transfer: methods[2].amount,
    methods,
    orderCount: paid.length,
    cancelled: orders.filter((o) => o.status === "CANCELLED").length,
    voidedAmount: amount(
      orders
        .filter((o) => o.status === "CANCELLED")
        .reduce((n, o) => n.plus(o.total.toString()), decimal(0)),
    ),
    average: amount(paid.length ? decimal(sum("total")).div(paid.length) : 0),
    open: orders.filter((o) => !closed(o.status)).length,
  };
}
export async function barSnapshot(ctx: Context, includeForecast = false) {
  requireBar(ctx, "read");
  const [
    day,
    categories,
    suppliers,
    products,
    tables,
    orders,
    days,
    customers,
    taxes,
  ] = await Promise.all([
    db.businessDay.findFirst({
      where: { companyId: ctx.companyId, status: "OPEN" },
    }),
    db.barCategory.findMany({
      where: { companyId: ctx.companyId },
      orderBy: { name: "asc" },
    }),
    db.supplier.findMany({
      where: { companyId: ctx.companyId },
      orderBy: { name: "asc" },
    }),
    db.barProduct.findMany({
      where: { companyId: ctx.companyId },
      include: {
        product: { include: { tax: true } },
        category: true,
        supplier: true,
        components: true,
      },
      orderBy: { product: { name: "asc" } },
    }),
    db.diningTable.findMany({
      where: { companyId: ctx.companyId, active: true },
      orderBy: { name: "asc" },
    }),
    db.barOrder.findMany({
      where: {
        companyId: ctx.companyId,
        OR: [
          { status: { notIn: ["PAID", "CANCELLED"] } },
          {
            businessDay: {
              date: { gte: new Date(new Date().getTime() - 31 * 86400000) },
            },
          },
        ],
      },
      include: paidInclude,
      orderBy: { number: "desc" },
    }),
    db.businessDay.findMany({
      where: { companyId: ctx.companyId },
      orderBy: { date: "desc" },
      take: 60,
    }),
    db.customer.findMany({
      where: { companyId: ctx.companyId, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.tax.findMany({ where: { companyId: ctx.companyId, active: true } }),
  ]);
  const summary = day
    ? await transaction((tx) => daySummary(tx, ctx, day.id))
    : null;
  const movements = await db.inventoryMovement.findMany({
    where: { companyId: ctx.companyId },
    include: { product: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  const expenses =
    ["ADMIN", "MANAGER", "CASHIER", "VIEWER"].includes(ctx.role) && day
      ? await db.barExpense.findMany({
          where: { companyId: ctx.companyId, businessDayId: day.id },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            kind: true,
            method: true,
            amount: true,
            description: true,
            payee: true,
            reference: true,
            createdAt: true,
            attachment: true,
          },
        })
      : [];
  const settings = await db.companySettings.findUniqueOrThrow({
    where: { companyId: ctx.companyId },
  });
  const reserved = new Map<string, ReturnType<typeof decimal>>();
  for (const o of orders.filter(
    (o) => !["PAID", "CANCELLED"].includes(o.status),
  ))
    for (const item of o.items)
      for (const part of item.inventoryParts as {
        productId: string;
        quantity: string;
      }[])
        reserved.set(
          part.productId,
          (reserved.get(part.productId) || decimal(0)).plus(
            decimal(part.quantity).times(item.quantity),
          ),
        );
  const free = (p: (typeof products)[number]) =>
    decimal(p.stock.toString()).minus(reserved.get(p.id) || 0);
  return {
    fullInventory: settings.fullInventory,
    forecast:
      includeForecast && ["ADMIN", "MANAGER", "VIEWER"].includes(ctx.role)
        ? await salesForecast(ctx)
        : null,
    expenses: expenses.map(({ attachment, ...e }) => ({
      ...e,
      hasAttachment: Boolean(attachment),
    })),
    demo: settings.sandboxDemo,
    clock: {
      ...barClock(),
      operating: settings.sandboxDemo || barClock().operating,
    },
    day: ctx.role === "KITCHEN" ? null : day,
    summary: ctx.role === "KITCHEN" ? null : summary,
    categories,
    suppliers: ctx.role === "KITCHEN" ? [] : suppliers,
    products:
      ctx.role === "KITCHEN"
        ? []
        : products.map((p) => ({
            ...p,
            availableStock: free(p).toFixed(4),
            recipeAvailable: !p.components.some((c) => {
              const raw = products.find((i) => i.id === c.ingredientId);
              return raw?.ingredientOnly && free(raw).lt(c.quantity.toString());
            }),
            cost: ["ADMIN", "MANAGER", "VIEWER"].includes(ctx.role)
              ? p.components.some(
                  (c) =>
                    products.find((i) => i.id === c.ingredientId)
                      ?.ingredientOnly,
                )
                ? new Prisma.Decimal(
                    amount(
                      p.components.reduce(
                        (n, c) =>
                          n.plus(
                            decimal(
                              products
                                .find((i) => i.id === c.ingredientId)
                                ?.cost.toString() || "0",
                            ).times(c.quantity.toString()),
                          ),
                        decimal(0),
                      ),
                    ),
                  )
                : p.cost
              : new Prisma.Decimal(0),
          })),
    tables,
    orders:
      ctx.role === "KITCHEN"
        ? orders.map((o) => ({
            ...o,
            total: new Prisma.Decimal(0),
            subtotal: new Prisma.Decimal(0),
            discountTotal: new Prisma.Decimal(0),
            discountRate: new Prisma.Decimal(0),
            taxTotal: new Prisma.Decimal(0),
            tip: new Prisma.Decimal(0),
            payments: [],
            invoice: null,
            items: o.items.map((i) => ({
              ...i,
              unitPrice: new Prisma.Decimal(0),
              taxRate: new Prisma.Decimal(0),
            })),
          }))
        : orders,
    days: ctx.role === "KITCHEN" ? [] : days,
    customers: ctx.role === "KITCHEN" ? [] : customers,
    taxes,
    movements: ctx.role === "KITCHEN" ? [] : movements,
  };
}
