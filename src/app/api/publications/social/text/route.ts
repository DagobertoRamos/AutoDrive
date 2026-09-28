// POST /api/publications/social/text — textos do anúncio com os dados do sistema.
// { vehicleId, kind: 'DESCRICAO', style, useAi } → descrição (IA ou modelo pronto)
// { vehicleId, kind: 'CONDICOES' }               → condições padrão da loja + ficha
import { NextResponse } from 'next/server'
import { bad, pubAuth } from '@/lib/publications/api'
import { generateConditions, generateDescription } from '@/lib/publications/social/text'
import { DESC_STYLES, type DescStyle } from '@/lib/publications/social/text-core'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
  const a = await pubAuth(req, 'marketing.publications.prepare')
  if (a instanceof NextResponse) return a
  const b = (await req.json().catch(() => ({}))) as { vehicleId?: unknown; kind?: unknown; style?: unknown; useAi?: unknown }
  if (typeof b.vehicleId !== 'string') return bad('Informe o veículo.')
  try {
    if (b.kind === 'CONDICOES') return NextResponse.json({ success: true, ...(await generateConditions(a.tenantId, b.vehicleId)) })
    const style: DescStyle = (DESC_STYLES as readonly string[]).includes(String(b.style)) ? (b.style as DescStyle) : 'COMPLETO'
    return NextResponse.json({ success: true, ...(await generateDescription(a.tenantId, b.vehicleId, style, b.useAi !== false)) })
  } catch (e) {
    return bad(e instanceof Error ? e.message : 'Não foi possível gerar o texto.')
  }
}
