-- CreateTable
CREATE TABLE "KitchenDispatch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "items" JSONB NOT NULL,

    CONSTRAINT "KitchenDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KitchenDispatch_companyId_orderId_idx" ON "KitchenDispatch"("companyId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenDispatch_companyId_requestId_key" ON "KitchenDispatch"("companyId", "requestId");

-- AddForeignKey
ALTER TABLE "KitchenDispatch" ADD CONSTRAINT "KitchenDispatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenDispatch" ADD CONSTRAINT "KitchenDispatch_orderId_companyId_fkey" FOREIGN KEY ("orderId", "companyId") REFERENCES "BarOrder"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
