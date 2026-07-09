import { canAccessModule, type UserRole } from '@/lib/permissions'
import type { DashboardProfile, DashboardRoleKind, DashboardScopeKind } from '@/lib/dashboard/types'

export interface DashboardProfileInput {
  role: UserRole
  positionName?: string | null
  positionSlug?: string | null
  sellerCargo?: string | null
  managerAccessProfile?: string | null
  unitName?: string | null
  isSdrMember?: boolean
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function textMatches(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term))
}

function inferOperationalRole(input: DashboardProfileInput): DashboardRoleKind | null {
  const text = normalizeText([
    input.positionName,
    input.positionSlug,
    input.sellerCargo,
    input.managerAccessProfile,
  ].filter(Boolean).join(' '))

  if (input.isSdrMember || textMatches(text, ['sdr', 'pre venda', 'pre-venda', 'pre vendas', 'prevendas'])) {
    return 'SDR'
  }

  if (textMatches(text, ['marketing', 'trafego', 'campanha', 'midia', 'leads'])) {
    return 'MARKETING'
  }

  if (textMatches(text, ['f&i', 'f i', 'financiamento', 'ficha', 'banco'])) {
    return 'FI'
  }

  if (textMatches(text, ['financeiro', 'contas a pagar', 'contas a receber', 'caixa'])) {
    return 'FINANCEIRO'
  }

  if (textMatches(text, ['compras', 'compra', 'avaliacao', 'avaliador', 'estoque'])) {
    return 'COMPRAS'
  }

  if (textMatches(text, ['documentacao', 'documento', 'auxiliar', 'administrativo', 'backoffice', 'operacional'])) {
    return 'AUXILIAR'
  }

  return null
}

function defaultRoleKind(role: UserRole): DashboardRoleKind {
  if (role === 'MASTER') return 'MASTER'
  if (role === 'ADM' || role === 'GERENTE_ADMINISTRATIVO') return 'ADMIN'
  if (role === 'GERENTE_GERAL') return 'GERENTE_GERAL'
  if (role === 'GERENTE') return 'GERENTE'
  if (role === 'VENDEDOR' || role === 'VENDEDOR_LIDER') return 'VENDEDOR'
  if (role === 'FINANCEIRO') return 'FINANCEIRO'
  if (role === 'USUARIO' || role === 'USUARIO_LIDER') return 'AUXILIAR'
  return 'DEFAULT'
}

function scopeFor(kind: DashboardRoleKind, role: UserRole): DashboardScopeKind {
  if (role === 'MASTER') return 'GLOBAL'
  if (role === 'ADM' || role === 'GERENTE_GERAL' || role === 'GERENTE_ADMINISTRATIVO' || role === 'FINANCEIRO') {
    return 'TENANT'
  }
  if (kind === 'VENDEDOR') return 'SELF'
  if (kind === 'GERENTE') return 'UNIT'
  if (kind === 'MARKETING' || kind === 'SDR' || kind === 'COMPRAS' || kind === 'AUXILIAR') return 'UNIT'
  if (kind === 'FI') return 'TENANT'
  return 'UNIT'
}

const ROLE_LABEL: Record<DashboardRoleKind, { label: string; description: string }> = {
  MASTER: {
    label: 'Painel Master',
    description: 'Administração global do SaaS AutoDrive, saúde do sistema, tenants e infraestrutura.',
  },
  VENDEDOR: {
    label: 'Dashboard do Vendedor',
    description: 'Metas próprias, ranking, propostas, leads e pendências do dia.',
  },
  GERENTE: {
    label: 'Dashboard do Gerente',
    description: 'Acompanhamento da unidade, equipe, negociações e pendências críticas.',
  },
  GERENTE_GERAL: {
    label: 'Dashboard do Gerente Geral',
    description: 'Visão consolidada do tenant, unidades, ranking e gargalos operacionais.',
  },
  ADMIN: {
    label: 'Dashboard Administrativo',
    description: 'Operação consolidada, financeiro permitido, unidades, alertas e sistema.',
  },
  FINANCEIRO: {
    label: 'Dashboard Financeiro',
    description: 'Pagamentos, recebimentos, comissões, divergências e etapa financeira.',
  },
  MARKETING: {
    label: 'Dashboard de Marketing',
    description: 'Leads, origens, campanhas, conversão e impacto comercial.',
  },
  FI: {
    label: 'Dashboard F&I',
    description: 'Fichas, bancos, aprovações, documentos e produtos financeiros.',
  },
  SDR: {
    label: 'Dashboard SDR',
    description: 'Atendimento de leads, velocidade de resposta, agendamentos e conversão.',
  },
  COMPRAS: {
    label: 'Dashboard de Compras',
    description: 'Avaliações, compras, trocas, vistorias e estoque previsto.',
  },
  AUXILIAR: {
    label: 'Dashboard Operacional',
    description: 'Tarefas, documentação, pendências atribuídas e andamento do dia.',
  },
  DEFAULT: {
    label: 'Dashboard',
    description: 'Resumo operacional conforme as permissões do usuário.',
  },
}

export function resolveDashboardProfile(input: DashboardProfileInput): DashboardProfile {
  const roleKind = inferOperationalRole(input) ?? defaultRoleKind(input.role)
  const scope = scopeFor(roleKind, input.role)
  const copy = ROLE_LABEL[roleKind]
  const scopeLabel =
    scope === 'GLOBAL'
      ? 'Plataforma'
      : scope === 'TENANT'
        ? 'Tenant'
        : scope === 'UNIT'
          ? input.unitName ? `Unidade: ${input.unitName}` : 'Unidade'
          : 'Meus dados'

  return {
    kind: roleKind,
    label: copy.label,
    description: copy.description,
    role: input.role,
    scope,
    scopeLabel,
    positionName: input.positionName ?? null,
    unitName: input.unitName ?? null,
    canSeeFinancial: canAccessModule(input.role, 'finance'),
    canSeeRanking: canAccessModule(input.role, 'ranking'),
  }
}
