-- Pagamento da negociacao: forma do sinal/entrada e autorizacao do cartao (colunas opcionais).
ALTER TABLE "deal_payments" ADD COLUMN IF NOT EXISTS "method" TEXT;
ALTER TABLE "deal_payments" ADD COLUMN IF NOT EXISTS "authorizationCode" TEXT;
