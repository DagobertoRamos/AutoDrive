-- Fase 2 — Férias/Ausências da fila (SellerVacation). Aditiva e segura.
-- CreateTable
CREATE TABLE IF NOT EXISTS "seller_vacations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'FERIAS',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROGRAMADO',
    "autoReturn" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "canceledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_vacations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "seller_vacations_tenantId_idx" ON "seller_vacations"("tenantId");
CREATE INDEX IF NOT EXISTS "seller_vacations_unitId_idx" ON "seller_vacations"("unitId");
CREATE INDEX IF NOT EXISTS "seller_vacations_sellerId_idx" ON "seller_vacations"("sellerId");
CREATE INDEX IF NOT EXISTS "seller_vacations_status_idx" ON "seller_vacations"("status");
