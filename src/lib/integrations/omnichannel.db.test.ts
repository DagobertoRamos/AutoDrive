// =============================================================================
// CRM omnichannel — integração com BANCO REAL (local). Não roda no `npm test`.
//   OMNI_DB_TEST=1 DATABASE_URL=postgresql://postgres@localhost:5433/autodrive_dev npx vitest run src/lib/integrations/omnichannel.db.test.ts
// Cobre: lead repetido, webhooks iguais simultâneos, falha → reprocesso,
// atribuição, veículo pela placa (vendido → semelhantes), e-mail de portal,
// conversa do WhatsApp (mensagem repetida, mesmo cliente de outro canal,
// resposta e janela de 24 h), escopo da Caixa de Entrada e estado do Hub.
// Tudo o que cria é apagado no fim.
// =============================================================================

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'crypto'

const URL_OK = /@(localhost|127\.0\.0\.1):5433\//.test(process.env.DATABASE_URL ?? '')
const RUN = process.env.OMNI_DB_TEST === '1' && URL_OK
if (process.env.OMNI_DB_TEST === '1' && !URL_OK) throw new Error('Recusado: DATABASE_URL precisa ser o Postgres LOCAL (localhost:5433).')

/* eslint-disable @typescript-eslint/no-explicit-any */
// Sem avisos reais (push/WhatsApp) e sem distribuição automática no teste.
vi.mock('@/services/notification.service', () => ({ notify: vi.fn(async () => undefined), notifyByRole: vi.fn(async () => undefined) }))
vi.mock('@/lib/marketing/distribution', () => ({ distributeLeadById: vi.fn(async () => false) }))
const sent: { to: string; text: string }[] = []
vi.mock('@/lib/whatsapp/credentials', () => ({ getTenantWhatsappConfig: vi.fn(async () => ({ kind: 'META', creds: { phoneNumberId: 'PN-TEST', accessToken: 'x' } })) }))
vi.mock('@/lib/whatsapp/registry', () => ({ getWhatsappAdapter: () => ({ sendText: async (a: { to: string; text: string }) => { sent.push(a); return { id: `wamid.OUT.${sent.length}` } } }) }))

const d = RUN ? describe : describe.skip

d('CRM omnichannel (banco local)', () => {
  let prisma: any
  let tenantId = ''
  let channelsBefore: any[] = []
  const tag = randomUUID().slice(0, 8)
  const phone = `1197${String(Date.now()).slice(-7)}`
  const created = { leads: new Set<string>(), vehicles: [] as string[], convs: new Set<string>() }
  let chan: any
  let adminId = ''

  beforeAll(async () => {
    prisma = (await import('@/lib/prisma')).prisma
    const t = await prisma.tenant.findFirst({ where: { name: { contains: 'AutoDrive' } }, select: { id: true } })
    tenantId = t.id
    adminId = (await prisma.user.findFirst({ where: { tenantId, status: 'ATIVO' }, select: { id: true } })).id
    const { loadChannels, saveChannels } = await import('@/lib/crm/channels')
    channelsBefore = await loadChannels(tenantId)
    const next = await saveChannels(tenantId, [...channelsBefore, { type: 'GENERIC', name: `Teste ${tag}`, active: true }], adminId)
    chan = next.find((c: any) => c.name === `Teste ${tag}`)
    const v = await prisma.vehicle.create({ data: { tenantId, plate: `TST${Math.floor(Math.random() * 10)}A${String(Math.floor(Math.random() * 100)).padStart(2, '0')}`, brand: 'Toyota', model: 'Corolla', stockStatus: 'VENDIDO', active: true, salePrice: 120000 } })
    created.vehicles.push(v.id)
  })

  afterAll(async () => {
    if (!prisma) return
    const { saveChannels } = await import('@/lib/crm/channels')
    await saveChannels(tenantId, channelsBefore, adminId)
    // OMNI_KEEP=1: mantém os dados para conferir as telas (apague depois).
    if (process.env.OMNI_KEEP === '1') { console.log('MANTIDOS', JSON.stringify({ leads: [...created.leads], convs: [...created.convs], vehicles: created.vehicles })); return }
    const leadIds = [...created.leads]
    const convIds = [...created.convs]
    await prisma.crmLeadInteraction.deleteMany({ where: { leadId: { in: leadIds } } })
    await prisma.crmLeadPlacement?.deleteMany?.({ where: { leadId: { in: leadIds } } }).catch(() => {})
    await prisma.conversation.deleteMany({ where: { id: { in: convIds } } })
    await prisma.marketingLead.deleteMany({ where: { id: { in: leadIds } } })
    await prisma.vehicle.deleteMany({ where: { id: { in: created.vehicles } } })
    await prisma.webhookInbox.deleteMany({ where: { tenantId, OR: [{ channelRef: chan?.id }, { channelRef: 'PN-TEST' }, { provider: 'EMAIL', channelRef: chan?.id }] } })
  })

  it('mesmo lead entregue 2x AO MESMO TEMPO vira UM lead, com atribuição', async () => {
    const { intakeChannelLead } = await import('@/lib/crm/channel-intake')
    const body = { nome: `Cliente ${tag}`, telefone: phone, lead_id: `ext-${tag}`, utm_source: 'google', gclid: `G-${tag}`, campaign_name: 'Feirão' }
    const [a, b] = await Promise.all([intakeChannelLead(tenantId, chan, body, null), intakeChannelLead(tenantId, chan, body, null)])
    const ids = [a.body.leadId, b.body.leadId].filter(Boolean)
    expect(new Set(ids).size).toBe(1)
    const leadId = ids[0] as string
    created.leads.add(leadId)
    const inbox = await prisma.webhookInbox.count({ where: { provider: 'CRM_CHANNEL', channelRef: chan.id } })
    expect(inbox).toBe(1)
    const lead = await prisma.marketingLead.findUnique({ where: { id: leadId } })
    expect(lead.metadata.attribution.firstTouch).toMatchObject({ gclid: `G-${tag}`, utmSource: 'google', campaign: 'Feirão' })
    expect(lead.metadata.correlationId).toMatch(/^EVT-\d{4}-/)
    // Reenvio com o mesmo id da plataforma (corpo diferente) → repetido.
    const c = await intakeChannelLead(tenantId, chan, { ...body, mensagem: 'reenvio' }, null)
    expect(c.body.outcome).toBe('duplicate')
  })

  it('falha no processamento não perde o lead: fica FAILED e o reprocesso cria', async () => {
    const { receiveEvent, processInboxEvent, requeueEvent } = await import('@/lib/integrations/inbox')
    const { handleChannelLeadEvent } = await import('@/lib/crm/channel-intake')
    const ev = await receiveEvent({ provider: 'CRM_CHANNEL', kind: 'LEAD', tenantId, channelRef: chan.id, scope: `${tenantId}:${chan.id}`, providerEventId: `fail-${tag}`, payload: { nome: 'Falha', telefone: `2198${String(Date.now()).slice(-7)}`, lead_id: `fail-${tag}` } })
    const r1 = await processInboxEvent(ev.id, async () => { throw new Error('banco caiu') })
    expect(r1.status).toBe('FAILED')
    const row = await prisma.webhookInbox.findUnique({ where: { id: ev.id } })
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now())
    expect(row.payload).toBeTruthy()
    expect(await requeueEvent(ev.id, tenantId)).toBe(true)
    const r2 = await processInboxEvent(ev.id, handleChannelLeadEvent)
    expect(r2.status).toBe('PROCESSED')
    created.leads.add(r2.resultRef!)
  })

  it('placa citada liga o veículo; vendido traz semelhantes', async () => {
    const v = await prisma.vehicle.findUnique({ where: { id: created.vehicles[0] } })
    const { intakeChannelLead } = await import('@/lib/crm/channel-intake')
    const r = await intakeChannelLead(tenantId, chan, { nome: 'Placa', telefone: `3198${String(Date.now()).slice(-7)}`, mensagem: `Tenho interesse no carro placa ${v.plate}`, lead_id: `plate-${tag}` }, null)
    created.leads.add(r.body.leadId as string)
    const lead = await prisma.marketingLead.findUnique({ where: { id: r.body.leadId } })
    expect(lead.vehicleId).toBe(v.id)
    expect(lead.metadata.vehicleSold).toMatchObject({ vehicleId: v.id })
    expect(Array.isArray(lead.metadata.similarVehicles)).toBe(true)
    expect(lead.notes).toContain('já foi vendido')
  })

  it('e-mail de portal vira lead (id do anúncio, origem do portal)', async () => {
    const { receiveEvent, processInboxEvent } = await import('@/lib/integrations/inbox')
    const { handleEmailLeadEvent } = await import('@/lib/crm/email-intake')
    const mail = { messageId: `<m-${tag}@webmotors>`, from: 'leads@webmotors.com.br', to: [`leads+${chan.key.toLowerCase()}@in.test`], subject: 'Novo lead', date: '', text: `Nome: Email ${tag}\nTelefone: (41) 99876-${String(Date.now()).slice(-4)}\nVeículo: Onix 2022\nhttps://www.webmotors.com.br/comprar/x/123456789` }
    const ev = await receiveEvent({ provider: 'EMAIL', kind: 'EMAIL', tenantId, channelRef: chan.id, scope: `${tenantId}:${chan.id}`, providerEventId: mail.messageId, payload: mail })
    const r = await processInboxEvent(ev.id, handleEmailLeadEvent)
    expect(r.status).toBe('PROCESSED')
    created.leads.add(r.resultRef!)
    const lead = await prisma.marketingLead.findUnique({ where: { id: r.resultRef } })
    expect(lead.source).toBe('WEBMOTORS') // canal genérico: a origem é o portal do e-mail
    expect(lead.metadata.externalListingId).toBe('123456789')
    const again = await receiveEvent({ provider: 'EMAIL', kind: 'EMAIL', tenantId, channelRef: chan.id, scope: `${tenantId}:${chan.id}`, providerEventId: mail.messageId, payload: mail })
    expect(again.duplicate).toBe(true)
  })

  it('WhatsApp: mesmo cliente de outro canal entra no MESMO lead; mensagem repetida não duplica', async () => {
    const { receiveEvent, processInboxEvent } = await import('@/lib/integrations/inbox')
    const { handleWhatsappEvent } = await import('@/lib/inbox/whatsapp-inbound')
    const waId = `55${phone}`
    const msg = (id: string, text: string) => ({ phoneNumberId: 'PN-TEST', message: { id, from: waId, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }, contact: { profile: { name: `Cliente ${tag}` }, wa_id: waId } })
    const send = async (id: string, text: string) => {
      const ev = await receiveEvent({ provider: 'WHATSAPP', kind: 'MESSAGE', tenantId, channelRef: 'PN-TEST', scope: `${tenantId}:PN-TEST`, providerEventId: id, payload: msg(id, text) })
      return ev.duplicate ? null : processInboxEvent(ev.id, handleWhatsappEvent)
    }
    const r1 = await send(`wamid.${tag}.1`, 'Aceita meu Onix na troca?')
    expect(r1!.status).toBe('PROCESSED')
    created.convs.add(r1!.resultRef!)
    expect(await send(`wamid.${tag}.1`, 'Aceita meu Onix na troca?')).toBeNull()
    await send(`wamid.${tag}.2`, 'Tem financiamento?')
    const conv = await prisma.conversation.findUnique({ where: { id: r1!.resultRef }, include: { messages: true } })
    expect(conv.messages).toHaveLength(2)
    expect(conv.unreadCount).toBe(2)
    // Telefone já tinha lead aberto pelo canal de captação → é o mesmo lead.
    const first = await prisma.marketingLead.findFirst({ where: { tenantId, metadata: { path: ['externalLeadId'], equals: `ext-${tag}` } } })
    expect(conv.leadId).toBe(first.id)
    const lead = await prisma.marketingLead.findUnique({ where: { id: first.id } })
    expect(lead.metadata.attribution.firstTouch.gclid).toBe(`G-${tag}`)
    expect(lead.metadata.attribution.lastTouch.source).toBe('WHATSAPP')
    const samePhone = (await prisma.marketingLead.findMany({ where: { tenantId, phone: { contains: phone.slice(-4) } }, select: { phone: true } }))
      .filter((l: any) => (l.phone ?? '').replace(/\D/g, '').slice(-8) === phone.slice(-8))
    expect(samePhone).toHaveLength(1)
  })

  it('resposta pelo CRM sai pelo WhatsApp; fora de 24 h é bloqueada', async () => {
    const { listConversations, loadConversation, sendConversationReply } = await import('@/lib/inbox/conversations')
    const user = await prisma.user.findFirst({ where: { tenantId, status: 'ATIVO' }, select: { id: true, name: true, unitId: true } })
    const items = await listConversations(tenantId, 'all', user, { filter: 'nao_respondidos' })
    const item = items.find((i: any) => created.convs.has(i.id))
    expect(item?.awaitingReply).toBe(true)
    const conv = await loadConversation(tenantId, item!.id, 'all', user)
    const r = await sendConversationReply(tenantId, conv!, 'Aceitamos sim! Qual o ano do Onix?', user)
    expect(r.ok).toBe(true)
    expect(sent.at(-1)?.text).toContain('Aceitamos')
    const after = await prisma.conversation.findUnique({ where: { id: conv!.id } })
    expect(after.firstResponseAt).toBeTruthy()
    expect(after.assignedToUserId).toBe(user.id)
    expect((await listConversations(tenantId, 'all', user, { filter: 'nao_respondidos' })).some((i: any) => i.id === conv!.id)).toBe(false)
    // Vendedor (escopo próprio) de outro usuário não vê a conversa.
    expect(await loadConversation(tenantId, conv!.id, 'own', { id: 'outro', name: null, unitId: null })).toBeNull()
    await prisma.conversation.update({ where: { id: conv!.id }, data: { lastInboundAt: new Date(Date.now() - 30 * 3_600_000) } })
    const late = await sendConversationReply(tenantId, (await loadConversation(tenantId, conv!.id, 'all', user))!, 'oi', user)
    expect(late.ok).toBe(false)
  })

  it('Hub: estado real por canal', async () => {
    const { hubStatus } = await import('@/lib/integrations/hub/status')
    const h = await hubStatus(tenantId)
    const universal = h.items.find((i) => i.id === 'webhook_universal')!
    expect(universal.state).toBe('CONECTADO')
    const wm = h.items.find((i) => i.id === 'webmotors')!
    expect(wm.caps.publication).toBe('HOMOLOGACAO')
    expect(['CONECTADO', 'CONFIGURACAO_NECESSARIA', 'ATENCAO', 'DESCONECTADO']).toContain(wm.state)
  })
})
