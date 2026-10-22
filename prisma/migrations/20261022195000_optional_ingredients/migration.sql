-- AlterTable
ALTER TABLE "CompanySettings" ADD COLUMN     "fullInventory" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "BarProduct" ADD COLUMN     "ingredientOnly" BOOLEAN NOT NULL DEFAULT false;

