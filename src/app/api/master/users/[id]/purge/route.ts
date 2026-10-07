// =============================================================================
// /api/master/users/[id]/purge — exclusão definitiva (hard delete) pelo MASTER.
//   GET  → prévia: o que será apagado e o que só perde o vínculo
//   POST → { confirmEmail } — apaga de vez, de qualquer loja (sem inativar antes)
// Salvaguardas: só MASTER; não apaga a si mesmo nem o último MASTER ativo;
// confirmação digitando o e-mail do usuário; AuditLog gravado antes.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireMaster, logMasterAction } from '@/lib/master-guards'
import { prisma } from '@/lib/prisma'
import { purgeUser, PURGE_TABLE_LABELS } from '@/lib/master/purge-user'

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } | Promise<{ id: string }> }

async function load(ctxArg: Ctx) {
  const { id } = await Promise.resolve(ctxArg.params)
  const { session, error } = await requireMaster()
  if (error) return { error }
  if (!id) return { error: NextResponse.json({ success: false, error: 'ID ausente.' }, { status: 400 }) }
  if (session?.id === id) {
    return { error: NextResponse.json({ success: false, error: 'Você não pode excluir o seu próprio usuário.' }, { status: 403 }) }
  }
  const user = await prisma.user.findUnique({
    where: { id }, select: { id: true, name: true, email: true, role: true, status: true, tenantId: true },
  })
  if (!user) return { error: NextResponse.json({ success: false, error: 'Usuário não encontrado.' }, { status: 404 }) }
  if (user.role === 'MASTER') {
    const others = await prisma.user.count({ where: { role: 'MASTER', status: 'ATIVO', id: { not: id } } })
    if (others < 1) return { error: NextResponse.json({ success: false, error: 'Não é possível excluir o último MASTER ativo.' }, { status: 409 }) }
  }
  return { session, user }
}

const label = (t: string) => PURGE_TABLE_LABELS[t] ?? t

export async function GET(_req: NextRequest, ctxArg: Ctx) {
  const r = await load(ctxArg)
  if ('error' in r) return r.error
  try {
    const steps = await prisma.$transaction((tx) => purgeUser(tx, r.user.id, false), { timeout: 30_000 })
    return NextResponse.json({ success: true, data: steps.map((s) => ({ ...s, label: label(s.table) })) })
  } catch (err) {
    return purgeError(err)
  }
}

export async function POST(req: NextRequest, ctxArg: Ctx) {
  const r = await load(ctxArg)
  if ('error' in r) return r.error
  const { session, user } = r
  const body = await req.json().catch(() => ({})) as { confirmEmail?: string }
  if ((body.confirmEmail ?? '').trim().toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json({ success: false, error: 'Digite o e-mail do usuário para confirmar.' }, { status: 400 })
  }

  // Registra antes: depois o vínculo do usuário nos logs some.
  await logMasterAction(session, 'PURGE_USER', 'User', user.id, {
    tenantId: user.tenantId,
    beforeData: { email: user.email, role: user.role, name: user.name, status: user.status },
    reason: 'Exclusão definitiva via Painel MASTER.',
    req,
  }).catch((e) => console.error('[purge] log falhou:', e))

  try {
    const steps = await prisma.$transaction((tx) => purgeUser(tx, user.id, true), { timeout: 60_000 })
    const deleted = steps.filter((s) => s.action === 'delete').reduce((n, s) => n + s.count, 0)
    return NextResponse.json({
      success: true,
      data: steps.map((s) => ({ ...s, label: label(s.table) })),
      message: `${user.name} (${user.email}) excluído definitivamente — ${deleted} registro(s) apagado(s).`,
    })
  } catch (err) {
    console.error('[purge user]', err)
    return purgeError(err)
  }
}

/** Erro do banco legível para o MASTER (tabela/regra que bloqueou), nada é apagado. */
function purgeError(err: unknown) {
  const e = err as { code?: string; message?: string; meta?: { message?: string; code?: string } }
  const raw = String(e.meta?.message ?? e.message ?? '')
  const fk = raw.match(/on table "([^"]+)" violates foreign key constraint "([^"]+)" on table "([^"]+)"/)
  const text = fk
    ? `A exclusão foi bloqueada: registros em "${label(fk[3])}" ainda apontam para "${label(fk[1])}" (${fk[2]}). Nada foi apagado.`
    : `Falha no banco${e.meta?.code ? ` (${e.meta.code})` : e.code ? ` (${e.code})` : ''}: ${raw.split(/\r?\n/).filter(Boolean).slice(-1)[0]?.slice(0, 300) || 'erro desconhecido'}. Nada foi apagado.`
  return NextResponse.json({ success: false, error: text }, { status: 409 })
}
