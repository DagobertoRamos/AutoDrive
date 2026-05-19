// =============================================================================
// GET /api/negotiations/[id]/timeline — Timeline completa da negociação
// =============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'

type TimelineEvent = {
  type: 'STATUS' | 'AUDIT' | 'SERVICE' | 'VEHICLE' | 'PENDENCY'
  icon: string
  title: string
  description?: string
  user?: string
  date: string
}

const STATUS_ICONS: Record<string, string> = {
  RASCUNHO:                  'FileText',
  EM_PREENCHIMENTO:          'Edit',
  AGUARDANDO_LIBERACAO:      'Clock',
  AGUARDANDO_APROVACAO:      'Clock',
  LIBERADA:                  'CheckCircle',
  APROVADA:                  'CheckCircle',
  RECUSADA:                  'XCircle',
  DESAPROVADA:               'XCircle',
  DEVOLVIDA_PARA_CORRECAO:   'RotateCcw',
  AGUARDANDO_SINAL:          'DollarSign',
  SINAL_RECEBIDO:            'DollarSign',
  RESERVADA:                 'Lock',
  AGUARDANDO_FINANCEIRO:     'Landmark',
  FINANCEIRO_APROVADO:       'Landmark',
  FINANCEIRO_REPROVADO:      'Landmark',
  AGUARDANDO_DOCUMENTACAO:   'FileCheck',
  DOCUMENTACAO_CONCLUIDA:    'FileCheck',
  AGUARDANDO_CONTRATO:       'FileSignature',
  CONTRATO_GERADO:           'FileSignature',
  AGUARDANDO_ASSINATURA:     'PenLine',
  ASSINADA:                  'PenLine',
  AGUARDANDO_ENTREGA:        'Truck',
  ENTREGUE:                  'Truck',
  EM_ANDAMENTO:              'Activity',
  FINALIZADA:                'Flag',
  CANCELADA:                 'Ban',
  REABERTA:                  'RefreshCw',
  BLOQUEADA:                 'Lock',
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try {
    requireModule(session.user.role, 'negotiations')
  } catch {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const deal = await prisma.deal.findUnique({
    where: { id: params.id },
    select: { id: true, tenantId: true },
  })
  if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })

  if (session.user.tenantId && deal.tenantId !== session.user.tenantId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const [statusHistory, auditLogs, services, vehicles, pendencies] = await Promise.all([
    prisma.dealStatusHistory.findMany({
      where: { dealId: params.id },
      orderBy: { createdAt: 'asc' },
    }),
    (prisma.dealAuditLog as any).findMany({
      where: { dealId: params.id },
      orderBy: { createdAt: 'asc' },
    }),
    (prisma.dealService as any).findMany({
      where: { dealId: params.id },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.dealVehicle.findMany({
      where: { dealId: params.id },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.pendency.findMany({
      where: { dealId: params.id } as any,
      orderBy: { createdAt: 'asc' },
    }),
  ])

  // Buscar nomes de usuários do histórico de status
  const userIds = statusHistory
    .map((h) => h.changedByUserId)
    .filter((id): id is string => !!id)
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : []
  const userMap = Object.fromEntries(users.map((u) => [u.id, u.name]))

  // Chaves de audit já presentes no histórico de status (evitar duplicatas)
  const statusKeys = new Set(
    statusHistory.map((h) => `${h.newStatus}:${new Date(h.createdAt).toISOString()}`)
  )

  const events: TimelineEvent[] = []

  // STATUS
  for (const h of statusHistory) {
    events.push({
      type:        'STATUS',
      icon:        STATUS_ICONS[h.newStatus] ?? 'Activity',
      title:       h.newStatus.replace(/_/g, ' '),
      description: h.reason ?? undefined,
      user:        h.changedByUserId ? (userMap[h.changedByUserId] ?? undefined) : undefined,
      date:        h.createdAt.toISOString(),
    })
  }

  // AUDIT — apenas eventos não duplicados com STATUS
  for (const a of auditLogs) {
    if (a.action === 'STATUS' || a.action === 'CRIAR') continue
    const key = `${a.newValue}:${new Date(a.createdAt).toISOString()}`
    if (statusKeys.has(key)) continue

    events.push({
      type:        'AUDIT',
      icon:        'Edit',
      title:       `${a.action}${a.field ? ` — ${a.field}` : ''}`,
      description: a.reason ?? (a.oldValue != null ? `${a.oldValue} → ${a.newValue}` : undefined),
      user:        a.userName ?? undefined,
      date:        new Date(a.createdAt).toISOString(),
    })
  }

  // SERVICE
  for (const s of services) {
    events.push({
      type:  'SERVICE',
      icon:  'Package',
      title: `Serviço adicionado: ${s.name}`,
      description: `Valor: R$ ${Number(s.value).toFixed(2)}`,
      date:  new Date(s.createdAt).toISOString(),
    })
  }

  // VEHICLE
  for (const v of vehicles) {
    const label = v.plate ?? v.model ?? 'Veículo'
    events.push({
      type:  'VEHICLE',
      icon:  'Car',
      title: `Veículo vinculado (${v.role}): ${label}`,
      date:  new Date(v.createdAt).toISOString(),
    })
  }

  // PENDENCY
  for (const p of pendencies) {
    events.push({
      type:        'PENDENCY',
      icon:        'AlertCircle',
      title:       `Pendência criada: ${p.type ?? 'NEGOCIACAO'}`,
      description: p.description ?? undefined,
      date:        new Date(p.createdAt).toISOString(),
    })
  }

  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  return NextResponse.json({ data: events })
}
