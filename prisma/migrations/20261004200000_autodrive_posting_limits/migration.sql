-- Central de Publicações — loja AutoDrive Veículos: limites por dia em cada
-- rede conectada (posts no feed 4, Reels 3, Stories 8). Só dados (sem coluna
-- nova); idempotente. Depois a própria loja ajusta em Canais conectados.
INSERT INTO "system_settings" ("id", "key", "tenantId", "value", "group", "description", "updatedAt")
SELECT 'pubcfg_' || t."id", 't:' || t."id" || ':publications:v1', t."id", '{}', 'publications', 'Central de Publicações', NOW()
FROM "tenants" t
WHERE t."name" ILIKE 'AutoDrive Ve_culos'
ON CONFLICT ("key") DO NOTHING;

UPDATE "system_settings" s
SET "value" = (
      s."value"::jsonb
      || jsonb_build_object('posting', COALESCE(s."value"::jsonb -> 'posting', '{}'::jsonb) || '{"perDay":{"FEED":4,"REELS":3,"STORY":8}}'::jsonb)
    )::text,
    "updatedAt" = NOW()
FROM "tenants" t
WHERE t."name" ILIKE 'AutoDrive Ve_culos'
  AND s."key" = 't:' || t."id" || ':publications:v1';
