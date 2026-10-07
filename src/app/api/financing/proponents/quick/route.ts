// =============================================================================
// POST /api/financing/proponents/quick — cadastro rápido do cliente da ficha
// (ficha universal progressiva). PF: nome, CPF, nascimento, celular, e-mail.
// PJ: razão social, CNPJ, celular, e-mail. Mesmo CPF/CNPJ na loja = reaproveita.
// =============================================================================

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createSafeAuditLog } from '@/lib/auth-guards'
import { normalizeField } from '@/lib/finance/fi/field-input'
import { FiError } from '@/lib/finance/fi/orchestrator'
import { fiAuth, fiErrorResponse } from '@/lib/finance/fi/route'

const schema = z.object({
  personType: z.enum(['PF', 'PJ']).default('PF'),
  nomeCompleto: z.string().trim().max(160).optional(),
  razaoSocial: z.string().trim().max(160).optional(),
  cpf: z.string().max(20).optional(),
  cnpj: z.string().max(20).optional(),
  dataNascimento: z.string().max(10).optional(),
  celular: z.string().max(20),
  email: z.string().max(160),
})

export async function POST(req: Request) {
  const auth = await fiAuth(req, { module: 'financing.manage', cap: 'criarFicha' })
  if (!auth.ok) return auth.res
  try {
    const d = schema.parse(await req.json())
    const take = (k: string, v: unknown, required = true) => {
      if ((v == null || v === '') && !required) return null
      const r = normalizeField(k, v)
      if (!r.ok) throw new FiError(r.error, 422)
      if (r.value == null && required) throw new FiError('Preencha os campos obrigatórios.', 422)
      return r.value
    }
    const celular = take('celular', d.celular) as string
    const email = take('email', d.email) as string
    if (d.personType === 'PJ') {
      const razaoSocial = take('razaoSocial', d.razaoSocial) as string
      const cnpj = take('cnpj', d.cnpj) as string
      const existing = await prisma.financeProponent.findFirst({ where: { tenantId: auth.tenantId, cnpj }, select: { id: true } })
      if (existing) { await prisma.financeProponent.updateMany({ where: { id: existing.id, email: null }, data: { email } }); return NextResponse.json({ success: true, data: { id: existing.id, existing: true } }) }
      const p = await prisma.financeProponent.create({ data: { tenantId: auth.tenantId, personType: 'PJ', nomeCompleto: razaoSocial, razaoSocial, cnpj, celular, email, createdById: auth.user.id } })
      await createSafeAuditLog({ userId: auth.user.id, tenantId: auth.tenantId, action: 'CREATE', entity: 'FinanceProponent', entityId: p.id, userName: auth.user.name, userRole: auth.user.role })
      return NextResponse.json({ success: true, data: { id: p.id, existing: false } }, { status: 201 })
    }
    const nomeCompleto = take('nomeCompleto', d.nomeCompleto) as string
    if (nomeCompleto.split(' ').length < 2) throw new FiError('Informe o nome completo.', 422)
    const cpf = take('cpf', d.cpf) as string
    const dataNascimento = take('dataNascimento', d.dataNascimento) as Date
    const existing = await prisma.financeProponent.findFirst({ where: { tenantId: auth.tenantId, cpf }, orderBy: { updatedAt: 'desc' }, select: { id: true } })
    if (existing) { await prisma.financeProponent.updateMany({ where: { id: existing.id, email: null }, data: { email } }); return NextResponse.json({ success: true, data: { id: existing.id, existing: true } }) }
    const p = await prisma.financeProponent.create({ data: { tenantId: auth.tenantId, personType: 'PF', nomeCompleto, cpf, dataNascimento, celular, email, createdById: auth.user.id } })
    await createSafeAuditLog({ userId: auth.user.id, tenantId: auth.tenantId, action: 'CREATE', entity: 'FinanceProponent', entityId: p.id, userName: auth.user.name, userRole: auth.user.role })
    return NextResponse.json({ success: true, data: { id: p.id, existing: false } }, { status: 201 })
  } catch (err) { return fiErrorResponse(err) }
}
