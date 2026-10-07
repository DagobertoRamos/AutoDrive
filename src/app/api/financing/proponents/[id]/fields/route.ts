// =============================================================================
// /api/financing/proponents/[id]/fields — ficha universal campo a campo.
//   GET   : valores atuais dos campos pedidos (?keys=a,b,c)
//   PATCH : { fields: { chave: valor } } — valida cada campo; CPF/CNPJ/e-mail
//           já preenchidos só o MASTER troca. Grava histórico nas fichas abertas.
// =============================================================================

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { identityLockError } from '@/lib/identity-lock'
import { FIELD_BY_KEY } from '@/lib/finance/fi/fields-core'
import { normalizeField } from '@/lib/finance/fi/field-input'
import { addTimeline } from '@/lib/finance/fi/events'
import { fiAuth, fiErrorResponse } from '@/lib/finance/fi/route'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const auth = await fiAuth(req, { cap: 'editarFicha' })
  if (!auth.ok) return auth.res
  const { id } = await params
  try {
    const person = await prisma.financeProponent.findFirst({ where: { id, tenantId: auth.tenantId } })
    if (!person) return NextResponse.json({ success: false, error: 'Cliente não encontrado.' }, { status: 404 })
    const keys = (new URL(req.url).searchParams.get('keys') ?? '').split(',').filter((k) => FIELD_BY_KEY[k]).slice(0, 60)
    const out: Record<string, unknown> = {}
    for (const k of keys) {
      const v = (person as Record<string, unknown>)[k]
      out[k] = v instanceof Prisma.Decimal ? Number(v) : v instanceof Date ? v.toISOString().slice(0, 10) : v ?? null
    }
    return NextResponse.json({ success: true, data: { personType: person.personType, values: out } })
  } catch (err) { return fiErrorResponse(err) }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await fiAuth(req, { module: 'financing.manage', cap: 'editarFicha' })
  if (!auth.ok) return auth.res
  const { id } = await params
  try {
    const person = await prisma.financeProponent.findFirst({ where: { id, tenantId: auth.tenantId } })
    if (!person) return NextResponse.json({ success: false, error: 'Cliente não encontrado.' }, { status: 404 })
    const { fields } = z.object({ fields: z.record(z.string().max(40), z.unknown()) }).parse(await req.json())
    const data: Record<string, unknown> = {}
    const errors: Record<string, string> = {}
    for (const [k, v] of Object.entries(fields).slice(0, 60)) {
      const r = normalizeField(k, v)
      if (!r.ok) { errors[k] = r.error; continue }
      data[k] = r.value
    }
    if (Object.keys(errors).length) return NextResponse.json({ success: false, error: Object.values(errors)[0], fieldErrors: errors }, { status: 422 })
    const lock = identityLockError(auth.user.role, person as unknown as Record<string, unknown>, data)
    if (lock) return NextResponse.json({ success: false, error: lock }, { status: 403 })
    if (data.razaoSocial && person.personType === 'PJ') data.nomeCompleto = data.razaoSocial
    if (!Object.keys(data).length) return NextResponse.json({ success: true, data: { updated: 0 } })
    await prisma.financeProponent.update({ where: { id }, data: data as Prisma.FinanceProponentUpdateInput })
    const open = await prisma.financeProposal.findMany({ where: { tenantId: auth.tenantId, OR: [{ proponentId: id }, { coProponentId: id }], status: { notIn: ['CANCELADA', 'EXPIRADA'] } }, select: { id: true } })
    for (const p of open) {
      await addTimeline(prisma, { tenantId: auth.tenantId, proposalId: p.id, type: 'NOTE', source: 'MANUAL', actorId: auth.user.id, message: `Ficha completada: ${Object.keys(data).map((k) => FIELD_BY_KEY[k]?.label ?? k).join(', ')}.` })
      await prisma.financeProposal.updateMany({ where: { id: p.id, status: 'SIMULACAO' }, data: { status: 'PREENCHENDO' } })
    }
    await createSafeAuditLog({ userId: auth.user.id, tenantId: auth.tenantId, action: 'UPDATE', entity: 'FinanceProponent', entityId: id, userName: auth.user.name, userRole: auth.user.role, afterData: Object.keys(data) })
    return NextResponse.json({ success: true, data: { updated: Object.keys(data).length } })
  } catch (err) { return fiErrorResponse(err) }
}
