// =============================================================================
// ai/scopes.ts — escopos e níveis de autonomia da IA controlada do AutoDrive.
// A IA é CONTROLADA: por padrão apenas lê, explica, resume e sugere. Nunca
// altera dados, aprova, envia ou executa ação operacional sem confirmação
// explícita do usuário autorizado. Ações sensíveis NÃO são permitidas nesta fase.
// =============================================================================

export const AI_SCOPES = [
  'ai.helpChat',
  'ai.readDocuments',
  'ai.summarizeDocuments',
  'ai.generateReports',
  'ai.explainSystem',
  'ai.suggestActions',
  'ai.createDrafts',
  'ai.viewFinancialData',
  'ai.viewCustomerData',
  'ai.viewNegotiationData',
  'ai.executeActions', // reservado — NÃO habilitado nesta fase
] as const
export type AiScope = (typeof AI_SCOPES)[number]

// Escopos liberados NESTA fase (somente leitura / sugestão / rascunho).
export const AI_ENABLED_SCOPES: AiScope[] = [
  'ai.helpChat',
  'ai.readDocuments',
  'ai.summarizeDocuments',
  'ai.generateReports',
  'ai.explainSystem',
  'ai.suggestActions',
  'ai.createDrafts',
]

export const AI_AUTONOMY = {
  READ_ONLY: 1,           // somente leitura
  SUGGEST: 2,             // sugestão
  DRAFT: 3,               // rascunho
  ACTION_WITH_CONFIRM: 4, // ação com confirmação explícita
  AUTOMATED: 5,           // ação automatizada (rotinas futuras permitidas)
} as const
export type AiAutonomyLevel = (typeof AI_AUTONOMY)[keyof typeof AI_AUTONOMY]

/** Nível máximo permitido NESTA fase (sem ação automatizada sensível). */
export const AI_MAX_AUTONOMY_THIS_PHASE: AiAutonomyLevel = AI_AUTONOMY.DRAFT

export function isScopeEnabled(scope: AiScope): boolean {
  return AI_ENABLED_SCOPES.includes(scope)
}

/** Ações que a IA NUNCA pode fazer sem confirmação explícita (guard-rail). */
export const AI_FORBIDDEN_WITHOUT_CONFIRM = [
  'alterar dados', 'excluir registros', 'aprovar proposta/financiamento',
  'mudar status', 'enviar ficha', 'enviar mensagem/e-mail/WhatsApp',
  'prometer crédito', 'liberar pagamento/entrega', 'decisão externa',
] as const
