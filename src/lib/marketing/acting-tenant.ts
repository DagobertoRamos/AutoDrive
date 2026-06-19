// =============================================================================
// marketing/acting-tenant.ts — re-export do helper compartilhado (compat).
// A implementação vive em src/lib/acting-tenant.ts (cookie único `acting_tenant`),
// para o MASTER selecionar a loja UMA vez e operar Marketing, F&I config, etc.
// =============================================================================

export { resolveActingTenant, actingTenantError, ACTING_TENANT_COOKIE } from '@/lib/acting-tenant'
