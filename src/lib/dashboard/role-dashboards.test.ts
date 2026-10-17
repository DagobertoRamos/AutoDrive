// Testes por PERFIL: o dashboard mostra só o que está liberado para o
// colaborador, e toda consulta fica presa ao tenant/escopo da sessão.
import { describe, expect, it } from 'vitest'
import type { UserRole } from '@/lib/permissions'
import { createDashboardAccess, type ModuleAccessInput } from '@/lib/dashboard/access'
import { attentionAreasFor } from '@/lib/dashboard/attention'
import {
  applyAccessToLoadPlan,
  filterDashboardMetrics,
  filterDashboardSections,
  resolveDashboardDataLoadPlan,
} from '@/lib/dashboard/dashboardWidgets'
import {
  NO_MATCH,
  scopedDealWhere,
  scopedFinanceProposalWhere,
  scopedLeadWhere,
  scopedPendencyWhere,
  type DashboardContext,
} from '@/lib/dashboard/context'
import { inStockVehicleWhere, openTransferWhere } from '@/lib/dashboard/sources'
import { resolveDashboardProfile } from '@/lib/dashboard/dashboardProfiles'
import { createTenantServiceFlags } from '@/lib/tenant-services/types'
import type { DashboardMetric, DashboardRoleKind, DashboardSection } from '@/lib/dashboard/types'

const allServices = () => createTenantServiceFlags(true)

function ctxFor(role: UserRole, opts: { positionName?: string; access?: Partial<ModuleAccessInput>; tenantId?: string; unitId?: string | null; sellerId?: string | null } = {}): DashboardContext {
  const profile = resolveDashboardProfile({ role, positionName: opts.positionName, unitName: 'Matriz' })
  return {
    user: { id: `user-${role}`, role, tenantId: opts.tenantId ?? 'tenant-A', unitId: opts.unitId ?? 'unit-1' } as DashboardContext['user'],
    profile,
    tenantId: opts.tenantId ?? 'tenant-A',
    unitId: opts.unitId === undefined ? 'unit-1' : opts.unitId,
    sellerId: opts.sellerId === undefined ? `seller-${role}` : opts.sellerId,
    managerId: null,
    access: createDashboardAccess({ role, ...opts.access }),
    services: allServices(),
  }
}

const json = (v: unknown) => JSON.stringify(v)

describe('isolamento multi-tenant e escopo', () => {
  const PROFILES: Array<[UserRole, string | undefined]> = [
    ['ADM', undefined], ['GERENTE_GERAL', undefined], ['GERENTE', undefined], ['VENDEDOR', undefined],
    ['VENDEDOR_LIDER', undefined], ['FINANCEIRO', undefined], ['USUARIO', 'SDR'], ['USUARIO', 'Documentação'],
    ['USUARIO', 'F&I'], ['USUARIO', 'Marketing'], ['USUARIO', 'Lavador'], ['USUARIO', 'Pós-venda'], ['USUARIO', 'Auxiliar'],
  ]

  it.each(PROFILES)('%s (%s): toda consulta leva o tenant da sessão', (role, positionName) => {
    const ctx = ctxFor(role, { positionName })
    for (const where of [
      scopedDealWhere(ctx), scopedPendencyWhere(ctx), scopedLeadWhere(ctx), scopedFinanceProposalWhere(ctx),
      inStockVehicleWhere(ctx), openTransferWhere(ctx),
    ]) {
      expect(json(where)).toContain('"tenantId":"tenant-A"')
      expect(json(where)).not.toContain('tenant-B')
    }
  })

  it('sem tenant (não-MASTER) nunca vira "sem filtro"', () => {
    const ctx = ctxFor('GERENTE', { tenantId: undefined })
    ctx.tenantId = null
    expect(json(scopedLeadWhere(ctx))).toContain(NO_MATCH)
    expect(json(inStockVehicleWhere(ctx))).toContain(NO_MATCH)
  })

  it('vendedor vê só o próprio (Seller.id) e, sem vínculo, nada', () => {
    const ctx = ctxFor('VENDEDOR')
    expect(scopedDealWhere(ctx).sellerId).toBe('seller-VENDEDOR')
    expect(scopedDealWhere(ctxFor('VENDEDOR', { sellerId: null })).sellerId).toBe(NO_MATCH)
    // F&I: mesma regra do módulo (criou OU é o vendedor) — antes comparava Seller.id com User.id.
    expect(json(scopedFinanceProposalWhere(ctx))).toContain('"sellerId":"seller-VENDEDOR"')
    expect(json(scopedFinanceProposalWhere(ctx))).toContain('"createdById":"user-VENDEDOR"')
  })

  it('gerente fica na unidade; sem unidade, nada', () => {
    expect(scopedDealWhere(ctxFor('GERENTE')).unitId).toBe('unit-1')
    expect(scopedDealWhere(ctxFor('GERENTE', { unitId: null })).unitId).toBe(NO_MATCH)
  })

  it('leads e pendências excluídos nunca entram nos números', () => {
    const ctx = ctxFor('GERENTE_GERAL')
    expect(scopedLeadWhere(ctx).deletedAt).toBeNull()
    expect(json(scopedPendencyWhere(ctx))).toContain('[EXCLUIDA]')
  })
})

describe('o que cada perfil vê na central de atenção', () => {
  const areas = (role: UserRole, positionName?: string, access?: Partial<ModuleAccessInput>) => {
    const ctx = ctxFor(role, { positionName, access })
    return [...attentionAreasFor(ctx.profile.kind as DashboardRoleKind, ctx.access.can)].sort()
  }

  it('vendedor: nada de financeiro, estoque parado ou documentação veicular', () => {
    const a = areas('VENDEDOR')
    expect(a).toContain('comercial')
    expect(a).toContain('crm')
    expect(a).not.toContain('financeiro')
    expect(a).not.toContain('documentacao')
    expect(a).not.toContain('preparacao')
  })

  it('administrador da loja: visão completa do que tem liberado', () => {
    const a = areas('ADM')
    for (const area of ['comercial', 'crm', 'pendencias', 'financeiro', 'estoque', 'preparacao']) expect(a).toContain(area)
  })

  it('bloqueio individual tira a área mesmo do administrador', () => {
    expect(areas('ADM', undefined, { userDenied: ['finance'] })).not.toContain('financeiro')
  })

  it('módulo desligado para a loja some para todos', () => {
    expect(areas('GERENTE_GERAL', undefined, { disabledModules: ['financing'] })).not.toContain('fi')
  })

  it('liberação individual NÃO dá área fora do trabalho do cargo', () => {
    // vendedor com finance liberado continua sem a área financeira na central
    expect(areas('VENDEDOR', undefined, { userAllowed: ['finance'] })).not.toContain('financeiro')
  })

  it('perfis operacionais recebem só o próprio setor', () => {
    expect(areas('USUARIO', 'Lavador')).not.toContain('comercial')
    expect(areas('USUARIO', 'SDR')).not.toContain('financeiro')
    expect(areas('MASTER')).toEqual([])
  })
})

describe('widgets respeitam o acesso do colaborador', () => {
  const metrics: DashboardMetric[] = [
    { id: 'a-receber', label: 'A receber', value: 1, href: '/financeiro/receber' },
    { id: 'vendas', label: 'Vendas', value: 2, href: '/negociacoes' },
  ]

  it('sem "finance", card financeiro some — mesmo com o serviço contratado', () => {
    const access = createDashboardAccess({ role: 'GERENTE' })
    expect(filterDashboardMetrics(metrics, allServices(), access).map((m) => m.id)).toEqual(['vendas'])
  })

  it('com liberação individual de "finance", aparece', () => {
    const access = createDashboardAccess({ role: 'GERENTE', userAllowed: ['finance'] })
    expect(filterDashboardMetrics(metrics, allServices(), access).map((m) => m.id)).toEqual(['a-receber', 'vendas'])
  })

  it('seção que ficou vazia por permissão desaparece', () => {
    const sections: DashboardSection[] = [{ id: 'financeiro', title: 'Financeiro', items: [{ id: 'receitas', label: 'x', value: 1 }] }]
    expect(filterDashboardSections(sections, allServices(), createDashboardAccess({ role: 'VENDEDOR' }))).toEqual([])
  })

  it('plano de carga não consulta o que o colaborador não pode ver', () => {
    const plan = applyAccessToLoadPlan(resolveDashboardDataLoadPlan(allServices()), createDashboardAccess({ role: 'VENDEDOR' }))
    expect(plan.finance).toBe(false)
    expect(plan.stock).toBe(true)
    const denied = applyAccessToLoadPlan(resolveDashboardDataLoadPlan(allServices()), createDashboardAccess({ role: 'VENDEDOR', userDenied: ['stock.view'] }))
    expect(denied.stock).toBe(false)
  })
})
