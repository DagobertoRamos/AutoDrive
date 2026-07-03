-- Quem paga a documentacao (loja=cortesia). Aditivo/nao-destrutivo.
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "documentationPaidBy" TEXT;
