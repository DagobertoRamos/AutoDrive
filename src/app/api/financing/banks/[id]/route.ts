// =============================================================================
// /api/financing/banks/[id] — editar / inativar banco da loja (configurarBancos).
// Banco com histórico (fichas, propostas ou credenciais) é só inativado.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { updateBankSchema } from '@/lib/validators/financing'
import { getBankProvider } from '@/lib/finance/fi/gateway/registry'
import { fiAuth, fiErrorResponse } from '@/lib/finance/fi/route'

type Ctx = { params: Promise<{ id: string }> }
const notFound = () => NextResponse.json({ success: false, error: 'Banco não encontrado.' }, { status: 404 })

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await fiAuth(req, { module: 'financing.manage', cap: 'configurarBancos' })
  if (!auth.ok) return auth.res
  const { id } = await params
  try {
    const existing = await prisma.financeBank.findFirst({ where: { id, tenantId: auth.tenantId } })
    if (!existing) return notFound()
    const d = updateBankSchema.parse(await req.json())
    if (d.adapterKey && !getBankProvider(d.adapterKey)) return NextResponse.json({ success: false, error: 'Canal de integração inválido.' }, { status: 400 })
    if (d.name && d.name.toLowerCase() !== existing.name.toLowerCase()) {
      const dup = await prisma.financeBank.findFirst({ where: { tenantId: auth.tenantId, id: { not: id }, name: { equals: d.name, mode: 'insensitive' } }, select: { id: true } })
      if (dup) return NextResponse.json({ success: false, error: 'Já existe outro banco com este nome na loja.' }, { status: 409 })
    }
    const data: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(d)) if (v !== undefined) data[k] = k === 'adapterKey' ? (v || null) : v
    const bank = await prisma.financeBank.update({ where: { id }, data })
    await createSafeAuditLog({ userId: auth.user.id, tenantId: auth.tenantId, action: 'UPDATE', entity: 'FinanceBank', entityId: id, userName: auth.user.name, userRole: auth.user.role, beforeData: { adapterKey: existing.adapterKey, active: existing.active }, afterData: data })
    return NextResponse.json({ success: true, data: bank })
  } catch (err) { return fiErrorResponse(err) }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const auth = await fiAuth(req, { module: 'financing.manage', cap: 'configurarBancos' })
  if (!auth.ok) return auth.res
  const { id } = await params
  try {
    const existing = await prisma.financeBank.findFirst({ where: { id, tenantId: auth.tenantId }, include: { _count: { select: { proposals: true } } } })
    if (!existing) return notFound()
    const [subs, creds] = await Promise.all([
      prisma.financeProposalSubmission.count({ where: { bankId: id } }),
      prisma.financeCredential.count({ where: { bankId: id, tenantId: auth.tenantId } }),
    ])
    if (existing._count.proposals > 0 || subs > 0 || creds > 0) {
      await prisma.financeBank.update({ where: { id }, data: { active: false } })
      await createSafeAuditLog({ userId: auth.user.id, tenantId: auth.tenantId, action: 'UPDATE', entity: 'FinanceBank', entityId: id, userName: auth.user.name, userRole: auth.user.role, afterData: { active: false } })
      return NextResponse.json({ success: true, deactivated: true })
    }
    await prisma.financeBank.delete({ where: { id } })
    await createSafeAuditLog({ userId: auth.user.id, tenantId: auth.tenantId, action: 'DELETE', entity: 'FinanceBank', entityId: id, userName: auth.user.name, userRole: auth.user.role })
    return NextResponse.json({ success: true })
  } catch (err) { return fiErrorResponse(err) }
}
