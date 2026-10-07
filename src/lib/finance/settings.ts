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
  _v:             z.literal(2).optional(), // 2 = lista salva é exatamente quem pode
  enviarFicha:    roleList.default([]),
  aprovar:        roleList.default([]),
  alterarRetorno: roleList.default([]),
  // F&I Core — capacidades finas (sem valor = padrão seguro de fi-permissions)
  criarFicha:        roleList.optional(),
  editarFicha:       roleList.optional(),
  verResultado:      roleList.optional(),
  verRetorno:        roleList.optional(),
  verComissao:       roleList.optional(),
  acessarDocumentos: roleList.optional(),
  formalizar:        roleList.optional(),
  cancelarProposta:  roleList.optional(),
  verLogsTecnicos:   roleList.optional(),
  configurarBancos:  roleList.optional(),
})

// F&I Core — campos extras por banco (bankId → chaves da ficha universal),
// configurados pela loja enquanto o banco não tiver integração oficial.
export const bankRequiredFieldsSchema = z.record(z.string().min(1).max(60), z.array(z.string().min(1).max(60)).max(60)).refine((o) => Object.keys(o).length <= 100, 'Bancos demais.')

// F&I Core — LGPD: base legal, versão do aviso de privacidade e retenção de documentos.
export const LEGAL_BASES = ['PROCEDIMENTOS_PRELIMINARES_CONTRATO', 'CONSENTIMENTO', 'PROTECAO_CREDITO', 'LEGITIMO_INTERESSE'] as const
export const lgpdSchema = z.object({
  legalBasis:            z.enum(LEGAL_BASES).default('PROCEDIMENTOS_PRELIMINARES_CONTRATO'),
  privacyVersion:        z.string().trim().min(1).max(30).default('1'),
  privacyUrl:            z.string().trim().url().max(300).optional().or(z.literal('')),
  documentRetentionDays: z.number().int().min(30).max(3650).default(180),
})

// F&I Core — simulação do site (estimativa com taxa de referência da loja; nunca é aprovação).
export const siteSimulationSchema = z.object({
  enabled:          z.boolean().default(false),
  referenceRate:    z.number().min(0.1).max(10).nullable().default(null), // % ao mês
  installmentsList: z.array(z.number().int().min(6).max(84)).max(10).default([24, 36, 48, 60]),
  minDownPaymentPct: z.number().min(0).max(90).default(0),
})

export const FI_SETTING_KEYS = {
  required_documents:   { schema: requiredDocumentsSchema, default: { TODOS: [], AUTONOMO: [], CLT: [], EMPRESARIO: [], APOSENTADO_PENSIONISTA: [] } },
  permissions:          { schema: permissionsSchema,       default: { enviarFicha: [], aprovar: [], alterarRetorno: [] } },
  bank_required_fields: { schema: bankRequiredFieldsSchema, default: {} },
  lgpd:                 { schema: lgpdSchema,              default: { legalBasis: 'PROCEDIMENTOS_PRELIMINARES_CONTRATO', privacyVersion: '1', documentRetentionDays: 180 } },
  site_simulation:      { schema: siteSimulationSchema,    default: { enabled: false, referenceRate: null, installmentsList: [24, 36, 48, 60], minDownPaymentPct: 0 } },
} as const

export type FiSettingKey = keyof typeof FI_SETTING_KEYS
export const isFiSettingKey = (k: string): k is FiSettingKey => Object.prototype.hasOwnProperty.call(FI_SETTING_KEYS, k)
