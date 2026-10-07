// POST /api/financing/banks/[id]/test — "Testar conexão" de verdade: chama o
// conector com a credencial da loja. Sem integração oficial, diz isso claramente.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { testBankConnection } from '@/lib/finance/fi/gateway/test-connection'
import { fiAuth, fiErrorResponse } from '@/lib/finance/fi/route'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  const auth = await fiAuth(req, { module: 'financing.manage', cap: 'configurarBancos' })
  if (!auth.ok) return auth.res
  const { id } = await params
  try {
    const bank = await prisma.financeBank.findFirst({ where: { id, tenantId: auth.tenantId }, select: { id: true, name: true, adapterKey: true } })
    if (!bank) return NextResponse.json({ success: false, error: 'Banco não encontrado.' }, { status: 404 })
    const data = await testBankConnection(auth.tenantId, bank)
    await createSafeAuditLog({ userId: auth.user.id, tenantId: auth.tenantId, action: 'FI_TESTAR_CONEXAO', entity: 'FinanceBank', entityId: id, userName: auth.user.name, userRole: auth.user.role, afterData: { ok: data.ok } })
    return NextResponse.json({ success: true, data })
  } catch (err) { return fiErrorResponse(err) }
}
