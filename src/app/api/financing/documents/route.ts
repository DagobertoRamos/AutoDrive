// =============================================================================
// /api/financing/documents — documentos de todas as fichas da loja ativa.
// GET ?status=&q=&page= — paginado; arquivo só pela rota autenticada da ficha.
// =============================================================================

import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { DOC_STATUS_META } from '@/lib/finance/fi/documents'
import { fiAuth, fiErrorResponse, proposalScope } from '@/lib/finance/fi/route'

const STATUSES = ['PENDENTE', 'ENVIADO', 'APROVADO', 'REPROVADO']

export async function GET(req: Request) {
  const auth = await fiAuth(req, { cap: 'acessarDocumentos' })
  if (!auth.ok) return auth.res
  try {
    const sp = new URL(req.url).searchParams
    const page = Math.max(1, Number(sp.get('page')) || 1)
    const status = sp.get('status')
    const q = sp.get('q')?.trim()
    const where: Prisma.FinanceProposalDocumentWhereInput = {
      tenantId: auth.tenantId,
      proposal: { is: (await proposalScope(auth.user)) as Prisma.FinanceProposalWhereInput },
      ...(status && STATUSES.includes(status) ? { status } : {}),
      ...(q ? { OR: [{ type: { contains: q, mode: 'insensitive' } }, { proposal: { is: { proponent: { is: { nomeCompleto: { contains: q, mode: 'insensitive' } } } } } }, { proposal: { is: { code: { contains: q, mode: 'insensitive' } } } }] } : {}),
    }
    const [total, rows] = await Promise.all([
      prisma.financeProposalDocument.count({ where }),
      prisma.financeProposalDocument.findMany({
        where, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * 50, take: 50,
        include: { proposal: { select: { id: true, code: true, vehicle: true, status: true, proponent: { select: { nomeCompleto: true } } } } },
      }),
    ])
    return NextResponse.json({
      success: true, total, page,
      data: rows.map((d) => ({
        id: d.id, type: d.type, status: d.status, statusLabel: DOC_STATUS_META[d.status]?.label ?? d.status, required: d.required,
        hasFile: !!(d.storageKey || d.fileUrl), fileName: d.fileName, source: d.source,
        proposalId: d.proposalId, proposalCode: d.proposal?.code ?? null, proponentNome: d.proposal?.proponent?.nomeCompleto ?? '—',
        vehicle: d.proposal?.vehicle ?? null, createdAt: d.createdAt, uploadedAt: d.uploadedAt,
      })),
    })
  } catch (err) { return fiErrorResponse(err) }
}
