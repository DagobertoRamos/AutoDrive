-- Fornecedores unificados: lojas parceiras viram fornecedores do tipo VEICULOS
-- (mesmo id), com dados de qualificação para contratos (PF/PJ, endereço, representante).
ALTER TABLE "suppliers" ALTER COLUMN "kind" SET DEFAULT 'OUTRO';
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "legalName" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "personType" TEXT NOT NULL DEFAULT 'PJ';
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "rg" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "stateRegistration" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "repName" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "repCpf" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "cep" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "street" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "number" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "complement" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "district" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "state" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "commission" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "sourceRef" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_tenantId_sourceRef_key" ON "suppliers"("tenantId", "sourceRef");
CREATE INDEX IF NOT EXISTS "suppliers_tenantId_kind_idx" ON "suppliers"("tenantId", "kind");

-- PF/PJ dos já cadastrados, pelo documento.
UPDATE "suppliers" SET "personType" = 'PF' WHERE length(regexp_replace(coalesce("document", ''), '\D', '', 'g')) = 11;

-- Lojas parceiras → fornecedores VEICULOS (mesmo id: carros continuam ligados).
INSERT INTO "suppliers" ("id", "tenantId", "name", "legalName", "kind", "personType", "document", "repName", "whatsapp", "email",
                         "city", "state", "address", "commission", "notes", "sourceRef", "active", "createdAt", "updatedAt")
SELECT p."id", p."tenantId", p."name", p."legalName", 'VEICULOS',
       CASE WHEN length(regexp_replace(coalesce(p."cnpj", ''), '\D', '', 'g')) = 11 THEN 'PF' ELSE 'PJ' END,
       NULLIF(regexp_replace(coalesce(p."cnpj", ''), '\D', '', 'g'), ''), p."responsibleName", p."whatsapp", p."email",
       p."city", p."state", p."address", p."commission",
       NULLIF(concat_ws(E'\n', p."notes", CASE WHEN p."instagram" IS NOT NULL THEN 'Instagram: ' || p."instagram" END, CASE WHEN p."website" IS NOT NULL THEN 'Site: ' || p."website" END), ''),
       p."sourceRef", p."active", p."createdAt", p."updatedAt"
FROM "partner_stores" p
ON CONFLICT ("id") DO NOTHING;

-- Carro de fornecedor: a referência passa a apontar para suppliers.
ALTER TABLE "vehicles" DROP CONSTRAINT IF EXISTS "vehicles_partnerStoreId_fkey";
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_partnerStoreId_fkey" FOREIGN KEY ("partnerStoreId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
