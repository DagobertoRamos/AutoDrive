-- Site da loja: anúncio por veículo. Aditiva — não altera "vehicles".
CREATE TABLE IF NOT EXISTS "site_listings" (
    "id"             TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    "vehicleId"      TEXT NOT NULL,
    "photosStatus"   TEXT NOT NULL DEFAULT 'ORIGEM',
    "photosLocked"   BOOLEAN NOT NULL DEFAULT false,
    "photosLockedAt" TIMESTAMP(3),
    "originalPhotos" JSONB,
    "featured"       BOOLEAN NOT NULL DEFAULT false,
    "hidden"         BOOLEAN NOT NULL DEFAULT false,
    "title"          TEXT,
    "description"    TEXT,
    "options"        JSONB,
    "videoUrl"       TEXT,
    "seoTitle"       TEXT,
    "seoDescription" TEXT,
    "publishedAt"    TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "site_listings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "site_listings_vehicleId_key" ON "site_listings"("vehicleId");
CREATE INDEX IF NOT EXISTS "site_listings_tenantId_photosStatus_idx" ON "site_listings"("tenantId", "photosStatus");
DO $$ BEGIN
  ALTER TABLE "site_listings" ADD CONSTRAINT "site_listings_vehicleId_fkey"
    FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
