// =============================================================================
// Gera (ou regera) os documentos da venda e grava em DealDocument, aparecendo
// na aba Contratos da negociação. Cada tipo fica marcado em storageKey
// ("auto:VENDA" | "auto:SINAL" | "auto:INTERMEDIACAO"); regerar atualiza o
// mesmo documento enquanto ele não estiver assinado (assinado = cria outro).
// =============================================================================

import { prisma } from '@/lib/prisma'
import { loadContractData, type AnyDocKind } from './contract-data'
import { DOC_KIND_LABEL, renderDocument, type DocKind } from './documents-core'
import { isProxyKind, PROXY_KIND_LABEL, renderProxyDocument } from './proxies-core'

const TYPE: Record<DocKind, 'CONTRATO_VENDA' | 'OUTRO'> = { VENDA: 'CONTRATO_VENDA', SINAL: 'OUTRO', INTERMEDIACAO: 'OUTRO' }
const isBaseKind = (x: unknown): x is DocKind => x === 'VENDA' || x === 'SINAL' || x === 'INTERMEDIACAO'
export const isDocKind = (x: unknown): x is AnyDocKind => isBaseKind(x) || isProxyKind(x)
export const docKindLabel = (k: AnyDocKind) => (isProxyKind(k) ? PROXY_KIND_LABEL[k] : DOC_KIND_LABEL[k])

export async function generateDealDocument(dealId: string, kind: AnyDocKind, actorId: string | null, tenantWhere: Record<string, unknown> = {}) {
  const loaded = await loadContractData(dealId, tenantWhere)
  if (!loaded) throw new Error('Negociação não encontrada.')
  if (kind === 'INTERMEDIACAO' && !loaded.intermediated) {
    // Sem proprietário identificado: sai com os campos do proprietário em branco.
    loaded.data.proprietario = { tipo: 'PF', nome: '' }
  }
  if (isProxyKind(kind) && kind.endsWith('_VENDA') && !loaded.hasSold) throw new Error('Esta negociação não tem veículo vendido.')
  if (isProxyKind(kind) && kind.endsWith('_TROCA') && !loaded.hasEntry) throw new Error('Esta negociação não tem veículo de troca ou compra.')
  const html = isProxyKind(kind) ? renderProxyDocument(kind, loaded.data) : renderDocument(kind, loaded.data)
  const name = `${docKindLabel(kind)} — Nº ${loaded.data.numero}`
  const key = `auto:${kind}`
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { tenantId: true } })
  const existing = await prisma.dealDocument.findFirst({ where: { dealId, storageKey: key, status: { in: ['RASCUNHO', 'GERADO'] } }, orderBy: { createdAt: 'desc' } })
  const doc = existing
    ? await prisma.dealDocument.update({ where: { id: existing.id }, data: { bodyHtml: html, name, status: 'GERADO' } })
    : await prisma.dealDocument.create({ data: { dealId, tenantId: deal?.tenantId ?? null, type: isProxyKind(kind) ? (kind.startsWith('ENTREGA') ? 'TERMO_ENTREGA' : 'PROCURACAO') : TYPE[kind], name, bodyHtml: html, status: 'GERADO', storageKey: key, createdById: actorId } })
  return { doc, regenerated: !!existing, suggested: loaded.suggested }
}

/** Ao finalizar: contrato de venda (+ termo de intermediação se a loja intermedeia). Não derruba a finalização. */
export async function generateOnFinalize(dealId: string, actorId: string | null): Promise<void> {
  try {
    const loaded = await loadContractData(dealId)
    if (!loaded) return
    // Contrato (+ intermediação) ao finalizar; procurações e termos ficam nos botões.
    for (const k of loaded.suggested.filter((x) => x === 'VENDA' || x === 'INTERMEDIACAO')) await generateDealDocument(dealId, k, actorId)
  } catch (e) { console.error('[contratos] geração automática ao finalizar', e) }
}

/** Ao registrar o sinal: termo de sinal e reserva. */
export async function generateOnSignal(dealId: string, actorId: string | null): Promise<void> {
  try { await generateDealDocument(dealId, 'SINAL', actorId) } catch (e) { console.error('[contratos] termo de sinal', e) }
}
