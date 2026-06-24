-- Sessão de pós-vendas (pausa + autorização de retorno).
CREATE TABLE IF NOT EXISTS "seller_queue_pos_vendas" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "queueId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "attendanceId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "returnRequestedAt" TIMESTAMP(3),
  "startedById" TEXT,
  "authorizedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "seller_queue_pos_vendas_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "seller_queue_pos_vendas_queueId_idx" ON "seller_queue_pos_vendas"("queueId");
CREATE INDEX IF NOT EXISTS "seller_queue_pos_vendas_sellerId_idx" ON "seller_queue_pos_vendas"("sellerId");
CREATE INDEX IF NOT EXISTS "seller_queue_pos_vendas_status_idx" ON "seller_queue_pos_vendas"("status");
