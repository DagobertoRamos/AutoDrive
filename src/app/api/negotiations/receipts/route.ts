// POST /api/negotiations/receipts — comprovante enviado no modal "Novo pagamento",
// antes de a negociação ser salva (multipart: file). Guarda no armazenamento da
// loja e devolve a referência; ao salvar a negociação, o comprovante é vinculado
// ao pagamento (DealAttachment COMPROVANTE_PAGAMENTO).
import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { requireModule } from '@/lib/permissions'
import { savePendingReceipt, validateDealUpload } from '@/lib/negotiation/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try { requireModule(session.user.role, 'negotiations') } catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }
  if (!session.user.tenantId) return NextResponse.json({ error: 'Usuário sem loja.' }, { status: 400 })
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Envie o arquivo do comprovante.' }, { status: 400 })
  const v = validateDealUpload(file.type, file.size)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  try {
    const saved = await savePendingReceipt(session.user.tenantId, file.name, file.type, Buffer.from(await file.arrayBuffer()))
    return NextResponse.json({ success: true, data: saved })
  } catch (e) {
    console.error('[receipts]', e)
    return NextResponse.json({ error: `Não foi possível guardar o comprovante: ${(e as Error).message}`.slice(0, 240) }, { status: 500 })
  }
}
