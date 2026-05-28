-- AlterTable: VehicleEvaluation — cancelamento e submissão para aprovação
ALTER TABLE "vehicle_evaluations"
  ADD COLUMN IF NOT EXISTS "approvalRequestedAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvalRequestedById" TEXT,
  ADD COLUMN IF NOT EXISTS "cancelledAt"           TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelledById"         TEXT,
  ADD COLUMN IF NOT EXISTS "cancelReason"          TEXT;
