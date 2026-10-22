-- AlterTable
ALTER TABLE "BarProduct" ADD COLUMN     "packSize" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "warehouseStock" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN     "location" TEXT NOT NULL DEFAULT 'SALE';

