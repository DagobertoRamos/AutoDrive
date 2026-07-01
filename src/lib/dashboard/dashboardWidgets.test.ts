import { describe, expect, it } from 'vitest'
import {
  filterDashboardMetrics,
  filterDashboardSection,
  resolveDashboardDataLoadPlan,
} from '@/lib/dashboard/dashboardWidgets'
import type { DashboardMetric, DashboardSection } from '@/lib/dashboard/types'
import { createTenantServiceFlags } from '@/lib/tenant-services/types'

describe('dashboard widget service gates', () => {
  it('filters metrics whose inferred service is not active', () => {
    const services = createTenantServiceFlags(false)
    services.metas = true
    services.negociacoes = true

    const metrics: DashboardMetric[] = [
      { id: 'posicao-ranking', label: 'Minha posicao', value: '1', icon: 'ranking' },
      { id: 'minhas-metas', label: 'Minhas metas', value: 2, icon: 'target' },
      { id: 'minhas-vendas', label: 'Minhas vendas', value: 3, icon: 'sales' },
    ]

    expect(filterDashboardMetrics(metrics, services).map((metric) => metric.id)).toEqual([
      'minhas-metas',
      'minhas-vendas',
    ])
  })

  it('drops a whole section when its service is disabled', () => {
    const services = createTenantServiceFlags(false)
    const section: DashboardSection = {
      id: 'ranking',
      title: 'Ranking',
      icon: 'ranking',
      items: [{ id: 'ranking-resumo', label: 'Ranking resumido', value: '-' }],
    }

    expect(filterDashboardSection(section, services)).toBeNull()
  })

  it('builds the query load plan from active services', () => {
    const services = createTenantServiceFlags(false)
    services.financeiro = true
    services.marketing = true

    const plan = resolveDashboardDataLoadPlan(services)

    expect(plan.finance).toBe(true)
    expect(plan.leads).toBe(true)
    expect(plan.ranking).toBe(false)
    expect(plan.goals).toBe(false)
  })
})
