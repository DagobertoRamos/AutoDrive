-- Avisos/alertas da Fila de Atendimento (config por unidade).
-- Aditivo: colunas com DEFAULT, retrocompatível com unidades existentes.
ALTER TABLE "seller_queue_unit_configs"
  ADD COLUMN IF NOT EXISTS "alertSound"            BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "alertBrowserPush"      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "alertWhatsapp"         BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "alertWhatsappManagers" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "alertRepeatSeconds"    INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS "allowChooseSeller"     BOOLEAN NOT NULL DEFAULT true;
