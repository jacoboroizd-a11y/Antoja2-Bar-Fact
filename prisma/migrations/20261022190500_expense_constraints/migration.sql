
ALTER TABLE "BarExpense" ADD CONSTRAINT "BarExpense_positive_amount" CHECK (amount > 0);
ALTER TABLE "BarExpense" ADD CONSTRAINT "BarExpense_valid_kind" CHECK (kind IN ('EXPENSE','PURCHASE'));
ALTER TABLE "BarExpense" ADD CONSTRAINT "BarExpense_valid_method" CHECK (method IN ('CASH','CARD','BANK_TRANSFER'));
