-- Contador de visitas do site da loja (eventos anônimos). Aditivo.
CREATE TABLE IF NOT EXISTS "site_events" (
    "id" BIGSERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "isNewVisitor" BOOLEAN NOT NULL DEFAULT false,
    "path" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "vehicleId" TEXT,
    "searchQuery" TEXT,
    "referrerHost" TEXT,
    "source" TEXT NOT NULL,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "city" TEXT,
    "region" TEXT,
    "device" TEXT NOT NULL,

    CONSTRAINT "site_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "site_events_tenantId_createdAt_idx" ON "site_events"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "site_events_tenantId_vehicleId_createdAt_idx" ON "site_events"("tenantId", "vehicleId", "createdAt");
