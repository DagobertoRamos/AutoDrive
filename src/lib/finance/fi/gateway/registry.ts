// =============================================================================
// Registro de conectores do gateway + estado de conexão (puro).
// =============================================================================

import type { BankProvider, BankEnvironment } from './types'
import {
  AggregatorAdapter, BVAdapter, BradescoAdapter, C6Adapter, DaycovalAdapter,
  ItauAdapter, PanAdapter, SafraAdapter, SantanderAdapter,
} from './banks'
import { SandboxBankAdapter, isSandboxAllowed } from './sandbox'

const builtins: BankProvider[] = [
  new BVAdapter(), new PanAdapter(), new SantanderAdapter(), new ItauAdapter(), new SafraAdapter(),
  new C6Adapter(), new BradescoAdapter(), new DaycovalAdapter(), new AggregatorAdapter(), new SandboxBankAdapter(),
]
let providers = new Map<string, BankProvider>(builtins.map((p) => [p.key, p]))

export function getBankProvider(key: string | null | undefined): BankProvider | null {
  if (!key) return null
  return providers.get(key) ?? null
}

/** Catálogo para a tela de Bancos (o banco de testes só fora de produção). */
export function listBankProviders(): { key: string; name: string; channel: string }[] {
  return [...providers.values()]
    .filter((p) => p.channel !== 'TESTE' || isSandboxAllowed())
    .map((p) => ({ key: p.key, name: p.name, channel: p.channel }))
}

/** SÓ testes automatizados: substitui um conector. */
export function __setBankProviderForTests(p: BankProvider) { providers.set(p.key, p) }
export function __resetBankProvidersForTests() { providers = new Map(builtins.map((p) => [p.key, p])) }

/** Ambiente das credenciais usado AGORA. Produção nunca usa credencial de homologação. */
export function currentFiEnvironment(env: NodeJS.ProcessEnv = process.env): BankEnvironment {
  if (env.VERCEL_ENV === 'production') return 'PRODUCAO'
  if (env.FI_ENVIRONMENT === 'PRODUCAO' && env.NODE_ENV === 'production') return 'PRODUCAO'
  return 'HOMOLOGACAO'
}

// ── Estado de conexão (o que a loja vê em "Bancos") ──────────────────────────
export type ConnectionState = 'CONECTADO' | 'CONFIGURACAO_NECESSARIA' | 'CREDENCIAL_VENCIDA' | 'CREDENCIAL_INVALIDA' | 'NAO_INTEGRADO' | 'NAO_CONECTADO'
export const CONNECTION_META: Record<ConnectionState, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info'; hint: string }> = {
  CONECTADO:               { label: 'Conectado', tone: 'success', hint: 'As propostas vão direto para o banco e as respostas chegam sozinhas.' },
  CONFIGURACAO_NECESSARIA: { label: 'Configuração necessária', tone: 'warning', hint: 'Falta cadastrar ou completar o acesso da loja a este banco.' },
  CREDENCIAL_VENCIDA:      { label: 'Credencial vencida', tone: 'danger', hint: 'O acesso da loja a este banco venceu. Atualize em Configurações.' },
  CREDENCIAL_INVALIDA:     { label: 'Credencial com problema', tone: 'danger', hint: 'Não foi possível ler o acesso salvo. Cadastre novamente.' },
  NAO_INTEGRADO:           { label: 'Banco ainda não integrado', tone: 'neutral', hint: 'As propostas são enviadas pelo portal do banco e a resposta é registrada aqui.' },
  NAO_CONECTADO:           { label: 'Não conectado', tone: 'neutral', hint: 'Nenhum canal escolhido. As propostas são acompanhadas manualmente.' },
}

export interface ConnectionInput {
  adapterKey: string | null
  provider: BankProvider | null
  hasCredential: boolean
  credentialReadable: boolean
  credentialExpiresAt: Date | null
  integrated: boolean
  now?: Date
}

export function connectionState(i: ConnectionInput): ConnectionState {
  if (!i.adapterKey || !i.provider) return 'NAO_CONECTADO'
  if (i.provider.channel === 'TESTE') return isSandboxAllowed() ? 'CONECTADO' : 'NAO_INTEGRADO'
  // Sem implementação oficial, credencial não resolve: continua manual.
  if (!i.provider.official) return 'NAO_INTEGRADO'
  if (!i.hasCredential) return 'CONFIGURACAO_NECESSARIA'
  if (!i.credentialReadable) return 'CREDENCIAL_INVALIDA'
  if (i.credentialExpiresAt && i.credentialExpiresAt.getTime() <= (i.now ?? new Date()).getTime()) return 'CREDENCIAL_VENCIDA'
  if (!i.integrated) return 'CONFIGURACAO_NECESSARIA'
  return 'CONECTADO'
}
