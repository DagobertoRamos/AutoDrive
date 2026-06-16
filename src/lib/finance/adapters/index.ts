// =============================================================================
// F&I adapters — barrel. Camada de provedores de financiamento (Fase 5).
// Só estrutura: apenas o ManualAdapter opera; demais exigem integração oficial.
// =============================================================================

export * from './types'
export { BaseAdapter } from './base'
export { ManualAdapter } from './manual'
export { CredereAdapter } from './credere'
export { GenericBankAdapter } from './generic-bank'
export { getAdapter, resolveAdapterForProvider } from './registry'
