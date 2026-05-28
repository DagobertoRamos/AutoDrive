// =============================================================================
// /api/negotiations/[id]/documents
//   GET  → lista documentos da negociação (contratos, procurações, etc).
//   POST → gera documento a partir de um templateId (merge fields aplicados).
//          Também aceita criação avulsa (sem templateId) com bodyHtml direto.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma }               from '@/lib/prisma'
import { handlePrismaError }    from '@/lib/prisma-errors'
import { requireModule }        from '@/lib/permissions'
import { renderTemplate, buildDealContext } from '@/lib/negotiation/document-merge'

const VALID_TYPES = new Set([
  'CONTRATO_COMPRA', 'CONTRATO_VENDA', 'CONTRATO_TROCA', 'CONTRATO_CONSIGNACAO',
  'PROCURACAO', 'RECIBO', 'TERMO_ENTREGA', 'TERMO_RESPONSABILIDADE', 'OUTRO',
])

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try { requireModule(session.user.role, 'negotiations') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }

  const deal = await prisma.deal.findUnique({
    where:  { id: params.id },
    select: { id: true, tenantId: true },
  })
  if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })
  if (session.user.tenantId && deal.tenantId !== session.user.tenantId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  try {
    const data = await prisma.dealDocument.findMany({
      where:   { dealId: params.id },
      orderBy: { createdAt: 'desc' },
      include: { template: { select: { name: true, type: true } } },
    })
    return NextResponse.json({ data })
  } catch (err) { return handlePrismaError(err) }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try { requireModule(session.user.role, 'negotiations.manage') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }

  try {
    const body = await req.json()
    const templateId: string | undefined = body?.templateId
    const explicitType: string | undefined = body?.type ? String(body.type).toUpperCase() : undefined
    const customName: string | undefined = body?.name
    const customHtml: string | undefined = body?.bodyHtml

    // Carrega deal com tudo necessário pro contexto de merge
    const deal = await prisma.deal.findUnique({
      where:   { id: params.id },
      include: {
        person:   true,
        customer: true,
        vehicles: true,
      },
    })
    if (!deal) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 })
    if (session.user.tenantId && deal.tenantId !== session.user.tenantId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    let html  = customHtml ?? ''
    let name  = customName ?? 'Documento'
    let type  = explicitType ?? 'OUTRO'
    let templateRefId: string | null = null

    if (templateId) {
      const tpl = await prisma.documentTemplate.findUnique({ where: { id: templateId } })
      if (!tpl || !tpl.active) return NextResponse.json({ error: 'Template não disponível' }, { status: 404 })
      // visibilidade: global ou do tenant do user
      if (tpl.tenantId !== null && session.user.tenantId && tpl.tenantId !== session.user.tenantId) {
        return NextResponse.json({ error: 'Template fora do seu tenant' }, { status: 403 })
      }
      const ctx = buildDealContext(deal as any)
      html = renderTemplate(tpl.bodyHtml, ctx)
      name = customName ?? tpl.name
      type = tpl.type
      templateRefId = tpl.id
    }

    if (!VALID_TYPES.has(type)) return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
    if (!html.trim()) return NextResponse.json({ error: 'Conteúdo vazio (informe templateId ou bodyHtml).' }, { status: 400 })

    const doc = await prisma.dealDocument.create({
      data: {
        dealId:      params.id,
        tenantId:    deal.tenantId,
        templateId:  templateRefId,
        type:        type as any,
        name,
        bodyHtml:    html,
        status:      'GERADO',
        createdById: session.user.id,
      },
    })

    return NextResponse.json({ data: doc }, { status: 201 })
  } catch (err) { return handlePrismaError(err) }
}
