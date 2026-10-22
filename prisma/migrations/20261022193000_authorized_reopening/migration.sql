DROP INDEX "BusinessDay_companyId_date_key";
CREATE INDEX "BusinessDay_companyId_date_idx" ON "BusinessDay"("companyId","date");
