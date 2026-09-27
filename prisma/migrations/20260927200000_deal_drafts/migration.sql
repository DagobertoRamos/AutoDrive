-- Rascunhos do assistente Nova Negociação (só ADICIONA uma tabela).
-- Reverter: DROP TABLE IF EXISTS "deal_drafts";

-- CreateTable
CREATE TABLE "deal_drafts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT NOT NULL,
    "userName" TEXT,
    "type" TEXT,
    "step" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deal_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deal_drafts_tenantId_userId_idx" ON "deal_drafts"("tenantId", "userId");
CREATE INDEX "deal_drafts_updatedAt_idx" ON "deal_drafts"("updatedAt");
