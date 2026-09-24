-- Site da loja: arquivos (logo, favicon, imagens) guardados no banco. Aditiva.
CREATE TABLE IF NOT EXISTS "site_assets" (
    "id"        TEXT NOT NULL,
    "tenantId"  TEXT NOT NULL,
    "kind"      TEXT NOT NULL,
    "mimeType"  TEXT NOT NULL,
    "fileSize"  INTEGER NOT NULL,
    "width"     INTEGER,
    "height"    INTEGER,
    "sha256"    TEXT NOT NULL,
    "data"      BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "site_assets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "site_assets_tenantId_kind_idx" ON "site_assets"("tenantId", "kind");
