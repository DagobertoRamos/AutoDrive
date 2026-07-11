-- Fase 5: histórico de movimentações importado do AutoConf.
-- 100% aditivo: nova tabela, sem alterar tabelas existentes.
CREATE TABLE "deal_history_entries" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "source" TEXT,
    "externalId" TEXT,
    "userName" TEXT,
    "dateLabel" TEXT,
    "summary" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "deal_history_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "deal_history_entries_dealId_idx" ON "deal_history_entries"("dealId");
CREATE INDEX "deal_history_entries_externalId_idx" ON "deal_history_entries"("externalId");

ALTER TABLE "deal_history_entries" ADD CONSTRAINT "deal_history_entries_dealId_fkey"
    FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
