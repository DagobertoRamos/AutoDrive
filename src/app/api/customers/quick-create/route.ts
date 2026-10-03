// =============================================================================
// POST /api/customers/quick-create
// Cadastro rápido de cliente no fluxo de Avaliação (uso exclusivo do
// StepCliente). Exige nome, CPF/CNPJ, nascimento/fundação, RG/IE, e-mail,
// telefone e endereço completo. Grava/atualiza a Person (cadastro universal)
// e cria/vincula o Customer. Disponível para quem tem stock.evaluate.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { canAccessModule } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { upsertPerson } from '@/lib/people/upsert-person'
import { docKind, onlyDigits, parseCota, parseDateBR, validateQuickCustomer, type QuickCustomerInput } from '@/lib/customers/quick-create'

export const dynamic = 'force-dynamic'

const SELECT = { id: true, name: true, cpf: true, phone: true, email: true } as const

export async function POST(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!canAccessModule(session.user.role, 'stock.evaluate')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }
  { const gate = await assertModuleEnabled(session.user, 'stock.evaluate'); if (gate) return gate }
  try {
    const body = (await req.json()) as Record<string, unknown>
    const s = (k: string, max = 200) => String(body[k] ?? '').trim().slice(0, max)
    const input: QuickCustomerInput = {
      name: s('name'), doc: s('doc'), birthDate: s('birthDate'), regDoc: s('regDoc', 40),
      email: s('email'), phone: s('phone'), cep: s('cep'), logradouro: s('logradouro'),
      numero: s('numero', 20), complemento: s('complemento'), bairro: s('bairro'),
      cidade: s('cidade'), estado: s('estado', 2).toUpperCase(),
    }
    const sc = (body.socio && typeof body.socio === 'object' ? body.socio : {}) as Record<string, unknown>
    const ss = (k: string, max = 200) => String(sc[k] ?? '').trim().slice(0, max)
    input.socio = {
      nome: ss('nome'), cpf: ss('cpf'), rg: ss('rg', 20), nascimento: ss('nascimento'), email: ss('email'), phone: ss('phone'),
      cep: ss('cep'), logradouro: ss('logradouro'), numero: ss('numero', 20), complemento: ss('complemento'),
      bairro: ss('bairro'), cidade: ss('cidade'), estado: ss('estado', 2).toUpperCase(), cota: ss('cota', 10),
    }
    const invalid = validateQuickCustomer(input)
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })

    const tenantId = session.user.tenantId ?? null
    const doc   = onlyDigits(input.doc)
    const pj    = docKind(doc) === 'PJ'
    const name  = input.name!
    const phone = onlyDigits(input.phone)
    const email = input.email!.toLowerCase()
    // Data de fundação (PJ) não tem coluna própria: usa Person.dataNascimento.
    const dataNascimento = parseDateBR(input.birthDate)
    const address = [
      `${input.logradouro}, ${input.numero}`,
      input.complemento || null,
      input.bairro,
      `CEP ${onlyDigits(input.cep).replace(/(\d{5})(\d{3})/, '$1-$2')}`,
    ].filter(Boolean).join(' - ')

    const result = await prisma.$transaction(async (tx) => {
      const person = await upsertPerson(tx, tenantId, {
        type: pj ? 'JURIDICA' : 'FISICA',
        cpf:  pj ? null : doc,
        cnpj: pj ? doc : null,
        nomeCompleto: name,
        razaoSocial:  pj ? name : null,
        rg:                pj ? null : input.regDoc,
        inscricaoEstadual: pj ? input.regDoc : null,
        dataNascimento,
        email, phone,
        cep: onlyDigits(input.cep), logradouro: input.logradouro, numero: input.numero,
        complemento: input.complemento || null, bairro: input.bairro, cidade: input.cidade, estado: input.estado,
        ...(pj && input.socio ? {
          socioAdmNome: input.socio.nome, socioAdmCpf: onlyDigits(input.socio.cpf), socioAdmRg: input.socio.rg,
          socioAdmDataNascimento: parseDateBR(input.socio.nascimento), socioAdmEmail: String(input.socio.email).toLowerCase(),
          socioAdmPhone: onlyDigits(input.socio.phone), socioAdmCep: onlyDigits(input.socio.cep),
          socioAdmLogradouro: input.socio.logradouro, socioAdmNumero: input.socio.numero, socioAdmComplemento: input.socio.complemento || null,
          socioAdmBairro: input.socio.bairro, socioAdmCidade: input.socio.cidade, socioAdmEstado: input.socio.estado,
        } : {}),
      })
      if ('error' in person) throw new Error(person.error)
      if (pj) {
        await tx.person.update({
          where: { id: person.id },
          data:  { possuiIE: input.regDoc!.toUpperCase() !== 'ISENTO', socioAdmCota: parseCota(input.socio?.cota) },
        })
      }

      const customerData = {
        name, phone, email, address,
        city: input.cidade!, state: input.estado!,
        personId: person.id,
      }
      // Evita duplicidade por CPF/CNPJ + tenant: reaproveita e atualiza.
      const existing = await tx.customer.findFirst({
        where:  { tenantId: tenantId ?? undefined, cpf: doc },
        select: { id: true },
      })
      if (existing) {
        const updated = await tx.customer.update({ where: { id: existing.id }, data: customerData, select: SELECT })
        return { data: updated, reused: true }
      }
      const created = await tx.customer.create({
        data:   { tenantId, cpf: doc, ...customerData },
        select: SELECT,
      })
      return { data: created, reused: false }
    })

    return NextResponse.json(result, { status: result.reused ? 200 : 201 })
  } catch (err) {
    console.error('[POST /api/customers/quick-create]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
