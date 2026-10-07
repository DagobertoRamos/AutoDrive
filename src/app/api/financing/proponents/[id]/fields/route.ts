// =============================================================================
// /api/financing/proponents/[id]/fields — ficha universal campo a campo.
//   GET   : valores atuais dos campos pedidos (?keys=a,b,c ou ?all=1)
//   PATCH : { fields: { chave: valor } } — valida cada campo; CPF/CNPJ/e-mail
//           já preenchidos só o MASTER troca. Grava histórico nas fichas abertas.
// =============================================================================

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { identityLockError } from '@/lib/identity-lock'
import { FIELDS, FIELD_BY_KEY } from '@/lib/finance/fi/fields-core'
import { monthsSince, normalizeField } from '@/lib/finance/fi/field-input'
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
    const sp = new URL(req.url).searchParams
    const keys = sp.get('all') ? FIELDS.map((f) => f.key) : (sp.get('keys') ?? '').split(',').filter((k) => FIELD_BY_KEY[k]).slice(0, FIELDS.length)
    const out: Record<string, unknown> = {}
    for (const k of keys) {
      const v = (person as Record<string, unknown>)[k]
      out[k] = v instanceof Prisma.Decimal ? Number(v) : v instanceof Date ? v.toISOString().slice(0, 10) : v ?? null
    }
    return NextResponse.json({ success: true, data: { personType: person.personType, values: out, updatedAt: person.updatedAt } })
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
    for (const [k, v] of Object.entries(fields).slice(0, FIELDS.length)) {
      const r = normalizeField(k, v)
      if (!r.ok) { errors[k] = r.error; continue }
      data[k] = r.value
    }
    if (Object.keys(errors).length) return NextResponse.json({ success: false, error: Object.values(errors)[0], fieldErrors: errors }, { status: 422 })
    const lock = identityLockError(auth.user.role, person as unknown as Record<string, unknown>, data)
    if (lock) return NextResponse.json({ success: false, error: lock }, { status: 403 })
    if (data.razaoSocial && person.personType === 'PJ') data.nomeCompleto = data.razaoSocial
    if (data.dataAdmissao instanceof Date) data.tempoEmpregoMeses = monthsSince(data.dataAdmissao)
    // Representante legal: se não informado, o primeiro sócio pessoa física que assina pela empresa.
    if (Array.isArray(data.socios) && person.personType === 'PJ') {
      const rep = (data.socios as Record<string, unknown>[]).find((s) => s.assina === 'SIM' && String(s.documento ?? '').length === 11)
      const hasRep = (data.representanteNome ?? person.representanteNome) && (data.representanteCpf ?? person.representanteCpf)
      if (rep && !hasRep) { data.representanteNome = rep.nome; data.representanteCpf = rep.documento }
    }
    if (!Object.keys(data).length) return NextResponse.json({ success: true, data: { updated: 0 } })
    await prisma.financeProponent.update({ where: { id }, data: data as Prisma.FinanceProponentUpdateInput })
    const open = await prisma.financeProposal.findMany({ where: { tenantId: auth.tenantId, OR: [{ proponentId: id }, { coProponentId: id }], status: { notIn: ['CANCELADA', 'EXPIRADA'] } }, select: { id: true } })
    const labels = Object.keys(data).filter((k) => FIELD_BY_KEY[k]).map((k) => FIELD_BY_KEY[k].label)
    const changedMsg = labels.length > 6 ? `Cadastro do cliente atualizado (${labels.length} campos).` : `Cadastro do cliente atualizado: ${labels.join(', ')}.`
    for (const p of open) {
      await addTimeline(prisma, { tenantId: auth.tenantId, proposalId: p.id, type: 'NOTE', source: 'MANUAL', actorId: auth.user.id, message: changedMsg })
      await prisma.financeProposal.updateMany({ where: { id: p.id, status: 'SIMULACAO' }, data: { status: 'PREENCHENDO' } })
    }
    await createSafeAuditLog({ userId: auth.user.id, tenantId: auth.tenantId, action: 'UPDATE', entity: 'FinanceProponent', entityId: id, userName: auth.user.name, userRole: auth.user.role, afterData: Object.keys(data) })
    return NextResponse.json({ success: true, data: { updated: Object.keys(data).length } })
  } catch (err) { return fiErrorResponse(err) }
}
