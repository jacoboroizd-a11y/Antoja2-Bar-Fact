-- CreateEnum
CREATE TYPE "BarKind" AS ENUM ('DRINK', 'FOOD', 'COMBO');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'READY', 'SERVED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "KitchenStatus" AS ENUM ('PENDING', 'PREPARING', 'READY', 'SERVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'MANAGER';
ALTER TYPE "Role" ADD VALUE 'CASHIER';
ALTER TYPE "Role" ADD VALUE 'WAITER';
ALTER TYPE "Role" ADD VALUE 'KITCHEN';

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'COURTESY';

-- CreateTable
CREATE TABLE "BarCategory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "BarKind" NOT NULL,

    CONSTRAINT "BarCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BarProduct" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "BarKind" NOT NULL,
    "categoryId" TEXT NOT NULL,
    "supplierId" TEXT,
    "presentation" TEXT NOT NULL DEFAULT '',
    "cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "stock" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "minimum" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "trackStock" BOOLEAN NOT NULL DEFAULT false,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "image" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "BarProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipePart" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "RecipePart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiningTable" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 4,
    "reserved" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DiningTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessDay" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedBy" TEXT NOT NULL,
    "opening" DECIMAL(18,2) NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "closeData" JSONB,

    CONSTRAINT "BusinessDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BarOrder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "businessDayId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "tableId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'TABLE',
    "customerId" TEXT,
    "customerName" TEXT NOT NULL DEFAULT '',
    "responsibleId" TEXT NOT NULL,
    "responsibleName" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "discountRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "tip" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "invoiceId" TEXT,
    "formalInvoice" BOOLEAN NOT NULL DEFAULT false,
    "stockApplied" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BarOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BarOrderItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "BarKind" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "taxRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "kitchenStatus" "KitchenStatus" NOT NULL DEFAULT 'PENDING',
    "inventoryParts" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BarOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BarPayment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "person" TEXT NOT NULL DEFAULT '',
    "reference" TEXT NOT NULL DEFAULT '',
    "requestId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BarPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "balance" DECIMAL(18,4) NOT NULL,
    "reason" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BarCategory_id_companyId_key" ON "BarCategory"("id", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "BarCategory_companyId_kind_name_key" ON "BarCategory"("companyId", "kind", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_id_companyId_key" ON "Supplier"("id", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_companyId_name_key" ON "Supplier"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "BarProduct_id_companyId_key" ON "BarProduct"("id", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipePart_parentId_ingredientId_key" ON "RecipePart"("parentId", "ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "DiningTable_id_companyId_key" ON "DiningTable"("id", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "DiningTable_companyId_name_key" ON "DiningTable"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessDay_id_companyId_key" ON "BusinessDay"("id", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessDay_companyId_date_key" ON "BusinessDay"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "BarOrder_invoiceId_key" ON "BarOrder"("invoiceId");

-- CreateIndex
CREATE INDEX "BarOrder_companyId_businessDayId_idx" ON "BarOrder"("companyId", "businessDayId");

-- CreateIndex
CREATE UNIQUE INDEX "BarOrder_id_companyId_key" ON "BarOrder"("id", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "BarOrder_invoiceId_companyId_key" ON "BarOrder"("invoiceId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "BarOrder_companyId_number_key" ON "BarOrder"("companyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "BarOrderItem_id_companyId_key" ON "BarOrderItem"("id", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "BarPayment_paymentId_key" ON "BarPayment"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "BarPayment_companyId_requestId_key" ON "BarPayment"("companyId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "BarPayment_paymentId_companyId_key" ON "BarPayment"("paymentId", "companyId");

-- CreateIndex
CREATE INDEX "InventoryMovement_companyId_createdAt_idx" ON "InventoryMovement"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "BarCategory" ADD CONSTRAINT "BarCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarProduct" ADD CONSTRAINT "BarProduct_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarProduct" ADD CONSTRAINT "BarProduct_id_companyId_fkey" FOREIGN KEY ("id", "companyId") REFERENCES "Product"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarProduct" ADD CONSTRAINT "BarProduct_categoryId_companyId_fkey" FOREIGN KEY ("categoryId", "companyId") REFERENCES "BarCategory"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarProduct" ADD CONSTRAINT "BarProduct_supplierId_companyId_fkey" FOREIGN KEY ("supplierId", "companyId") REFERENCES "Supplier"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipePart" ADD CONSTRAINT "RecipePart_parentId_companyId_fkey" FOREIGN KEY ("parentId", "companyId") REFERENCES "BarProduct"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipePart" ADD CONSTRAINT "RecipePart_ingredientId_companyId_fkey" FOREIGN KEY ("ingredientId", "companyId") REFERENCES "BarProduct"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiningTable" ADD CONSTRAINT "DiningTable_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessDay" ADD CONSTRAINT "BusinessDay_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarOrder" ADD CONSTRAINT "BarOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarOrder" ADD CONSTRAINT "BarOrder_businessDayId_companyId_fkey" FOREIGN KEY ("businessDayId", "companyId") REFERENCES "BusinessDay"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarOrder" ADD CONSTRAINT "BarOrder_tableId_companyId_fkey" FOREIGN KEY ("tableId", "companyId") REFERENCES "DiningTable"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarOrder" ADD CONSTRAINT "BarOrder_invoiceId_companyId_fkey" FOREIGN KEY ("invoiceId", "companyId") REFERENCES "Invoice"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarOrderItem" ADD CONSTRAINT "BarOrderItem_orderId_companyId_fkey" FOREIGN KEY ("orderId", "companyId") REFERENCES "BarOrder"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarOrderItem" ADD CONSTRAINT "BarOrderItem_productId_companyId_fkey" FOREIGN KEY ("productId", "companyId") REFERENCES "BarProduct"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarPayment" ADD CONSTRAINT "BarPayment_orderId_companyId_fkey" FOREIGN KEY ("orderId", "companyId") REFERENCES "BarOrder"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarPayment" ADD CONSTRAINT "BarPayment_paymentId_companyId_fkey" FOREIGN KEY ("paymentId", "companyId") REFERENCES "Payment"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_companyId_fkey" FOREIGN KEY ("productId", "companyId") REFERENCES "BarProduct"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cross-request integrity, beyond application serialization.
CREATE UNIQUE INDEX "BusinessDay_one_open_per_company" ON "BusinessDay"("companyId") WHERE "status"='OPEN';
CREATE UNIQUE INDEX "BarOrder_one_active_per_table" ON "BarOrder"("companyId","tableId") WHERE "tableId" IS NOT NULL AND "status" NOT IN ('PAID','CANCELLED');
ALTER TABLE "BusinessDay" ADD CONSTRAINT "BusinessDay_amount_status" CHECK ("opening">=0 AND "status" IN ('OPEN','CLOSED'));
ALTER TABLE "BarProduct" ADD CONSTRAINT "BarProduct_nonnegative" CHECK ("stock">=0 AND "minimum">=0 AND "cost">=0);
ALTER TABLE "RecipePart" ADD CONSTRAINT "RecipePart_positive" CHECK ("quantity">0 AND "parentId"<>"ingredientId");
ALTER TABLE "BarOrderItem" ADD CONSTRAINT "BarOrderItem_amounts" CHECK ("quantity">0 AND "unitPrice">=0 AND "taxRate">=0 AND "taxRate"<=100);
ALTER TABLE "BarPayment" ADD CONSTRAINT "BarPayment_positive" CHECK ("amount">0);
ALTER TABLE "BarOrder" ADD CONSTRAINT "BarOrder_amounts" CHECK ("total">=0 AND "tip">=0 AND "discountRate">=0 AND "discountRate"<=100);
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_balance" CHECK ("balance">=0 AND "quantity"<>0);
