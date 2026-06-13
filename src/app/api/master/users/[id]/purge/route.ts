// =============================================================================
// POST /api/master/users/[id]/purge — Force delete (hard delete real)
//
// Apaga o usuário FISICAMENTE do banco. Cascade explícito em todas as
// dezenas de relações non-cascade que o User tem. Tudo em UMA transação:
// se qualquer passo falhar, NADA é apagado.
//
// Política de segurança:
//   1. Usuário precisa estar com status=INATIVO (proteção em 2 passos)
//   2. Não pode ser o próprio MASTER logado
//   3. Não pode ser o último MASTER ativo (mas como exige INATIVO, na
//      prática MASTER nunca chega aqui — sempre o inativam antes)
//   4. Confirmação forte na UI (digite "EXCLUIR PERMANENTE")
//   5. AuditLog registrado ANTES do purge (depois o userId vira NULL)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireMaster, logMasterAction } from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> },
) {
  const params = await Promise.resolve(ctxArg.params)
  const userId = params?.id
  if (!userId) return NextResponse.json({ success: false, error: 'ID ausente.' }, { status: 400 })

  const { session, error } = await requireMaster()
  if (error) return error

  // Guards
  if (session?.id === userId) {
    return NextResponse.json(
      { success: false, error: 'Você não pode excluir permanentemente seu próprio usuário.' },
      { status: 403 },
    )
  }

  const existing = await prisma.user.findUnique({
    where:  { id: userId },
    select: { id: true, name: true, email: true, role: true, status: true, tenantId: true },
  })
  if (!existing) {
    return NextResponse.json({ success: false, error: 'Usuário não encontrado.' }, { status: 404 })
  }

  // Exige INATIVO (proteção em 2 passos: inativar antes, purgar depois)
  if (existing.status !== 'INATIVO') {
    return NextResponse.json(
      { success: false, error: `Usuário precisa estar INATIVO antes do purge. Status atual: ${existing.status}.` },
      { status: 409 },
    )
  }

  // Último MASTER guard (extra paranoia — mesmo já inativo)
  if (existing.role === 'MASTER') {
    const activeMasters = await prisma.user.count({
      where: { role: 'MASTER', status: 'ATIVO', id: { not: userId } },
    })
    if (activeMasters < 1) {
      return NextResponse.json(
        { success: false, error: 'Não é possível purgar — sistema ficaria sem MASTER ativo.' },
        { status: 409 },
      )
    }
  }

  // Loga ANTES do purge (depois userId em audit_logs vai virar NULL)
  await logMasterAction(session, 'PURGE_USER', 'User', userId, {
    tenantId:   existing.tenantId,
    beforeData: { email: existing.email, role: existing.role, name: existing.name },
    reason:     'Hard delete (force purge) executado via Painel MASTER.',
    req,
  }).catch((e) => console.error('[purge] preflight log failed:', e))

  try {
    await prisma.$transaction(async (tx) => {
      // ── 1) SET NULL em todas as FKs opcionais (User?) ─────────────────────
      //
      // Usamos raw SQL pra atualizar várias tabelas com nomes camelCase
      // (Prisma quota colunas automaticamente).
      const setNullTargets: Array<[string, string[]]> = [
        ['deals',                       ['managerId', 'approvedById', 'cancelledById', 'releasedByUserId', 'recusedByUserId']],
        ['deal_status_history',         ['changedByUserId']],
        ['deal_release_requests',       ['reviewedBy']],
        ['vehicle_evaluations',         ['evaluatedById']],
        ['vehicle_stock_pendencies',    ['resolvedById']],
        ['contract_parse_results',      ['reviewedById']],
        ['pendencies',                  ['resolvedByUserId', 'assignedUserId', 'validatedByUserId', 'escalatedByUserId']],
        ['pendency_status_history',     ['changedByUserId']],
        ['google_sheets_auto_sync_jobs',         ['triggeredById', 'createdByUserId']],
        ['google_sheets_auto_sync_configs',      ['createdByUserId']],
        ['system_settings',             ['updatedByUserId']],
        ['internal_notice_logs',        ['userId']],
        ['audit_logs',                  ['userId']],
        ['notification_rules',          ['createdByUserId']],
        ['communication_test_logs',     ['triggeredBy']],
      ]
      for (const [table, cols] of setNullTargets) {
        const setClause = cols.map((c) => `"${c}" = NULL`).join(', ')
        const where     = cols.map((c) => `"${c}" = $1`).join(' OR ')
        await tx.$executeRawUnsafe(`UPDATE "${table}" SET ${setClause} WHERE ${where}`, userId)
      }

      // ── 2) DELETE em tabelas com FK obrigatória (userId String NOT NULL) ──
      // Algumas já têm cascade — TX vai cobrir ambas (idempotente).
      const deleteTargets = [
        'mobile_devices',
        'notification_preferences',
        'password_resets',
        'api_tokens',
        'impersonation_sessions',
        'notification_deliveries',
        'notifications',
        'pendency_comments',
        'commission_extracts',
        'commission_adjustments',
        'import_jobs',
        'internal_notice_reads',
        'message_returns',
      ]
      for (const table of deleteTargets) {
        await tx.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "userId" = $1`, userId).catch((e: unknown) => {
          // Algumas tabelas podem não existir no schema atual — degrade silencioso
          console.warn(`[purge] DELETE ${table} skipped:`, e instanceof Error ? e.message : e)
        })
      }

      // ── 3) DELETE de sub-cadastros 1:1 (sellers, managers) ────────────────
      await tx.seller.deleteMany({ where:  { userId } }).catch(() => {})
      await tx.manager.deleteMany({ where: { userId } }).catch(() => {})

      // ── 4) Por fim, DELETE do User ────────────────────────────────────────
      await tx.user.delete({ where: { id: userId } })
    }, { timeout: 30_000 })

    return NextResponse.json({
      success: true,
      message: `Usuário ${existing.name} (${existing.email}) excluído permanentemente do banco de dados.`,
    })
  } catch (err) {
    console.error('[purge user]', err)
    return handlePrismaError(err)
  }
}
