// =============================================================================
// Hub de Canais e Integrações — estado REAL de cada canal para a loja.
// Lê as fontes que já existem (nada duplicado): contas da Central de
// Publicações, canais de captação do CRM (+ registro de recebimentos),
// WhatsApp da loja, telefonia, eventos com falha no Gateway de Entrada.
// "Conectado" só quando a parte foi configurada E não há falha pendente.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { channelSpec } from '@/lib/publications/channels'
import { loadChannelLog, loadChannels } from '@/lib/crm/channels'
import { channelEmailAddress } from '@/lib/crm/email-lead-core'
import { inboundEmailDomain } from '@/lib/crm/email-intake'
import { getTenantWhatsappConfig } from '@/lib/whatsapp/credentials'
import {
  availabilityOf, CONNECTION_LABEL, combineState, HUB_CATALOG, publicationCapFrom,
  type Availability, type Capability, type CapState, type ConnectionState, type HubItem, type PartStatus, type SetupKind,
} from './catalog-core'

export interface HubAction { label: string; href: string }

export interface HubItemStatus {
  id: string
  name: string
  category: HubItem['category']
  color: string
  hint: string
  prerequisites: string[]
  caps: Partial<Record<Capability, CapState>>
  availability: Availability
  state: ConnectionState
  stateLabel: string
  /** Frase principal do card (o que está acontecendo). */
  summary: string
  lastActivityAt: string | null
  parts: (PartStatus & { action?: HubAction; detail?: string })[]
}

const SETUP_HREF: Record<SetupKind, string> = {
  PUBLICACAO: '/marketing/canais',
  CAPTACAO: '/crm/configuracoes',
  EMAIL_PARSER: '/crm/configuracoes',
  WHATSAPP: '/configuracoes/whatsapp',
  SITE: '/site/configuracoes',
  TELEFONIA: '/marketing/telephony/conexoes',
}

const DAY = 86_400_000

export async function hubStatus(tenantId: string): Promise<{ items: HubItemStatus[]; attention: { id: string; name: string; message: string; action?: HubAction }[] }> {
  const since = new Date(Date.now() - 7 * DAY)
  const [pubConns, leadChannels, log, whatsapp, phoneConns, deadEvents, lastWa] = await Promise.all([
    prisma.publicationConnection.findMany({ where: { tenantId }, select: { channel: true, label: true, status: true, lastError: true, tokenExpiresAt: true, lastCheckedAt: true, connectedAt: true } }),
    loadChannels(tenantId).catch(() => []),
    loadChannelLog(tenantId).catch(() => []),
    getTenantWhatsappConfig(tenantId).catch(() => null),
    prisma.telephonyTenantConnection.count({ where: { tenantId, active: true } }).catch(() => 0),
    prisma.webhookInbox.groupBy({ by: ['provider', 'channelRef'], where: { tenantId, status: 'DEAD', receivedAt: { gte: since } }, _count: { _all: true } }).catch(() => []),
    prisma.conversation.findFirst({ where: { tenantId, channel: 'WHATSAPP' }, orderBy: { lastInboundAt: 'desc' }, select: { lastInboundAt: true } }).catch(() => null),
  ])
  const emailDomain = inboundEmailDomain()
  const deadBy = new Map(deadEvents.map((d) => [`${d.provider}:${d.channelRef ?? ''}`, d._count._all]))

  const items: HubItemStatus[] = HUB_CATALOG.map((item) => {
    const caps = { ...item.caps }
    if (item.publicationChannel && caps.publication) caps.publication = publicationCapFrom(channelSpec(item.publicationChannel), caps.publication)
    const parts: HubItemStatus['parts'] = []

    for (const kind of item.setup) {
      const action = (label: string): HubAction => ({ label, href: SETUP_HREF[kind] })
      if (kind === 'PUBLICACAO' && item.publicationChannel) {
        if (caps.publication !== 'SIM' && caps.publication !== 'HOMOLOGACAO') continue
        const conns = pubConns.filter((c) => c.channel === item.publicationChannel)
        const bad = conns.find((c) => c.status === 'RECONECTAR' || c.status === 'PENDENCIA')
        const ok = conns.find((c) => c.status === 'CONECTADO')
        if (bad) parts.push({ kind, state: 'ATENCAO', message: bad.status === 'RECONECTAR' ? `Precisamos reconectar sua conta do ${item.name}.` : 'A conta de anúncios precisa de atenção.', detail: bad.lastError ?? undefined, action: action('Reconectar'), lastActivityAt: bad.lastCheckedAt?.toISOString() ?? null })
        else if (ok) parts.push({ kind, state: 'CONECTADO', message: caps.publication === 'HOMOLOGACAO' ? `Conta ${ok.label} conectada (publicação em homologação).` : `Publicando em ${ok.label}.`, action: action('Ver anúncios'), lastActivityAt: ok.lastCheckedAt?.toISOString() ?? ok.connectedAt?.toISOString() ?? null })
        else parts.push({ kind, state: 'DESCONECTADO', message: 'Anúncios: conta não conectada.', action: action('Conectar') })
      }
      if (kind === 'CAPTACAO' && item.leadChannelType) {
        const chans = leadChannels.filter((c) => c.type === item.leadChannelType)
        const active = chans.filter((c) => c.active)
        if (!chans.length) { parts.push({ kind, state: 'DESCONECTADO', message: 'Leads: canal ainda não criado.', action: action('Criar canal') }); continue }
        if (!active.length) { parts.push({ kind, state: 'DESCONECTADO', message: 'Leads: canal desativado.', action: action('Ativar') }); continue }
        const ids = new Set(active.map((c) => c.id))
        const entries = log.filter((e) => ids.has(e.channelId))
        const lastOk = entries.find((e) => e.ok)
        const lastAny = entries[0]
        const dead = active.reduce((n, c) => n + (deadBy.get(`CRM_CHANNEL:${c.id}`) ?? 0) + (deadBy.get(`EMAIL:${c.id}`) ?? 0), 0)
        if (dead) parts.push({ kind, state: 'ATENCAO', message: `${dead} lead(s) não puderam ser processados.`, action: { label: 'Ver detalhes', href: '/configuracoes/canais/tecnico' } })
        else if (lastAny && !lastAny.ok && lastAny.outcome !== 'rejected' && Date.now() - Date.parse(lastAny.at) < DAY) parts.push({ kind, state: 'ATENCAO', message: 'O último lead recebido teve problema.', detail: lastAny.message, action: action('Ver registro') })
        else parts.push({ kind, state: 'CONECTADO', message: lastOk ? 'Recebendo leads.' : 'Pronto para receber leads.', lastActivityAt: lastOk?.at ?? null, action: action('Configurar') })
      }
      if (kind === 'EMAIL_PARSER') {
        const chans = leadChannels.filter((c) => c.active && (!item.leadChannelType || c.type === item.leadChannelType))
        // Domínio de entrada ainda não liberado pela plataforma: não é tarefa do
        // lojista — só o card próprio do e-mail mostra; os demais nem citam.
        if (!emailDomain) { if (item.id === 'email_leads') parts.push({ kind, state: 'CONFIGURACAO_NECESSARIA', message: 'E-mail exclusivo em liberação pela plataforma.' }); continue }
        else if (!chans.length) parts.push({ kind, state: 'DESCONECTADO', message: 'Crie o canal para gerar o e-mail exclusivo.', action: action('Criar canal') })
        else parts.push({ kind, state: 'CONECTADO', message: `E-mail exclusivo: ${channelEmailAddress(chans[0].key, emailDomain)}`, action: action('Ver e-mail') })
      }
      if (kind === 'WHATSAPP') {
        if (!whatsapp) parts.push({ kind, state: 'DESCONECTADO', message: 'Número oficial não conectado.', action: action('Conectar') })
        else if (!process.env.META_WEBHOOK_APP_SECRET) parts.push({ kind, state: 'CONFIGURACAO_NECESSARIA', message: 'Envio ativo. O recebimento de conversas está em liberação pela plataforma.', action: action('Ver conexão') })
        else parts.push({ kind, state: 'CONECTADO', message: 'Conversas entram em CRM › Conversas.', lastActivityAt: lastWa?.lastInboundAt?.toISOString() ?? null, action: { label: 'Abrir conversas', href: '/crm/conversas' } })
      }
      if (kind === 'SITE') {
        const site = pubConns.find((c) => c.channel === 'SITE')
        parts.push(site?.status === 'CONECTADO'
          ? { kind, state: 'CONECTADO', message: 'Estoque no site e formulários virando leads.', action: action('Configurar site') }
          : { kind, state: 'DESCONECTADO', message: 'Site ainda não publicado.', action: action('Configurar site') })
      }
      if (kind === 'TELEFONIA') {
        parts.push(phoneConns
          ? { kind, state: 'CONECTADO', message: 'Ligações registradas no CRM.', action: action('Configurar') }
          : { kind, state: 'DESCONECTADO', message: 'Nenhuma central conectada.', action: action('Conectar') })
      }
    }

    const state = combineState(parts)
    const main = parts.find((p) => p.state === 'ATENCAO') ?? parts.find((p) => p.state === 'CONECTADO') ?? parts[0]
    const lastActivityAt = parts.map((p) => p.lastActivityAt).filter(Boolean).sort().pop() ?? null
    return {
      id: item.id, name: item.name, category: item.category, color: item.color, hint: item.hint, prerequisites: item.prerequisites,
      caps, availability: availabilityOf({ caps }), state, stateLabel: CONNECTION_LABEL[state],
      summary: main?.message ?? '', lastActivityAt, parts,
    }
  })

  const attention = items.flatMap((i) => i.parts.filter((p) => p.state === 'ATENCAO').map((p) => ({ id: i.id, name: i.name, message: p.message, action: p.action })))
  return { items, attention }
}
