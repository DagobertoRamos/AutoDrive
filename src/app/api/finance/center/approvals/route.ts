// =============================================================================
// /api/finance/center/approvals — alçadas de aprovação (lib/finance/approvals).
//   GET  : finance → { config, items, canConfigure, role, userId }
//   POST : { action: 'CONFIG', config }            (ADM/MASTER)
//          { action: 'COMMISSION_RELEASE', mode: 'APROVACAO' | 'RECEBIMENTO' } (ADM/MASTER)
//          { action: 'APPROVE' | 'REJECT', id, reason? } (quem tem alçada)
// =============================================================================

import { NextResponse } from 'next/server'
import { financeGuard } from '@/lib/finance/access'
import { decideApproval, getApprovalConfig, listApprovals, saveApprovalConfig } from '@/lib/finance/approvals'
import { getCommissionRelease, setCommissionRelease } from '@/lib/finance/commission-release'
import { createSafeAuditLog } from '@/lib/auth-guards'

export const dynamic = 'force-dynamic'
const ADMINS = ['ADM', 'MASTER']
const bad = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status })

export async function GET(req: Request) {
  const g = await financeGuard('finance', req)
  if (g.error) return g.error
  const config = await getApprovalConfig(g.tenantId)
  const items = await listApprovals(g.tenantId).catch(() => null)
  return NextResponse.json({ success: true, data: { config, commissionRelease: await getCommissionRelease(g.tenantId), items: items ?? [], ready: items != null, canConfigure: ADMINS.includes(g.user.role), role: g.user.role, userId: g.user.id } })
}

export async function POST(req: Request) {
  const g = await financeGuard('finance', req)
  if (g.error) return g.error
  const b = await req.json().catch(() => ({})) as { action?: string; config?: unknown; id?: string; reason?: string | null }
  const actor = { id: g.user.id, name: g.user.name, role: g.user.role }
  if (b.action === 'CONFIG') {
    if (!ADMINS.includes(g.user.role)) return bad('Só ADM/MASTER configuram as alçadas.', 403)
    return NextResponse.json({ success: true, data: await saveApprovalConfig(g.tenantId, b.config, actor) })
  }
  if (b.action === 'COMMISSION_RELEASE') {
    if (!ADMINS.includes(g.user.role)) return bad('Só ADM/MASTER configuram a liberação de comissão.', 403)
    const mode = (b as { mode?: string }).mode === 'RECEBIMENTO' ? 'RECEBIMENTO' : 'APROVACAO'
    const before = await getCommissionRelease(g.tenantId)
    await setCommissionRelease(g.tenantId, mode, g.user.id)
    await createSafeAuditLog({ userId: g.user.id, tenantId: g.tenantId, action: 'COMMISSION_RELEASE_CONFIG', entity: 'FinanceApprovalConfig', entityId: g.tenantId, userName: g.user.name, userRole: g.user.role, beforeData: { mode: before }, afterData: { mode } })
    return NextResponse.json({ success: true })
  }
  if (b.action === 'APPROVE' || b.action === 'REJECT') {
    const err = await decideApproval(g.tenantId, String(b.id ?? ''), b.action === 'APPROVE', b.reason ?? null, actor).catch(() => 'Aprovações ainda não ativadas: aplique a migration do banco.')
    return err ? bad(err) : NextResponse.json({ success: true })
  }
  return bad('Ação inválida.')
}
