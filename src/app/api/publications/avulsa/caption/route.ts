// POST /api/publications/avulsa/caption — texto do Post avulso por ocasião.
// { occasion, notes?, format?, useAi? } → { text, ai, source }
// Modelo pronto com o nome/cidade/contatos da loja, ou IA (se configurada) só
// com as informações da loja + o que a pessoa escreveu em "notes".
import { NextResponse } from 'next/server'
import { runAiWithFailover } from '@/lib/ai/resolve-ai-provider'
import { bad, pubAuth } from '@/lib/publications/api'
import { payloadContext } from '@/lib/publications/service'
import { finishOccasion, occasionPrompt, occasionTemplate, OCCASIONS, type Occasion, type StoreInfo } from '@/lib/publications/social/avulsa-text-core'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const a = await pubAuth(req, 'marketing.publications.prepare')
  if (a instanceof NextResponse) return a
  const b = (await req.json().catch(() => ({}))) as { occasion?: unknown; notes?: unknown; format?: unknown; useAi?: unknown }
  if (!(OCCASIONS as readonly string[]).includes(String(b.occasion))) return bad('Escolha a ocasião.')
  const o = b.occasion as Occasion
  const notes = typeof b.notes === 'string' ? b.notes.slice(0, 600) : ''
  const format = typeof b.format === 'string' ? b.format : 'POST'
  const ctx = await payloadContext(a.tenantId)
  const s: StoreInfo = { storeName: ctx.loc.storeName, city: ctx.loc.location.city, whatsapp: ctx.settings.contacts.whatsapp, instagram: ctx.settings.contacts.instagram, site: ctx.settings.contacts.site }
  if (b.useAi) {
    const r = await runAiWithFailover('social_caption', async (ai) => {
      if (ai.mock) throw new Error('Sem IA real configurada.')
      const out = await ai.adapter.generateText(occasionPrompt(o, s, notes, format), { ...ai.ctx, maxTokens: Math.min(ai.ctx.maxTokens ?? 600, 600) })
      if (!out.text?.trim()) throw new Error('A IA respondeu vazio.')
      return { text: out.text, name: ai.providerName }
    })
    if (r.ok) return NextResponse.json({ success: true, text: finishOccasion(r.result.text, o, s, format), ai: true, source: r.result.name })
  }
  const text = occasionTemplate(o, s, notes)
  return NextResponse.json({ success: true, text: format === 'STORY' ? text.split('\n\n').slice(0, 2).join('\n') : text, ai: false, source: b.useAi ? 'modelo pronto (sem IA configurada)' : 'modelo pronto' })
}
