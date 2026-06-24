ALTER TABLE "seller_queue_customer_arrivals" ADD COLUMN IF NOT EXISTS "customerEmail" TEXT;
ALTER TABLE "seller_queue_customer_arrivals" ADD COLUMN IF NOT EXISTS "customerIsWhatsapp" BOOLEAN NOT NULL DEFAULT false;
