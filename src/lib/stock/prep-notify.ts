// =============================================================================
// Avisos da preparação do veículo. Destinatários pelo CARGO (Cadastros › Cargos):
//   preparação → cargos com "prepara" no nome (ex.: "Preparador", "Gerente de
//                preparação") + gestores (ADM / Gerente geral / Gerente)
//   marketing  → cargos com "marketing", "fotógraf" ou "mídia" no nome
//                (fotógrafos, gestor de mídias); sem ninguém, cai nos gestores.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { notifyMany } from '@/services/notification.service'

const PREP_RE = /prepara/i
const MARKETING_RE = /(marketing|fot[oó]graf|m[ií]dia)/i
const MANAGER_ROLES = ['ADM', 'GERENTE_GERAL', 'GERENTE'] as const

async function usersByPosition(tenantId: string, re: RegExp): Promise<string[]> {
  const positions = await prisma.position.findMany({ where: { OR: [{ tenantId }, { tenantId: null }], active: true }, select: { id: true, name: true } })
  const ids = positions.filter((p) => re.test(p.name)).map((p) => p.id)
  if (!ids.length) return []
  const users = await prisma.user.findMany({ where: { tenantId, status: 'ATIVO', positionId: { in: ids } }, select: { id: true } })
  return users.map((u) => u.id)
}

async function managers(tenantId: string): Promise<string[]> {
  const users = await prisma.user.findMany({ where: { tenantId, status: 'ATIVO', role: { in: [...MANAGER_ROLES] } }, select: { id: true } })
  return users.map((u) => u.id)
}

async function send(userIds: string[], tenantId: string, title: string, message: string, actionUrl: string, metadata: Record<string, unknown>) {
  const ids = [...new Set(userIds)]
  if (!ids.length) return
  await notifyMany({ userIds: ids, tenantId, type: 'SISTEMA', title, message, actionUrl, metadata, channels: ['APP_WEB', 'APP_MOBILE', 'PUSH'] })
    .catch((e) => console.error('[preparação] aviso não enviado', e))
}

/** Equipe de preparação + gestores (atraso, troca de fornecedor…). */
export async function notifyPrepTeam(tenantId: string | null, title: string, message: string, vehicleId: string) {
  if (!tenantId) return
  const [prep, mgr] = await Promise.all([usersByPosition(tenantId, PREP_RE), managers(tenantId)])
  await send([...prep, ...mgr], tenantId, title, message, `/estoque/${vehicleId}?aba=servicos`, { vehicleId })
}

/** Marketing / fotógrafos / gestor de mídias (carro pronto para fotos). */
export async function notifyMarketingTeam(tenantId: string | null, title: string, message: string, vehicleId: string) {
  if (!tenantId) return
  let ids = await usersByPosition(tenantId, MARKETING_RE)
  if (!ids.length) ids = await managers(tenantId)
  await send(ids, tenantId, title, message, `/marketing/publicacoes/nova?veiculos=${vehicleId}`, { vehicleId })
}
