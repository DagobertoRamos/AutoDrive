// =============================================================================
// GET /api/vehicles/[id]/documents
//
// Agrega TODOS os documentos do veículo, vindos de fontes diferentes:
//   • EvaluationAttachment — CRLV, ATPV-e, laudos, fotos das avaliações
//   • DealAttachment       — contratos, NFe, comprovantes, RENAVE de deals
//
// Categoriza em 3 grupos:
//   1) "DOCUMENTOS DO VEÍCULO"  (CRLV, ATPV_E, DUT_CRV, NFE)
//   2) "LAUDOS"                  (LAUDO_CAUTELAR, vistoria, técnico)
//   3) "NEGOCIAÇÃO"              (CONTRATO_*, PROCURACAO_*, RECIBO, COMPROVANTE_*)
//
// Reaproveita o mesmo storage do cautelar (publicUrl) — não duplica nada.
// Aceita ?type=CRLV pra filtrar por categoria específica.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { assertModuleEnabled } from '@/lib/tenant-modules'

export const dynamic = 'force-dynamic'

type DocGroup = 'VEHICLE' | 'LAUDO' | 'NEGOTIATION' | 'OUTRO'

const GROUP_BY_CATEGORY: Record<string, DocGroup> = {
  CRLV: 'VEHICLE', ATPV_E: 'VEHICLE', DUT_CRV: 'VEHICLE', NFE: 'VEHICLE',
  LAUDO_CAUTELAR: 'LAUDO', VISTORIA: 'LAUDO', LAUDO_TECNICO: 'LAUDO',
  CONTRATO_ASSINADO: 'NEGOTIATION', PROCURACAO_ASSINADA: 'NEGOTIATION',
  RECIBO: 'NEGOTIATION',
  COMPROVANTE_PAGAMENTO: 'NEGOTIATION', COMPROVANTE_QUITACAO: 'NEGOTIATION',
  COMPROVANTE_DEBITO: 'NEGOTIATION', COMPROVANTE_TROCO: 'NEGOTIATION',
}

const GROUP_LABEL: Record<DocGroup, string> = {
  VEHICLE:     'Documentos do veículo',
  LAUDO:       'Laudos',
  NEGOTIATION: 'Negociação',
  OUTRO:       'Outros',
}

export async function GET(
  req: NextRequest,
  ctxArg: { params: { id: string } | Promise<{ id: string }> },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  try { requireModule(session.user.role, 'stock') }
  catch { return NextResponse.json({ error: 'Sem permissão' }, { status: 403 }) }
  { const gate = await assertModuleEnabled(session.user, 'stock.view'); if (gate) return gate }

  const params = await Promise.resolve(ctxArg.params)
  const vehicleId = params?.id
  if (!vehicleId) return NextResponse.json({ error: 'ID ausente' }, { status: 400 })

  const typeFilter = (req.nextUrl.searchParams.get('type') ?? '').toUpperCase()

  try {
    // 1) Confirma vehicle existe e isola por tenant
    const vehicle = await prisma.vehicle.findUnique({
      where:  { id: vehicleId },
      select: { id: true, tenantId: true, plate: true },
    })
    if (!vehicle) return NextResponse.json({ error: 'Veículo não encontrado' }, { status: 404 })
    if (session.user.tenantId && vehicle.tenantId && vehicle.tenantId !== session.user.tenantId) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    // 2) IDs de avaliações que pertencem a esse veículo (vehicleId direto OU
    //    placa+tenant para histórico legado anterior à existência do vehicleId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const evals: any[] = await prisma.vehicleEvaluation.findMany({
      where: {
        OR: [
          { vehicleId },
          ...(vehicle.plate
            ? [{ plate: vehicle.plate, tenantId: vehicle.tenantId ?? undefined }]
            : []),
        ],
      },
      select: { id: true, createdAt: true },
    })
    const evalIds = evals.map((e) => e.id)

    // 3) IDs de DealVehicles ligados (pra puxar attachments dos deals)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dealVehicles: any[] = await prisma.dealVehicle.findMany({
      where:  { vehicleId },
      select: { dealId: true },
    })
    const dealIds = Array.from(new Set(dealVehicles.map((dv) => dv.dealId)))

    // 4) Carrega anexos em paralelo das 2 fontes
    const [evalAttachments, dealAttachments] = await Promise.all([
      evalIds.length
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? (prisma as any).evaluationAttachment.findMany({
            where: {
              evaluationId: { in: evalIds },
              ...(typeFilter ? { category: typeFilter } : {}),
            },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true, fileName: true, fileType: true, mimeType: true, fileSize: true,
              publicUrl: true, storageKey: true, category: true, section: true,
              uploadedByName: true, createdAt: true, evaluationId: true,
            },
          })
        : [],
      dealIds.length
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? (prisma as any).dealAttachment.findMany({
            where: {
              dealId: { in: dealIds },
              ...(typeFilter ? { category: typeFilter } : {}),
            },
            orderBy: { uploadedAt: 'desc' },
            select: {
              id: true, fileName: true, fileType: true, mimeType: true, fileSize: true,
              publicUrl: true, storageKey: true, category: true, notes: true,
              uploadedByName: true, uploadedAt: true, dealId: true,
            },
          })
        : [],
    ])

    // 5) Unifica em shape único
     
    type UnifiedDoc = {
      id: string; source: 'EVALUATION' | 'DEAL';
      sourceId: string; sourceLabel: string;
      category: string; categoryLabel: string;
      group: DocGroup; groupLabel: string;
      title: string;
      fileName: string; fileType: string; mimeType: string; fileSize: number | null;
      publicUrl: string | null; uploadedByName: string | null; createdAt: Date;
    }

    const docs: UnifiedDoc[] = []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const a of (evalAttachments as any[])) {
      const cat = (a.category ?? '').toUpperCase()
      const group = GROUP_BY_CATEGORY[cat] ?? 'OUTRO'
      docs.push({
        id:            a.id,
        source:        'EVALUATION',
        sourceId:      a.evaluationId,
        sourceLabel:   'Avaliação',
        category:      cat,
        categoryLabel: cat.replace(/_/g, ' '),
        group,
        groupLabel:    GROUP_LABEL[group],
        title:         cat === 'CRLV' ? `CRLV - ${vehicle.plate ?? ''}`.trim() : (a.fileName ?? cat),
        fileName:      a.fileName,
        fileType:      a.fileType,
        mimeType:      a.mimeType,
        fileSize:      a.fileSize,
        publicUrl:     a.publicUrl,
        uploadedByName: a.uploadedByName,
        createdAt:     a.createdAt,
      })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const a of (dealAttachments as any[])) {
      const cat = (a.category ?? '').toUpperCase()
      const group = GROUP_BY_CATEGORY[cat] ?? 'NEGOTIATION'
      docs.push({
        id:            a.id,
        source:        'DEAL',
        sourceId:      a.dealId,
        sourceLabel:   'Negociação',
        category:      cat,
        categoryLabel: cat.replace(/_/g, ' '),
        group,
        groupLabel:    GROUP_LABEL[group],
        title:         a.fileName ?? cat,
        fileName:      a.fileName,
        fileType:      a.fileType,
        mimeType:      a.mimeType,
        fileSize:      a.fileSize,
        publicUrl:     a.publicUrl,
        uploadedByName: a.uploadedByName,
        createdAt:     a.uploadedAt,
      })
    }

    // 6) Ordena por data desc + agrupa
    docs.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))

    const grouped: Record<DocGroup, UnifiedDoc[]> = {
      VEHICLE: [], LAUDO: [], NEGOTIATION: [], OUTRO: [],
    }
    for (const d of docs) grouped[d.group].push(d)

    return NextResponse.json({
      data:      docs,
      groups:    grouped,
      summary:   {
        total: docs.length,
        byGroup: Object.fromEntries(Object.entries(grouped).map(([g, arr]) => [g, arr.length])),
      },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
