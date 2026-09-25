# Reverter a Central de Publicações

1. Código: reverter o commit da branch `feat/central-publicacoes` (ou não mesclar).
   Os ganchos em negociações, estoque e estúdio são tolerantes a falha; sem o código,
   nada mais os chama.
2. Crons: remover de `vercel.json` as duas entradas `/api/internal/publications/run`.
3. Banco (só depois do código revertido — apaga os dados da Central):

```sql
BEGIN;
DROP TABLE IF EXISTS "publication_jobs";
DROP TABLE IF EXISTS "publications";
DROP TABLE IF EXISTS "publication_connections";
DROP TABLE IF EXISTS "publication_events";
DROP TABLE IF EXISTS "publication_revisions";
DROP TABLE IF EXISTS "publication_drafts";
DROP TABLE IF EXISTS "publication_mappings";
DROP TABLE IF EXISTS "publication_webhook_events";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20260925150000_publication_center';
DELETE FROM "system_settings" WHERE key LIKE 't:%:publications:v1' OR key LIKE 't:%:site:metafeed:lastgood';
COMMIT;
```

A migração não altera tabelas existentes; `site_listings.hidden` pode ter sido usado
para pausar anúncios do site — conferir em Site › Anúncios após reverter.
