// =============================================================================
// finance/fi-permissions-core.ts — decisão PURA das Permissões F&I (sem Prisma),
// usada no servidor (fi-permissions.ts) e na tela de Permissões.
//
// Compatibilidade: configs antigas (sem `_v: 2`) tratam lista vazia das 3
// capacidades originais como "sem restrição". Capacidades novas sem
// configuração usam o padrão seguro (retorno, comissão e logs técnicos NÃO
// ficam abertos ao vendedor). Com `_v: 2`, a lista salva é exatamente quem pode.
// =============================================================================

import { FI_ROLES } from './settings'

export type FiCapability =
  | 'criarFicha' | 'editarFicha' | 'enviarFicha' | 'aprovar' | 'verResultado'
  | 'verRetorno' | 'verComissao' | 'alterarRetorno' | 'acessarDocumentos'
  | 'formalizar' | 'cancelarProposta' | 'verLogsTecnicos' | 'configurarBancos'

const ALL = [...FI_ROLES] as string[]
const MANAGERS = ['ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'FINANCEIRO']

export const FI_CAPABILITIES: { key: FiCapability; label: string; hint: string; defaults: string[] | null }[] = [
  { key: 'criarFicha', label: 'Criar ficha', hint: 'Abrir uma nova ficha de financiamento.', defaults: ALL },
  { key: 'editarFicha', label: 'Editar ficha', hint: 'Alterar dados do cliente e da operação.', defaults: ALL },
  { key: 'enviarFicha', label: 'Enviar ao banco', hint: 'Enviar a ficha aos bancos e ajustar a proposta.', defaults: null },
  { key: 'aprovar', label: 'Registrar resposta do banco', hint: 'Registrar aprovação, recusa ou pendência informada pelo banco.', defaults: null },
  { key: 'verResultado', label: 'Ver resultado', hint: 'Ver a resposta dos bancos (parcela, taxa, CET).', defaults: ALL },
  { key: 'verRetorno', label: 'Ver retorno', hint: 'Ver o retorno previsto para a loja em cada proposta.', defaults: MANAGERS },
  { key: 'verComissao', label: 'Ver comissão', hint: 'Ver valores de comissão ligados ao financiamento.', defaults: MANAGERS },
  { key: 'alterarRetorno', label: 'Alterar retorno', hint: 'Mudar as regras e percentuais de retorno.', defaults: null },
  { key: 'acessarDocumentos', label: 'Acessar documentos', hint: 'Ver e baixar documentos pessoais do cliente.', defaults: ALL },
  { key: 'formalizar', label: 'Formalizar', hint: 'Conduzir contrato, assinatura, gravame e pagamento do banco.', defaults: MANAGERS },
  { key: 'cancelarProposta', label: 'Cancelar proposta', hint: 'Cancelar a ficha e as propostas abertas.', defaults: MANAGERS },
  { key: 'verLogsTecnicos', label: 'Ver logs técnicos', hint: 'Ver registros técnicos das integrações (sem dados pessoais).', defaults: ['ADM', 'GERENTE_GERAL'] },
  { key: 'configurarBancos', label: 'Configurar bancos', hint: 'Conectar bancos e cadastrar credenciais da loja.', defaults: ['ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'FINANCEIRO'] },
]
const LEGACY = new Set<FiCapability>(['enviarFicha', 'aprovar', 'alterarRetorno'])
const DEF = Object.fromEntries(FI_CAPABILITIES.map((c) => [c.key, c])) as Record<FiCapability, (typeof FI_CAPABILITIES)[number]>

/** Decisão pura: o papel pode a capacidade dada a lista configurada? (regra legada) */
export function roleAllowedByList(list: string[] | null | undefined, role: string): boolean {
  if (role === 'MASTER') return true
  if (!list || list.length === 0) return true
  return list.includes(role)
}

/** Decisão pura completa (versão da config + padrão por capacidade). */
export function decideFi(config: Record<string, unknown> | null | undefined, capability: FiCapability, role: string): boolean {
  if (role === 'MASTER') return true
  const cfg = config ?? {}
  const v2 = cfg._v === 2
  const raw = cfg[capability]
  const list = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : undefined
  if (v2 && list) return list.includes(role)
  if (LEGACY.has(capability)) return roleAllowedByList(list, role)
  if (list && list.length) return list.includes(role)
  const d = DEF[capability].defaults
  return d === null ? true : d.includes(role)
}

/** Matriz efetiva por papel (tela de Permissões). */
export function effectiveMatrix(config: Record<string, unknown> | null | undefined): Record<FiCapability, string[]> {
  return Object.fromEntries(FI_CAPABILITIES.map((c) => [c.key, FI_ROLES.filter((r) => decideFi(config, c.key, r))])) as Record<FiCapability, string[]>
}
