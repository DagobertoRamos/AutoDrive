// =============================================================================
// GET /api/people/search
//
// Busca Person por documento (CPF/CNPJ) ou texto (nome/email/razão social).
// Retorna a pessoa encontrada com flag `incomplete` para campos essenciais
// ausentes (útil para identificar clientes importados de planilha).
//
// Permissão: módulo `negotiations` — acessível por todos os papéis do tenant.
// Isolamento: sempre filtra por tenantId da sessão.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'
import { assertModuleEnabled } from '@/lib/tenant-modules'

export async function GET(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  try { requireModule(session.user.role, 'negotiations') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }
  { const gate = await assertModuleEnabled(session.user, 'negotiations'); if (gate) return gate }

  const { searchParams } = req.nextUrl
  const document = (searchParams.get('document') ?? '').replace(/\D/g, '')
  const query    = searchParams.get('query') ?? ''

  if (!document && !query) {
    return NextResponse.json({ error: 'Informe document ou query.' }, { status: 400 })
  }

  const tenantFilter = session.user.tenantId ? { tenantId: session.user.tenantId } : {}

  const PERSON_SELECT = {
    id:                true,
    type:              true,
    nomeCompleto:      true,
    cpf:               true,
    cnpj:              true,
    rg:                true,
    dataNascimento:    true,
    nomeMae:           true,
    razaoSocial:       true,
    nomeFantasia:      true,
    inscricaoEstadual: true,
    socioAdmNome:      true,
    socioAdmCpf:       true,
    socioAdmPhone:     true,
    email:             true,
    phone:             true,
    whatsapp:          true,
    cep:               true,
    logradouro:        true,
    numero:            true,
    complemento:       true,
    bairro:            true,
    cidade:            true,
    estado:            true,
  } as const

  try {
    // ── Busca por documento ──────────────────────────────────────────────────
    if (document) {
      const isCpf  = document.length === 11
      const isCnpj = document.length === 14

      if (!isCpf && !isCnpj) {
        return NextResponse.json({ found: false, reason: 'Documento incompleto' })
      }

      const person = await prisma.person.findFirst({
        where: {
          ...tenantFilter,
          OR: [
            isCpf  ? { cpf:  document } : null,
            isCnpj ? { cnpj: document } : null,
          ].filter(Boolean) as object[],
        },
        select: PERSON_SELECT,
      })

      if (!person) return NextResponse.json({ found: false })

      // Campos essenciais ausentes → cliente potencialmente importado
      const incomplete = !person.email || !person.phone || !person.cep

      return NextResponse.json({ found: true, incomplete, person })
    }

    // ── Busca por texto ──────────────────────────────────────────────────────
    const persons = await prisma.person.findMany({
      where: {
        ...tenantFilter,
        OR: [
          { nomeCompleto: { contains: query, mode: 'insensitive' } },
          { razaoSocial:  { contains: query, mode: 'insensitive' } },
          { email:        { contains: query, mode: 'insensitive' } },
          { cpf:          { contains: query } },
          { cnpj:         { contains: query } },
        ],
      },
      take: 10,
      select: PERSON_SELECT,
    })

    return NextResponse.json({ found: persons.length > 0, persons })

  } catch {
    return NextResponse.json({ error: 'Erro ao buscar pessoa.' }, { status: 500 })
  }
}
