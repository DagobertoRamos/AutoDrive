-- Modelo de som do alerta da fila (config por unidade).
ALTER TABLE "seller_queue_unit_configs"
  ADD COLUMN IF NOT EXISTS "alertSoundType" TEXT NOT NULL DEFAULT 'siren';
