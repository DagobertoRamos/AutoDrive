// POST /api/publications/avulsa/caption — texto do Post avulso.
//   Por TIPO DE CARRO: { kind, variant?, model?, brand?, notes?, format?, useAi? } → biblioteca
//     de 600 legendas por tipo (do dia a dia ao superluxo) ou IA no tom do tipo.
//   Por OCASIÃO: { occasion, notes?, format?, useAi? } → modelo pronto ou IA.
// → { text, ai, source, variant?, total? }
// Sempre com o nome/cidade/contatos da loja; a IA só recebe as informações da
// loja + o que a pessoa escreveu em "notes" (nada inventado).
import { NextResponse } from 'next/server'
import { runAiWithFailover } from '@/lib/ai/resolve-ai-provider'
import { bad, pubAuth } from '@/lib/publications/api'
import { payloadContext } from '@/lib/publications/service'
import { finishOccasion, occasionPrompt, occasionTemplate, OCCASIONS, type Occasion, type StoreInfo } from '@/lib/publications/social/avulsa-text-core'
import { finishKind, isCarKind, kindPrompt, libraryCaption, librarySize, randomVariant } from '@/lib/publications/social/caption-library-core'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const str = (x: unknown, max: number) => (typeof x === 'string' ? x.slice(0, max) : '')

export async function POST(req: Request) {
  const a = await pubAuth(req, 'marketing.publications.prepare')
  if (a instanceof NextResponse) return a
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const notes = str(b.notes, 600)
  const format = typeof b.format === 'string' ? b.format : 'POST'
  const ctx = await payloadContext(a.tenantId)
  const s: StoreInfo = { storeName: ctx.loc.storeName, city: ctx.loc.location.city, whatsapp: ctx.settings.contacts.whatsapp, instagram: ctx.settings.contacts.instagram, site: ctx.settings.contacts.site }

  const ai = async (prompt: string) => runAiWithFailover('social_caption', async (r) => {
    if (r.mock) throw new Error('Sem IA real configurada.')
    const out = await r.adapter.generateText(prompt, { ...r.ctx, maxTokens: Math.min(r.ctx.maxTokens ?? 600, 600) })
    if (!out.text?.trim()) throw new Error('A IA respondeu vazio.')
    return { text: out.text, name: r.providerName }
  })

  if (isCarKind(b.kind)) {
    const k = b.kind
    const model = str(b.model, 60) || null
    const brand = str(b.brand, 40) || null
    if (b.useAi) {
      const r = await ai(kindPrompt(k, s, { model, notes, format }))
      if (r.ok) return NextResponse.json({ success: true, text: finishKind(r.result.text, k, s, { brand, format }), ai: true, source: r.result.name })
    }
    const total = librarySize(k)
    const n = Number.isInteger(b.variant) ? ((Number(b.variant) % total) + total) % total : randomVariant(k)
    return NextResponse.json({ success: true, text: libraryCaption(k, n, s, { model, brand, format }), ai: false, variant: n, total, source: b.useAi ? 'biblioteca (sem IA configurada)' : 'biblioteca' })
  }

  if (!(OCCASIONS as readonly string[]).includes(String(b.occasion))) return bad('Escolha o tipo de carro ou a ocasião.')
  const o = b.occasion as Occasion
  if (b.useAi) {
    const r = await ai(occasionPrompt(o, s, notes, format))
    if (r.ok) return NextResponse.json({ success: true, text: finishOccasion(r.result.text, o, s, format), ai: true, source: r.result.name })
  }
  const text = occasionTemplate(o, s, notes)
  return NextResponse.json({ success: true, text: format === 'STORY' ? text.split('\n\n').slice(0, 2).join('\n') : text, ai: false, source: b.useAi ? 'modelo pronto (sem IA configurada)' : 'modelo pronto' })
}
