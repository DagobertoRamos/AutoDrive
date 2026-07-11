-- Fase 3: fotos de veículo na negociação (AutoConf V2 pipeline).
-- 100% aditivo: coluna nullable JSON; sem risco em rollback.
ALTER TABLE "deal_vehicles" ADD COLUMN "photos" JSONB;
