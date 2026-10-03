-- Baixa detalhada: valor cobrado original, fornecedor e itens de custo do lançamento.
ALTER TABLE "financial_entries" ADD COLUMN IF NOT EXISTS "chargedAmount" DECIMAL(14,2);
ALTER TABLE "financial_entries" ADD COLUMN IF NOT EXISTS "supplierId" TEXT;

CREATE TABLE IF NOT EXISTS "financial_entry_items" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "tenantId" TEXT,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "supplierId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "financial_entry_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "financial_entry_items_entryId_idx" ON "financial_entry_items"("entryId");
CREATE INDEX IF NOT EXISTS "financial_entry_items_tenantId_idx" ON "financial_entry_items"("tenantId");
DO $$ BEGIN
  ALTER TABLE "financial_entry_items" ADD CONSTRAINT "financial_entry_items_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "financial_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
