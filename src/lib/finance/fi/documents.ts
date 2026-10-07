// =============================================================================
// F&I — documentos da ficha (arquivos PRIVADOS + retenção + pedido do banco).
//   • Arquivo nunca fica público: Vercel Blob privado em produção; abertura só
//     por rota autenticada (painel) ou pelo link seguro do cliente (portal).
//   • Retenção: `retainUntil` pela política LGPD da loja (padrão 180 dias).
//   • Documento pedido por um banco integrado é repassado ao banco (gateway).
//   • Dados lidos do documento são só SUGESTÃO — a ficha nunca é sobrescrita
//     sem confirmação do usuário.
// =============================================================================

import { prisma } from '@/lib/prisma'
import { deletePrivateFile, effectiveMime, readPrivateFile, savePrivateFile, validatePrivateFile } from '@/lib/storage/private-files'
import { addTimeline, notifyWatchers, reflectOnCrm } from './events'
import { resolveBank } from './gateway/resolve'

export const DOC_STATUS_META: Record<string, { label: string; tone: 'neutral' | 'info' | 'success' | 'danger' | 'warning' }> = {
  PENDENTE: { label: 'Aguardando envio', tone: 'warning' },
  ENVIADO: { label: 'Recebido — conferir', tone: 'info' },
  APROVADO: { label: 'Aprovado', tone: 'success' },
  REPROVADO: { label: 'Recusado — enviar de novo', tone: 'danger' },
}

export class DocError extends Error { constructor(message: string, readonly status = 400) { super(message); this.name = 'DocError' } }

async function retentionDays(tenantId: string): Promise<number> {
  const row = await prisma.financeTenantSetting.findUnique({ where: { tenantId_key: { tenantId, key: 'lgpd' } } })
  const v = row?.value && typeof row.value === 'object' ? (row.value as Record<string, unknown>).documentRetentionDays : null
  return typeof v === 'number' && v >= 30 ? v : 180
}

export async function attachDocumentFile(docId: string, file: File, source: 'INTERNO' | 'PORTAL', actorId: string | null) {
  const doc = await prisma.financeProposalDocument.findUnique({ where: { id: docId } })
  if (!doc || !doc.proposalId) throw new DocError('Documento não encontrado.', 404)
  if (doc.status === 'APROVADO' && source === 'PORTAL') throw new DocError('Este documento já foi aprovado.', 409)
  const mime = effectiveMime(file.type, file.name)
  const err = validatePrivateFile(mime, file.size)
  if (err) throw new DocError(err)
  if (mime.includes('xml')) throw new DocError('Envie foto ou PDF do documento.')
  const bytes = Buffer.from(await file.arrayBuffer())
  const saved = await savePrivateFile(`fi/${doc.tenantId}/${doc.proposalId}`, file.name, mime, bytes)
  const days = await retentionDays(doc.tenantId)
  const previous = doc.storageKey
  await prisma.financeProposalDocument.update({
    where: { id: docId },
    data: { storageKey: saved.key, fileName: saved.name, fileUrl: null, mimeType: mime, sizeBytes: bytes.length, uploadedAt: new Date(), retainUntil: new Date(Date.now() + days * 86_400_000), status: 'ENVIADO', source },
  })
  if (previous) await deletePrivateFile(previous)
  await addTimeline(prisma, { tenantId: doc.tenantId, proposalId: doc.proposalId, type: 'DOCUMENT', source: source === 'PORTAL' ? 'PORTAL' : 'MANUAL', actorId, message: `${doc.type}: documento ${source === 'PORTAL' ? 'enviado pelo cliente' : 'anexado'}.` })
  if (source === 'PORTAL') {
    await reflectOnCrm(doc.proposalId, 'DOCUMENTO_RECEBIDO', doc.type)
    await notifyWatchers(doc.proposalId, 'Cliente enviou documento', `${doc.type} recebido pelo link seguro.`)
  }
  // Pedido de um banco integrado: repassa ao banco (falha fica registrada, não some).
  if (doc.submissionId) await forwardToBank(doc.id, bytes).catch((e) => console.error('[fi/docs] repasse ao banco', e instanceof Error ? e.message : e))
  return { fileName: saved.name }
}

async function forwardToBank(docId: string, bytes: Buffer) {
  const doc = await prisma.financeProposalDocument.findUniqueOrThrow({ where: { id: docId } })
  const sub = doc.submissionId ? await prisma.financeProposalSubmission.findUnique({ where: { id: doc.submissionId } }) : null
  if (!sub?.bankId || !sub.externalId || sub.mode !== 'API') return
  const bank = await prisma.financeBank.findUnique({ where: { id: sub.bankId }, select: { id: true, name: true, adapterKey: true } })
  if (!bank) return
  const r = await resolveBank(sub.tenantId, bank)
  if (!r.live || !r.provider?.capabilities.documents) return
  const t0 = Date.now()
  try {
    await r.provider.sendDocument(sub.externalId, { type: doc.type, fileName: doc.fileName ?? 'documento', mimeType: doc.mimeType ?? 'application/pdf', content: new Uint8Array(bytes) }, r.ctx)
    await prisma.financeIntegrationLog.create({ data: { tenantId: sub.tenantId, adapterKey: bank.adapterKey, action: 'ENVIAR_DOCUMENTO', status: 'OK', durationMs: Date.now() - t0, correlationId: r.ctx.correlationId, proposalId: sub.proposalId, submissionId: sub.id } })
    await addTimeline(prisma, { tenantId: sub.tenantId, proposalId: sub.proposalId, submissionId: sub.id, type: 'DOCUMENT', source: 'API', message: `${doc.type} enviado ao ${bank.name}.` })
  } catch (e) {
    await prisma.financeIntegrationLog.create({ data: { tenantId: sub.tenantId, adapterKey: bank.adapterKey, action: 'ENVIAR_DOCUMENTO', status: 'ERRO', durationMs: Date.now() - t0, correlationId: r.ctx.correlationId, proposalId: sub.proposalId, submissionId: sub.id, message: e instanceof Error ? e.message.slice(0, 300) : null } })
    await addTimeline(prisma, { tenantId: sub.tenantId, proposalId: sub.proposalId, submissionId: sub.id, type: 'DOCUMENT', source: 'SISTEMA', message: `Não foi possível enviar ${doc.type} ao ${bank.name}. Envie pelo portal do banco.` })
  }
}

export async function openDocumentFile(doc: { storageKey: string | null; fileUrl: string | null; mimeType: string | null; fileName: string | null }) {
  const key = doc.storageKey ?? doc.fileUrl
  if (!key) return null
  const f = await readPrivateFile(key)
  if (!f) return null
  return { body: f.body, contentType: doc.mimeType ?? f.contentType, fileName: doc.fileName ?? 'documento' }
}

export async function removeDocumentFile(docId: string) {
  const doc = await prisma.financeProposalDocument.findUniqueOrThrow({ where: { id: docId } })
  const key = doc.storageKey ?? doc.fileUrl
  if (key) await deletePrivateFile(key)
  await prisma.financeProposalDocument.update({ where: { id: docId }, data: { storageKey: null, fileUrl: null, fileName: null, mimeType: null, sizeBytes: null, uploadedAt: null, status: doc.status === 'APROVADO' ? 'PENDENTE' : doc.status === 'ENVIADO' ? 'PENDENTE' : doc.status } })
}

/** Retenção LGPD: apaga arquivos vencidos de fichas encerradas (mantém o registro). */
export async function purgeExpiredDocuments(limit = 200): Promise<number> {
  const due = await prisma.financeProposalDocument.findMany({
    where: { retainUntil: { lt: new Date() }, OR: [{ storageKey: { not: null } }, { fileUrl: { not: null } }], proposal: { is: { OR: [{ status: { in: ['CANCELADA', 'RECUSADA', 'EXPIRADA'] } }, { fundingStatus: 'PAGO' }] } } },
    select: { id: true, tenantId: true, proposalId: true, type: true }, take: limit,
  })
  for (const d of due) {
    await removeDocumentFile(d.id)
    if (d.proposalId) await addTimeline(prisma, { tenantId: d.tenantId, proposalId: d.proposalId, type: 'DOCUMENT', source: 'SISTEMA', message: `${d.type}: arquivo apagado pela política de retenção de documentos.` })
  }
  return due.length
}

/** Campos que um documento lido pode sugerir — nunca aplicados sem confirmação. */
export const SUGGESTABLE_FIELDS = ['nomeCompleto', 'cpf', 'rg', 'dataNascimento', 'nomeMae', 'nomePai', 'cep', 'logradouro', 'numero', 'bairro', 'cidade', 'estado', 'cnh'] as const
