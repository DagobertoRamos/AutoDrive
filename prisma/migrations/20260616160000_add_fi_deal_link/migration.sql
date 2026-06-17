-- AutoDrive — F&I Fase 8 (aditivo). Liga FinanceProposal à negociação (Deal).
-- Só adiciona coluna + índice + FK; não altera dados existentes.

-- AlterTable
ALTER TABLE "finance_proposals" ADD COLUMN "dealId" TEXT;

-- CreateIndex
CREATE INDEX "finance_proposals_dealId_idx" ON "finance_proposals"("dealId");

-- AddForeignKey
ALTER TABLE "finance_proposals" ADD CONSTRAINT "finance_proposals_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
