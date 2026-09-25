// =============================================================================
// Central de Publicações — situações e transições. PURO (testado).
//
// "Publicado" só entra com CONFIRMAÇÃO do canal (consulta ou evento). Resposta
// HTTP de aceite, conexão válida ou feed gerado não bastam: nesses casos a
// publicação fica "Em análise" até a verificação confirmar.
// =============================================================================

export const PUB_STATUS = [
  'RASCUNHO', 'PRONTO', 'AGENDADO', 'NA_FILA', 'ENVIANDO', 'EM_ANALISE', 'PUBLICADO',
  'ATUALIZACAO_PENDENTE', 'PAUSADO', 'REMOCAO_PENDENTE', 'REMOVIDO', 'REJEITADO', 'FALHA', 'ACAO_MANUAL',
] as const
export type PubStatus = (typeof PUB_STATUS)[number]

export type DesiredState = 'PUBLICADO' | 'PAUSADO' | 'REMOVIDO'
export type JobOp = 'PUBLICAR' | 'ATUALIZAR' | 'PAUSAR' | 'RETOMAR' | 'REMOVER' | 'VERIFICAR'
export type JobStatus = 'PENDENTE' | 'EXECUTANDO' | 'CONCLUIDO' | 'FALHOU' | 'CANCELADO' | 'BLOQUEADO'

export const STATUS_LABEL: Record<PubStatus, string> = {
  RASCUNHO: 'Rascunho', PRONTO: 'Pronto', AGENDADO: 'Agendado', NA_FILA: 'Na fila', ENVIANDO: 'Enviando',
  EM_ANALISE: 'Em análise', PUBLICADO: 'Publicado', ATUALIZACAO_PENDENTE: 'Atualização pendente', PAUSADO: 'Pausado',
  REMOCAO_PENDENTE: 'Remoção pendente', REMOVIDO: 'Removido', REJEITADO: 'Rejeitado', FALHA: 'Falha', ACAO_MANUAL: 'Ação manual',
}

/** Tom do indicador (a tela mapeia para cores discretas). */
export type Tone = 'neutral' | 'info' | 'progress' | 'success' | 'warning' | 'danger' | 'muted'
export const STATUS_TONE: Record<PubStatus, Tone> = {
  RASCUNHO: 'neutral', PRONTO: 'neutral', AGENDADO: 'info', NA_FILA: 'progress', ENVIANDO: 'progress', EM_ANALISE: 'progress',
  PUBLICADO: 'success', ATUALIZACAO_PENDENTE: 'progress', PAUSADO: 'warning', REMOCAO_PENDENTE: 'progress', REMOVIDO: 'muted',
  REJEITADO: 'danger', FALHA: 'danger', ACAO_MANUAL: 'warning',
}

/** Grupos para o resumo "3 publicados, 1 pendente". */
export type Bucket = 'publicados' | 'pendentes' | 'com problema' | 'pausados' | 'removidos' | 'agendados' | 'rascunhos'
export function bucketOf(s: PubStatus): Bucket {
  switch (s) {
    case 'PUBLICADO': return 'publicados'
    case 'AGENDADO': return 'agendados'
    case 'RASCUNHO': case 'PRONTO': return 'rascunhos'
    case 'PAUSADO': return 'pausados'
    case 'REMOVIDO': return 'removidos'
    case 'REJEITADO': case 'FALHA': case 'ACAO_MANUAL': return 'com problema'
    default: return 'pendentes'
  }
}

const BUCKET_ORDER: Bucket[] = ['publicados', 'pendentes', 'com problema', 'agendados', 'pausados', 'removidos', 'rascunhos']
const SINGULAR: Record<Bucket, string> = {
  publicados: 'publicado', pendentes: 'pendente', 'com problema': 'com problema', agendados: 'agendado',
  pausados: 'pausado', removidos: 'removido', rascunhos: 'rascunho',
}

/** Resumo curto de sucesso parcial: "3 publicados, 1 pendente". */
export function summarize(statuses: string[]): string {
  const count = new Map<Bucket, number>()
  for (const s of statuses) {
    if (!(PUB_STATUS as readonly string[]).includes(s)) continue
    const b = bucketOf(s as PubStatus)
    count.set(b, (count.get(b) ?? 0) + 1)
  }
  return BUCKET_ORDER.filter((b) => count.get(b)).map((b) => {
    const n = count.get(b)!
    return `${n} ${n === 1 ? SINGULAR[b] : b}`
  }).join(', ')
}

/** Situações em que a publicação está "viva" no canal (precisa ser retirada na venda). */
export const LIVE_STATUSES: PubStatus[] = ['EM_ANALISE', 'PUBLICADO', 'ATUALIZACAO_PENDENTE', 'PAUSADO', 'ENVIANDO', 'NA_FILA']
export const TERMINAL_STATUSES: PubStatus[] = ['REMOVIDO']

/** Estado remoto confirmado → situação exibida. */
export type RemoteState = 'PUBLICADO' | 'EM_ANALISE' | 'PAUSADO' | 'REMOVIDO' | 'REJEITADO' | 'NAO_ENCONTRADO'

export function statusFromRemote(remote: RemoteState, desired: DesiredState): PubStatus {
  switch (remote) {
    case 'PUBLICADO': return desired === 'PUBLICADO' ? 'PUBLICADO' : desired === 'PAUSADO' ? 'ATUALIZACAO_PENDENTE' : 'REMOCAO_PENDENTE'
    case 'EM_ANALISE': return desired === 'REMOVIDO' ? 'REMOCAO_PENDENTE' : 'EM_ANALISE'
    case 'PAUSADO': return desired === 'PAUSADO' ? 'PAUSADO' : desired === 'REMOVIDO' ? 'REMOCAO_PENDENTE' : 'ATUALIZACAO_PENDENTE'
    case 'REMOVIDO': case 'NAO_ENCONTRADO': return desired === 'REMOVIDO' ? 'REMOVIDO' : 'FALHA'
    case 'REJEITADO': return 'REJEITADO'
  }
}

/** Operação que leva do estado confirmado ao desejado (null = nada a fazer). */
export function opFor(confirmed: RemoteState | null, desired: DesiredState, hasRemote: boolean): JobOp | null {
  if (desired === 'REMOVIDO') return hasRemote && confirmed !== 'REMOVIDO' && confirmed !== 'NAO_ENCONTRADO' ? 'REMOVER' : null
  if (desired === 'PAUSADO') return hasRemote && confirmed === 'PUBLICADO' ? 'PAUSAR' : null
  if (!hasRemote || confirmed === 'REMOVIDO' || confirmed === 'NAO_ENCONTRADO' || confirmed === 'REJEITADO') return 'PUBLICAR'
  if (confirmed === 'PAUSADO') return 'RETOMAR'
  return null
}

/** Prioridade na fila: retirada de vendido passa na frente de tudo. */
export function priorityOf(op: JobOp, sold = false): number {
  if (op === 'REMOVER') return sold ? 0 : 1
  if (op === 'PAUSAR') return sold ? 0 : 2
  if (op === 'VERIFICAR') return 6
  if (op === 'ATUALIZAR') return 4
  return 5
}

/** Situação enquanto a tarefa está na fila/executando. */
export function statusWhileQueued(op: JobOp): PubStatus {
  if (op === 'REMOVER') return 'REMOCAO_PENDENTE'
  if (op === 'ATUALIZAR' || op === 'PAUSAR' || op === 'RETOMAR') return 'ATUALIZACAO_PENDENTE'
  if (op === 'VERIFICAR') return 'EM_ANALISE'
  return 'NA_FILA'
}
