export type DashboardRoleKind =
  | 'VENDEDOR'
  | 'GERENTE'
  | 'GERENTE_GERAL'
  | 'ADMIN'
  | 'FINANCEIRO'
  | 'MARKETING'
  | 'FI'
  | 'SDR'
  | 'COMPRAS'
  | 'AUXILIAR'
  | 'DEFAULT'

export type DashboardScopeKind = 'SELF' | 'UNIT' | 'TENANT' | 'GLOBAL'

export type DashboardTone =
  | 'brand'
  | 'amber'
  | 'red'
  | 'blue'
  | 'green'
  | 'purple'
  | 'teal'
  | 'cyan'
  | 'slate'
  | 'gray'

export type DashboardIcon =
  | 'sales'
  | 'target'
  | 'ranking'
  | 'pendencies'
  | 'alert'
  | 'money'
  | 'leads'
  | 'finance'
  | 'documents'
  | 'stock'
  | 'users'
  | 'system'
  | 'clock'
  | 'check'
  | 'activity'

export interface DashboardProfile {
  kind: DashboardRoleKind
  label: string
  description: string
  role: string
  scope: DashboardScopeKind
  scopeLabel: string
  positionName: string | null
  unitName: string | null
  canSeeFinancial: boolean
  canSeeRanking: boolean
}

export interface DashboardMetric {
  id: string
  label: string
  value: string | number
  helper?: string
  tone?: DashboardTone
  icon?: DashboardIcon
  href?: string
}

export interface DashboardListItem {
  id: string
  label: string
  value: string | number
  helper?: string
  tone?: DashboardTone
  href?: string
}

export interface DashboardSection {
  id: string
  title: string
  description?: string
  icon?: DashboardIcon
  items: DashboardListItem[]
  emptyText?: string
}

export interface DashboardSummary {
  profile: DashboardProfile
  period: {
    label: string
    start: string
    end: string
  }
  highlights: DashboardMetric[]
  sections: DashboardSection[]
  commonSection: DashboardSection
  warnings: string[]
}
