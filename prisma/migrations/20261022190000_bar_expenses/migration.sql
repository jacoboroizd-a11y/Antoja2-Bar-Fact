-- CreateTable
CREATE TABLE "BarExpense" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "businessDayId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT NOT NULL,
    "payee" TEXT NOT NULL DEFAULT '',
    "reference" TEXT NOT NULL DEFAULT '',
    "attachment" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BarExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BarExpense_companyId_businessDayId_idx" ON "BarExpense"("companyId", "businessDayId");

-- CreateIndex
CREATE UNIQUE INDEX "BarExpense_companyId_requestId_key" ON "BarExpense"("companyId", "requestId");

-- AddForeignKey
ALTER TABLE "BarExpense" ADD CONSTRAINT "BarExpense_businessDayId_companyId_fkey" FOREIGN KEY ("businessDayId", "companyId") REFERENCES "BusinessDay"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

