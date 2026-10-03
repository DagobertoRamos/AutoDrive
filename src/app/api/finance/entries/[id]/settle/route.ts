// =============================================================================
// /api/finance/entries/[id]/settle — baixa detalhada do lançamento.
//   GET  : finance        → detalhe (itens, origem, cobrado × custo real, comissões de documento)
//   POST : finance.manage → { items?, amount?, settle?, paidDate?, accountId?, paymentMethod?,
//                             supplierId?, counterparty?, documentNumber?, notes?, dueDate? }
//          Itens viram o valor real; o original fica em chargedAmount. settle=true dá a baixa.
// =============================================================================

import { NextResponse } from 'next/server'
import { z, ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse, ownsTenant } from '@/lib/finance/finance-service'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { loadEntryDetail, saveEntryCosts } from '@/lib/finance/entry-settlement'

type Ctx = { params: Promise<{ id: string }> }

const opt = z.string().trim().max(240).nullable().optional()
const schema = z.object({
  items: z.array(z.object({
    kind: z.string().max(40),
    description: z.string().max(200).nullable().optional(),
    amount: z.coerce.number().min(0).max(100_000_000),
    supplierId: z.string().max(40).nullable().optional(),
  })).max(60).optional(),
  amount: z.coerce.number().positive().max(100_000_000).nullable().optional(),
  settle: z.boolean().optional(),
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/).nullable().optional(),
  accountId: z.string().max(40).nullable().optional(),
  paymentMethod: opt,
  supplierId: z.string().max(40).nullable().optional(),
  counterparty: opt,
  documentNumber: opt,
  notes: z.string().trim().max(2000).nullable().optional(),
})

async function guard(id: string, perm: 'finance' | 'finance.manage') {
  const user = await getSessionUser()
  if (!user) return { error: unauthorizedResponse() }
  if (!canAccessModule(user.role, perm)) return { error: forbiddenResponse(perm === 'finance' ? 'Sem acesso ao financeiro.' : 'Sem permissão para dar baixa.') }
  const gate = await assertModuleEnabled(user, 'finance'); if (gate) return { error: gate }
  const e = await prisma.financialEntry.findUnique({ where: { id }, select: { tenantId: true } })
  if (!e) return { error: NextResponse.json({ success: false, error: 'Lançamento não encontrado.' }, { status: 404 }) }
  if (!ownsTenant(user.role, user.tenantId, e.tenantId)) return { error: forbiddenResponse('Lançamento de outro tenant.') }
  return { user, tenantId: e.tenantId }
}

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params
  const g = await guard(id, 'finance')
  if ('error' in g) return g.error
  try {
    const detail = await loadEntryDetail(id)
    return NextResponse.json({ success: true, data: { ...detail, canManage: canAccessModule(g.user.role, 'finance.manage') } })
  } catch (err) { return handlePrismaError(err) }
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params
  const g = await guard(id, 'finance.manage')
  if ('error' in g) return g.error
  try {
    const body = schema.parse(await req.json())
    // Conta e fornecedor precisam ser da mesma loja.
    if (body.accountId) {
      const a = await prisma.financialAccount.findUnique({ where: { id: body.accountId }, select: { tenantId: true } })
      if (!a || (g.user.role !== 'MASTER' && a.tenantId !== g.tenantId)) return NextResponse.json({ success: false, error: 'Conta inválida.' }, { status: 400 })
    }
    if (body.supplierId) {
      const s = await prisma.supplier.findUnique({ where: { id: body.supplierId }, select: { tenantId: true } })
      if (!s || (g.user.role !== 'MASTER' && s.tenantId !== g.tenantId)) return NextResponse.json({ success: false, error: 'Fornecedor inválido.' }, { status: 400 })
    }
    const error = await saveEntryCosts(id, body)
    if (error) return NextResponse.json({ success: false, error }, { status: 400 })
    await createSafeAuditLog({ userId: g.user.id, tenantId: g.tenantId, action: body.settle ? 'SETTLE' : 'UPDATE', entity: 'FinancialEntry', entityId: id, userName: g.user.name, userRole: g.user.role })
    return NextResponse.json({ success: true, data: await loadEntryDetail(id) })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
