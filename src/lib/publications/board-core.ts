// =============================================================================
// Painel da Central — regras do quadro (PURO, testado).
// Cinco colunas, como os grandes gerenciadores de redes (fila de rascunhos,
// agenda, envio, publicados e "precisam de atenção"): as situações técnicas
// são agrupadas para o quadro caber na tela e mostrar o que exige ação.
// =============================================================================

export const BOARD_COLUMNS = ['rascunhos', 'agendados', 'publicando', 'publicados', 'atencao'] as const
export type BoardColumn = (typeof BOARD_COLUMNS)[number]

export const COLUMN_INFO: Record<BoardColumn, { label: string; hint: string }> = {
  rascunhos: { label: 'Rascunhos', hint: 'Montados e ainda não enviados. Somem após 2 dias.' },
  agendados: { label: 'Agendados', hint: 'Saem sozinhos no dia e hora marcados.' },
  publicando: { label: 'Publicando', hint: 'Na fila, enviando ou a rede está processando (vídeos levam alguns minutos).' },
  publicados: { label: 'Publicados', hint: 'No ar dentro do prazo de guarda das mídias (padrão 5 dias, em Canais conectados). Depois, só no Histórico.' },
  atencao: { label: 'Precisam de atenção', hint: 'Com erro, recusados pela rede ou esperando uma ação da loja.' },
}

const ATTENTION = new Set(['FALHA', 'REJEITADO', 'ACAO_MANUAL'])
const WORKING = new Set(['NA_FILA', 'ENVIANDO', 'EM_ANALISE', 'ATUALIZACAO_PENDENTE', 'REMOCAO_PENDENTE'])
const DRAFT = new Set(['RASCUNHO', 'PRONTO'])

/**
 * Coluna de um post (anúncio do veículo em vários canais): vale a situação que
 * mais pede ação — um canal com erro leva o post para "Precisam de atenção".
 * null = fora do quadro (pausado/removido: aparece na lista de anúncios).
 */
export function columnOf(statuses: string[]): BoardColumn | null {
  if (!statuses.length) return null
  if (statuses.some((s) => ATTENTION.has(s))) return 'atencao'
  if (statuses.some((s) => WORKING.has(s))) return 'publicando'
  if (statuses.some((s) => s === 'AGENDADO')) return 'agendados'
  if (statuses.some((s) => DRAFT.has(s))) return 'rascunhos'
  if (statuses.some((s) => s === 'PUBLICADO')) return 'publicados'
  return null
}

/** Post avulso: situação única. */
export function columnOfPost(status: string): BoardColumn | null {
  return status === 'RASCUNHO' ? 'rascunhos' : status === 'AGENDADO' ? 'agendados' : status === 'ENVIANDO' ? 'publicando'
    : status === 'PUBLICADO' ? 'publicados' : status === 'FALHA' || status === 'PARCIAL' ? 'atencao' : null
}

/** Taxa de sucesso (publicados ÷ tentativas encerradas), em %; null sem dados. */
export function successRate(published: number, failed: number): number | null {
  const n = published + failed
  return n ? Math.round((published / n) * 100) : null
}
