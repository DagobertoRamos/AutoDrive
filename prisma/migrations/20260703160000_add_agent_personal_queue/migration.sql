-- Fila INDIVIDUAL do vendedor/gerente (fila dentro da fila). Aditivo/não-destrutivo.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PersonalQueueItemType') THEN
    CREATE TYPE "PersonalQueueItemType" AS ENUM ('AGENDAMENTO', 'RETORNO', 'POS_VENDA', 'OUTRO');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PersonalQueueItemStatus') THEN
    CREATE TYPE "PersonalQueueItemStatus" AS ENUM ('AGUARDANDO', 'CHAMADO', 'EM_ATENDIMENTO', 'TRANSFERIDO', 'CONCLUIDO', 'CANCELADO');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "agent_personal_queue_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "agentUserId" TEXT NOT NULL,
    "customerId" TEXT,
    "dealId" TEXT,
    "leadId" TEXT,
    "arrivalId" TEXT,
    "attendanceId" TEXT,
    "itemType" "PersonalQueueItemType" NOT NULL,
    "status" "PersonalQueueItemStatus" NOT NULL DEFAULT 'AGUARDANDO',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "notes" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "transferredToUserId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agent_personal_queue_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "agent_personal_queue_items_tenantId_unitId_agentUserId_status_idx" ON "agent_personal_queue_items"("tenantId", "unitId", "agentUserId", "status");
CREATE INDEX IF NOT EXISTS "agent_personal_queue_items_tenantId_unitId_status_idx" ON "agent_personal_queue_items"("tenantId", "unitId", "status");
CREATE INDEX IF NOT EXISTS "agent_personal_queue_items_agentUserId_status_idx" ON "agent_personal_queue_items"("agentUserId", "status");
