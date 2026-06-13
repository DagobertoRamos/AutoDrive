-- =============================================================================
-- 20260530000000_drift_baseline_user_payment_evaluation
--
-- Baseline que reflete ALTERs aplicados manualmente no Neon durante
-- desenvolvimento (sem migrate dev). Tudo idempotente com IF NOT EXISTS.
--
-- Cobre:
--   • UserStatus.SUSPENSO (novo valor de enum)
--   • deal_payments — 9 colunas novas (status, pixKey, agency, account,
--     installmentValue, installmentIntervalDays, returnPct, vehiclePlate, paidAt)
--   • vehicle_evaluations — 6 colunas novas (customerDecision, customerDecisionAt,
--     customerDecisionById, customerDecisionNote, availableFor, proposalValidUntil)
--
-- Após aplicar (ou marcar como aplicado em ambientes que já têm as colunas):
--   npx prisma migrate resolve --applied 20260530000000_drift_baseline_user_payment_evaluation
-- =============================================================================

-- ─── UserStatus.SUSPENSO ────────────────────────────────────────────────────
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'SUSPENSO';

-- ─── deal_payments — novas colunas ──────────────────────────────────────────
ALTER TABLE "deal_payments"
  ADD COLUMN IF NOT EXISTS "status"                     VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "pixKey"                     VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "agency"                     VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "account"                    VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "installmentValue"           NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS "installmentIntervalDays"    INTEGER,
  ADD COLUMN IF NOT EXISTS "returnPct"                  NUMERIC(4, 2),
  ADD COLUMN IF NOT EXISTS "vehiclePlate"               VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "paidAt"                     TIMESTAMP;

-- ─── vehicle_evaluations — decisão do cliente + availableFor ────────────────
ALTER TABLE "vehicle_evaluations"
  ADD COLUMN IF NOT EXISTS "customerDecision"           VARCHAR(20) DEFAULT 'PENDENTE',
  ADD COLUMN IF NOT EXISTS "customerDecisionAt"         TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "customerDecisionById"       VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "customerDecisionNote"       TEXT,
  ADD COLUMN IF NOT EXISTS "availableFor"               VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "proposalValidUntil"         TIMESTAMP;
