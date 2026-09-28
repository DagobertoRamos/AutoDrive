-- Posts avulsos do Instagram/Facebook (fotos e vídeos da loja, fora do estoque).
-- Só ADICIONA uma tabela. Reverter: DROP TABLE IF EXISTS "social_posts";

-- CreateTable
CREATE TABLE "social_posts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT,
    "format" TEXT NOT NULL,
    "caption" TEXT,
    "media" JSONB NOT NULL,
    "connectionIds" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "scheduledAt" TIMESTAMP(3),
    "results" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "social_posts_tenantId_status_scheduledAt_idx" ON "social_posts"("tenantId", "status", "scheduledAt");
