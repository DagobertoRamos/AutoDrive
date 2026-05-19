-- =============================================================================
-- Motor de Negociações — Expansão completa do Deal
-- Adiciona novos status, campos financeiros, serviços e auditoria detalhada
-- =============================================================================

-- ── 1. Novos valores no enum DealStatus ──────────────────────────────────────
ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'EM_PREENCHIMENTO';
ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'AGUARDANDO_APROVACAO';
ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'APROVADA';
ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'DESAPROVADA';
ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'DEVOLVIDA_PARA_CORRECAO';
ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'AGUARDANDO_SINAL';
ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'SINAL_RECEBIDO';
ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'RESERVADA';
ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'AGUARDANDO_FINANCEIRO';
ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'FINANCEIRO_APROVADO';
ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'FINANCEIRO_REPROVADO';
ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'AGUARDANDO_DOCUMENTACAO';
ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'DOCUMENTACAO_CONCLUIDA';
ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'AGUARDANDO_CONTRATO';
ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'CONTRATO_GERADO';
ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'AGUARDANDO_ASSINATURA';
ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'ASSINADA';
ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'AGUARDANDO_ENTREGA';
ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'ENTREGUE';
ALTER TYPE "DealStatus" ADD VALUE IF NOT EXISTS 'BLOQUEADA';

-- ── 2. Novos campos na tabela deals ──────────────────────────────────────────
ALTER TABLE "deals"
  ADD COLUMN IF NOT EXISTS "dealNumber"      TEXT,
  ADD COLUMN IF NOT EXISTS "managerId"       TEXT,
  ADD COLUMN IF NOT EXISTS "source"          TEXT DEFAULT 'MANUAL',
  -- Valores financeiros expandidos
  ADD COLUMN IF NOT EXISTS "saleAmount"      DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "purchaseAmount"  DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "financedAmount"  DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "documentationFee" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "signalAmount"    DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "payoffAmount"    DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "discountAmount"  DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "servicesAmount"  DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "marginAmount"    DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "paymentBank"     TEXT,
  ADD COLUMN IF NOT EXISTS "paymentType"     TEXT,
  -- Aprovação
  ADD COLUMN IF NOT EXISTS "approvalNotes"   TEXT,
  ADD COLUMN IF NOT EXISTS "approvedById"    TEXT,
  ADD COLUMN IF NOT EXISTS "approvedAt"      TIMESTAMP(3),
  -- Datas operacionais
  ADD COLUMN IF NOT EXISTS "deliveryDate"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "finalizedAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelledAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelledById"   TEXT,
  ADD COLUMN IF NOT EXISTS "cancelledReason" TEXT,
  -- Consignação
  ADD COLUMN IF NOT EXISTS "consignMinValue" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "consignCommPct"  DECIMAL(6,4),
  ADD COLUMN IF NOT EXISTS "consignDeadline" TIMESTAMP(3);

-- Índices extras
CREATE INDEX IF NOT EXISTS "deals_managerId_idx"   ON "deals"("managerId");
CREATE INDEX IF NOT EXISTS "deals_dealNumber_idx"  ON "deals"("dealNumber");

-- FK para manager
ALTER TABLE "deals"
  ADD CONSTRAINT "deals_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 3. Novos campos na tabela deal_vehicles ───────────────────────────────────
ALTER TABLE "deal_vehicles"
  ADD COLUMN IF NOT EXISTS "km"             INTEGER,
  ADD COLUMN IF NOT EXISTS "condition"      TEXT,
  ADD COLUMN IF NOT EXISTS "evaluatedValue" DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "fipeValue"      DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "hasFinancing"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "payoffValue"    DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "payoffBank"     TEXT;

-- ── 4. Tabela deal_services ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "deal_services" (
  "id"         TEXT         NOT NULL,
  "dealId"     TEXT         NOT NULL,
  "name"       TEXT         NOT NULL,
  "value"      DECIMAL(12,2) NOT NULL,
  "cost"       DECIMAL(12,2),
  "supplier"   TEXT,
  "commission" DECIMAL(12,2),
  "notes"      TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "deal_services_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "deal_services_dealId_idx"     ON "deal_services"("dealId");
CREATE INDEX IF NOT EXISTS "deal_vehicles_dealId_role_idx" ON "deal_vehicles"("dealId", "role");

ALTER TABLE "deal_services"
  ADD CONSTRAINT "deal_services_dealId_fkey"
  FOREIGN KEY ("dealId") REFERENCES "deals"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 5. Tabela deal_audit_logs ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "deal_audit_logs" (
  "id"        TEXT         NOT NULL,
  "dealId"    TEXT         NOT NULL,
  "tenantId"  TEXT,
  "unitId"    TEXT,
  "userId"    TEXT,
  "userName"  TEXT,
  "userRole"  TEXT,
  "action"    TEXT         NOT NULL,
  "field"     TEXT,
  "oldValue"  TEXT,
  "newValue"  TEXT,
  "reason"    TEXT,
  "metadata"  JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "deal_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "deal_audit_logs_dealId_idx"   ON "deal_audit_logs"("dealId");
CREATE INDEX IF NOT EXISTS "deal_audit_logs_tenantId_idx" ON "deal_audit_logs"("tenantId");
CREATE INDEX IF NOT EXISTS "deal_audit_logs_action_idx"   ON "deal_audit_logs"("action");

ALTER TABLE "deal_audit_logs"
  ADD CONSTRAINT "deal_audit_logs_dealId_fkey"
  FOREIGN KEY ("dealId") REFERENCES "deals"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
