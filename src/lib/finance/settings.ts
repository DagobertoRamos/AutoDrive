// =============================================================================
// Configurações genéricas do F&I por loja (FinanceTenantSetting, chave/JSON).
// Hoje: 'required_documents' (docs obrigatórios por perfil) e 'permissions'
// (quem envia ficha / aprova / altera retorno). Cada chave tem default +
// validação Zod própria. Tenant-scoped — uso só no servidor.
// =============================================================================

import { z } from 'zod'

// Perfis de proponente (= ocupação) + uma lista comum a todos.
export const DOC_PROFILES = ['TODOS', 'AUTONOMO', 'CLT', 'EMPRESARIO', 'APOSENTADO_PENSIONISTA'] as const
// Papéis operacionais que podem receber atribuições no F&I (MASTER é da plataforma).
export const FI_ROLES = ['ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE', 'VENDEDOR_LIDER', 'VENDEDOR', 'FINANCEIRO'] as const

const docList = z.array(z.string().trim().min(1).max(120)).max(50)

export const requiredDocumentsSchema = z.object({
  TODOS:                   docList.default([]),
  AUTONOMO:                docList.default([]),
  CLT:                     docList.default([]),
  EMPRESARIO:              docList.default([]),
  APOSENTADO_PENSIONISTA:  docList.default([]),
})

const roleList = z.array(z.enum(FI_ROLES)).max(FI_ROLES.length)

export const permissionsSchema = z.object({
  enviarFicha:    roleList.default([]),
  aprovar:        roleList.default([]),
  alterarRetorno: roleList.default([]),
})

export const FI_SETTING_KEYS = {
  required_documents: { schema: requiredDocumentsSchema, default: { TODOS: [], AUTONOMO: [], CLT: [], EMPRESARIO: [], APOSENTADO_PENSIONISTA: [] } },
  permissions:        { schema: permissionsSchema,       default: { enviarFicha: [], aprovar: [], alterarRetorno: [] } },
} as const

export type FiSettingKey = keyof typeof FI_SETTING_KEYS
export const isFiSettingKey = (k: string): k is FiSettingKey => Object.prototype.hasOwnProperty.call(FI_SETTING_KEYS, k)
