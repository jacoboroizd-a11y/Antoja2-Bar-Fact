ALTER TABLE "BarProduct" ADD COLUMN "customizations" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "BarOrderItem" ADD COLUMN "customizations" JSONB NOT NULL DEFAULT '[]';
