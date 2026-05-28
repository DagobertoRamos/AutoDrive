-- CreateEnum
CREATE TYPE "DealAttachmentCategory" AS ENUM (
  'COMPROVANTE_PAGAMENTO',
  'COMPROVANTE_QUITACAO',
  'COMPROVANTE_DEBITO',
  'COMPROVANTE_TROCO',
  'CONTRATO_ASSINADO',
  'PROCURACAO_ASSINADA',
  'NFE',
  'RECIBO',
  'OUTRO'
);

-- CreateEnum
CREATE TYPE "DocumentTemplateType" AS ENUM (
  'CONTRATO_COMPRA',
  'CONTRATO_VENDA',
  'CONTRATO_TROCA',
  'CONTRATO_CONSIGNACAO',
  'PROCURACAO',
  'RECIBO',
  'TERMO_ENTREGA',
  'TERMO_RESPONSABILIDADE',
  'OUTRO'
);

-- CreateTable: deal_attachments
CREATE TABLE "deal_attachments" (
  "id"             TEXT NOT NULL,
  "dealId"         TEXT NOT NULL,
  "tenantId"       TEXT,
  "category"       "DealAttachmentCategory" NOT NULL,
  "fileName"       TEXT NOT NULL,
  "fileType"       TEXT NOT NULL,
  "mimeType"       TEXT NOT NULL,
  "fileSize"       INTEGER,
  "storageKey"     TEXT NOT NULL,
  "publicUrl"      TEXT,
  "notes"          TEXT,
  "paymentId"      TEXT,
  "debtId"         TEXT,
  "vehicleId"      TEXT,
  "changeId"       TEXT,
  "uploadedById"   TEXT,
  "uploadedByName" TEXT,
  "uploadedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "deal_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deal_attachments_dealId_idx"    ON "deal_attachments"("dealId");
CREATE INDEX "deal_attachments_tenantId_idx"  ON "deal_attachments"("tenantId");
CREATE INDEX "deal_attachments_category_idx"  ON "deal_attachments"("category");
CREATE INDEX "deal_attachments_paymentId_idx" ON "deal_attachments"("paymentId");
CREATE INDEX "deal_attachments_debtId_idx"    ON "deal_attachments"("debtId");

-- AddForeignKey
ALTER TABLE "deal_attachments"
  ADD CONSTRAINT "deal_attachments_dealId_fkey"
  FOREIGN KEY ("dealId") REFERENCES "deals"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: document_templates
CREATE TABLE "document_templates" (
  "id"          TEXT NOT NULL,
  "tenantId"    TEXT,
  "type"        "DocumentTemplateType" NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "bodyHtml"    TEXT NOT NULL,
  "variables"   JSONB,
  "active"      BOOLEAN NOT NULL DEFAULT true,
  "isDefault"   BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_templates_tenantId_idx" ON "document_templates"("tenantId");
CREATE INDEX "document_templates_type_idx"     ON "document_templates"("type");
CREATE INDEX "document_templates_active_idx"   ON "document_templates"("active");

-- CreateTable: deal_documents
CREATE TABLE "deal_documents" (
  "id"            TEXT NOT NULL,
  "dealId"        TEXT NOT NULL,
  "tenantId"      TEXT,
  "templateId"    TEXT,
  "type"          "DocumentTemplateType" NOT NULL,
  "name"          TEXT NOT NULL,
  "bodyHtml"      TEXT,
  "pdfUrl"        TEXT,
  "storageKey"    TEXT,
  "signedFileUrl" TEXT,
  "signedAt"      TIMESTAMP(3),
  "signedBy"      TEXT,
  "status"        TEXT NOT NULL DEFAULT 'RASCUNHO',
  "createdById"   TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "deal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deal_documents_dealId_idx"   ON "deal_documents"("dealId");
CREATE INDEX "deal_documents_tenantId_idx" ON "deal_documents"("tenantId");
CREATE INDEX "deal_documents_type_idx"     ON "deal_documents"("type");
CREATE INDEX "deal_documents_status_idx"   ON "deal_documents"("status");

-- AddForeignKey
ALTER TABLE "deal_documents"
  ADD CONSTRAINT "deal_documents_dealId_fkey"
  FOREIGN KEY ("dealId") REFERENCES "deals"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "deal_documents"
  ADD CONSTRAINT "deal_documents_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "document_templates"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
