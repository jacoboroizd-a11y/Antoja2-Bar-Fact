ALTER TABLE "BarOrder" ADD COLUMN "deliverySource" TEXT NOT NULL DEFAULT '';
ALTER TABLE "BarOrder" ADD COLUMN "deliveryReference" TEXT NOT NULL DEFAULT '';
ALTER TABLE "BarOrder" ADD CONSTRAINT "BarOrder_delivery_source" CHECK ("channel"<>'DELIVERY' OR "deliverySource"<>'');
