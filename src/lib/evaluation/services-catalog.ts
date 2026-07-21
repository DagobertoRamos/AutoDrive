// =============================================================================
// Catálogo de serviços disponíveis na aba SERVIÇOS da avaliação.
//
// Armazenamento (sem migration — reusa SystemSetting):
//   • Key GLOBAL: `evaluation:services:catalog:global`   → fallback padrão
//   • Key TENANT: `evaluation:services:catalog:<tenantId>` → customização por loja
// Se a chave tenant existe, tem precedência. Se não, cai no global.
// Se nenhum dos dois existe, usa DEFAULT_SERVICES.
//
// Cada tenant/master pode:
//   - Reordenar
//   - Editar label / custo sugerido
//   - Desabilitar (active=false esconde na avaliação)
//   - Adicionar serviços custom (key gerada automaticamente)
// =============================================================================

import { prisma } from '@/lib/prisma'

export interface ServiceCatalogItem {
  key:            string   // chave canônica (`svc.troca_oleo`, `svc.custom.abc123`)
  label:          string   // exibido na avaliação e no painel MASTER
  hint?:          string   // dica opcional
  serviceType:    string   // enum EvaluationService.serviceType (TROCA_OLEO, HIGIENIZACAO, etc)
  suggestedCost?: number   // custo sugerido em reais (aparece pré-preenchido)
  askCost:        boolean  // se true, exibe campo de custo estimado no serviço
  active:         boolean  // false esconde da avaliação (mantém no MASTER)
  isBuiltIn:      boolean  // true = criado pelo sistema (não pode deletar, só desativar)
  order:          number   // ordem de exibição
}

/** Catálogo padrão de fábrica (os 9 serviços pedidos + comuns). */
export const DEFAULT_SERVICES: ServiceCatalogItem[] = [
  { key: 'svc.troca_oleo',           label: 'Troca de óleo e filtros',      serviceType: 'TROCA_OLEO',    suggestedCost: 250,  askCost: true,  active: true, isBuiltIn: true, order: 10 },
  { key: 'svc.revisao',              label: 'Revisão',                       serviceType: 'REVISAO',       suggestedCost: 800,  askCost: true,  active: true, isBuiltIn: true, order: 20 },
  { key: 'svc.avaliacao_mecanica',   label: 'Avaliação mecânica (média)',    serviceType: 'CAUTELAR',      suggestedCost: 0,    askCost: true,  active: true, isBuiltIn: true, order: 30, hint: 'Média de gastos previstos após avaliação mecânica' },
  { key: 'svc.pericia',              label: 'Perícia / vistoria',            serviceType: 'PERICIA',       suggestedCost: 300,  askCost: true,  active: true, isBuiltIn: true, order: 40 },
  { key: 'svc.lavar',                label: 'Lavagem completa',              serviceType: 'HIGIENIZACAO',  suggestedCost: 80,   askCost: true,  active: true, isBuiltIn: true, order: 50 },
  { key: 'svc.polir',                label: 'Polimento',                     serviceType: 'POLIMENTO',     suggestedCost: 350,  askCost: true,  active: true, isBuiltIn: true, order: 60 },
  { key: 'svc.higienizar',           label: 'Higienização interna',          serviceType: 'HIGIENIZACAO',  suggestedCost: 200,  askCost: true,  active: true, isBuiltIn: true, order: 70 },
  { key: 'svc.retirar_pelicula',     label: 'Retirar película',              serviceType: 'OUTRO',         suggestedCost: 150,  askCost: true,  active: true, isBuiltIn: true, order: 80 },
  { key: 'svc.chave_reserva',        label: 'Chave reserva (fabricar/programar)', serviceType: 'OUTRO',   suggestedCost: 500,  askCost: true,  active: true, isBuiltIn: true, order: 90 },
]

const KEY_GLOBAL = 'evaluation:services:catalog:global'
const keyForTenant = (tenantId: string) => `evaluation:services:catalog:${tenantId}`

/** Lê o catálogo válido para o tenant (fallback: global → DEFAULT_SERVICES). */
export async function loadServiceCatalog(tenantId: string | null | undefined): Promise<ServiceCatalogItem[]> {
  try {
    if (tenantId) {
      const row = await prisma.systemSetting.findFirst({ where: { key: keyForTenant(tenantId), tenantId } })
      if (row?.value) {
        const parsed = parseCatalog(row.value)
        if (parsed) return parsed
      }
    }
    const globalRow = await prisma.systemSetting.findFirst({ where: { key: KEY_GLOBAL, tenantId: null } })
    if (globalRow?.value) {
      const parsed = parseCatalog(globalRow.value)
      if (parsed) return parsed
    }
  } catch { /* silent */ }
  return DEFAULT_SERVICES
}

/** Salva o catálogo do tenant (upsert por key+tenantId). MASTER pode salvar o global. */
export async function saveServiceCatalog(tenantId: string | null | undefined, items: ServiceCatalogItem[], updatedByUserId: string | null): Promise<void> {
  const key = tenantId ? keyForTenant(tenantId) : KEY_GLOBAL
  const value = JSON.stringify(items)
  // Como schema exige @unique(key), fazemos upsert manual: find + update ou create.
  const existing = await prisma.systemSetting.findFirst({ where: { key, tenantId: tenantId ?? null } })
  if (existing) {
    await prisma.systemSetting.update({
      where: { id: existing.id },
      data:  { value, updatedByUserId: updatedByUserId ?? null, group: 'evaluation' },
    })
  } else {
    await prisma.systemSetting.create({
      data: { key, value, tenantId: tenantId ?? null, updatedByUserId: updatedByUserId ?? null, group: 'evaluation', description: 'Catálogo de serviços da avaliação' },
    })
  }
}

function parseCatalog(raw: string): ServiceCatalogItem[] | null {
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return null
    return arr
      .filter((x) => x && typeof x.key === 'string' && typeof x.label === 'string')
      .map((x) => ({
        key:           String(x.key),
        label:         String(x.label),
        hint:          x.hint ? String(x.hint) : undefined,
        serviceType:   String(x.serviceType ?? 'OUTRO'),
        suggestedCost: typeof x.suggestedCost === 'number' ? x.suggestedCost : undefined,
        askCost:       x.askCost !== false,
        active:        x.active !== false,
        isBuiltIn:     Boolean(x.isBuiltIn),
        order:         typeof x.order === 'number' ? x.order : 999,
      }))
      .sort((a, b) => a.order - b.order)
  } catch { return null }
}
