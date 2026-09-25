// POST /api/webhook/publications/mercado-livre — notificações do Mercado Livre
// (tópico items). Responde 200 rápido; o evento só dispara uma CONSULTA ao ML
// com o token da loja dona da conta (o corpo nunca é tratado como verdade).
// Repetidos e fora de ordem são ignorados (ver lib/publications/webhooks.ts).
import { NextResponse } from 'next/server'
import { handleMercadoLivre, type MlNotification } from '@/lib/publications/webhooks'
import { kickWorker } from '@/lib/publications/api'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const raw = await req.text()
  if (raw.length > 10_000) return NextResponse.json({ ok: false }, { status: 413 })
  let body: MlNotification
  try { body = JSON.parse(raw) as MlNotification } catch { return NextResponse.json({ ok: false }, { status: 400 }) }
  try {
    const r = await handleMercadoLivre(body)
    if (r.status === 'PROCESSADO') kickWorker()
    return NextResponse.json({ ok: true, status: r.status })
  } catch (e) {
    console.error('[webhook ml]', e)
    return NextResponse.json({ ok: false }, { status: 500 }) // o ML reenvia
  }
}
