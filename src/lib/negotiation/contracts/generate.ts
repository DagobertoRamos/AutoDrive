// =============================================================================
// Gera (ou regera) os documentos da venda e grava em DealDocument, aparecendo
// na aba Contratos da negociação. Cada tipo fica marcado em storageKey
// ("auto:VENDA" | "auto:SINAL" | "auto:INTERMEDIACAO"); regerar atualiza o
// mesmo documento enquanto ele não estiver assinado (assinado = cria outro).
// =============================================================================

import { prisma } from '@/lib/prisma'
import { loadContractData } from './contract-data'
import { DOC_KIND_LABEL, renderDocument, type DocKind } from './documents-core'

const TYPE: Record<DocKind, 'CONTRATO_VENDA' | 'OUTRO'> = { VENDA: 'CONTRATO_VENDA', SINAL: 'OUTRO', INTERMEDIACAO: 'OUTRO' }
export const isDocKind = (x: unknown): x is DocKind => x === 'VENDA' || x === 'SINAL' || x === 'INTERMEDIACAO'

export async function generateDealDocument(dealId: string, kind: DocKind, actorId: string | null, tenantWhere: Record<string, unknown> = {}) {
  const loaded = await loadContractData(dealId, tenantWhere)
  if (!loaded) throw new Error('Negociação não encontrada.')
  if (kind === 'INTERMEDIACAO' && !loaded.intermediated) {
    // Sem proprietário identificado: sai com os campos do proprietário em branco.
    loaded.data.proprietario = { tipo: 'PF', nome: '' }
  }
  const html = renderDocument(kind, loaded.data)
  const name = `${DOC_KIND_LABEL[kind]} — Nº ${loaded.data.numero}`
  const key = `auto:${kind}`
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { tenantId: true } })
  const existing = await prisma.dealDocument.findFirst({ where: { dealId, storageKey: key, status: { in: ['RASCUNHO', 'GERADO'] } }, orderBy: { createdAt: 'desc' } })
  const doc = existing
    ? await prisma.dealDocument.update({ where: { id: existing.id }, data: { bodyHtml: html, name, status: 'GERADO' } })
    : await prisma.dealDocument.create({ data: { dealId, tenantId: deal?.tenantId ?? null, type: TYPE[kind], name, bodyHtml: html, status: 'GERADO', storageKey: key, createdById: actorId } })
  return { doc, regenerated: !!existing, suggested: loaded.suggested }
}

/** Ao finalizar: contrato de venda (+ termo de intermediação se a loja intermedeia). Não derruba a finalização. */
export async function generateOnFinalize(dealId: string, actorId: string | null): Promise<void> {
  try {
    const loaded = await loadContractData(dealId)
    if (!loaded) return
    for (const k of loaded.suggested.filter((x) => x !== 'SINAL')) await generateDealDocument(dealId, k, actorId)
  } catch (e) { console.error('[contratos] geração automática ao finalizar', e) }
}

/** Ao registrar o sinal: termo de sinal e reserva. */
export async function generateOnSignal(dealId: string, actorId: string | null): Promise<void> {
  try { await generateDealDocument(dealId, 'SINAL', actorId) } catch (e) { console.error('[contratos] termo de sinal', e) }
}
