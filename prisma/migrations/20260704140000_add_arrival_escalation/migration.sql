ALTER TABLE "seller_queue_customer_arrivals"
  ADD COLUMN IF NOT EXISTS "escalationLevel" INTEGER,
  ADD COLUMN IF NOT EXISTS "escalationAttempt" INTEGER;
