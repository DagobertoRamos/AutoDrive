// =============================================================================
// Zod validators — Financiamento (proponentes, bancos, fichas) — AutoDrive
// =============================================================================

import { z } from 'zod'

const digits = (s: string) => s.replace(/\D/g, '')
const reqStr = (label: string, min = 2) => z.string().trim().min(min, `${label} é obrigatório.`)
const optStr = z.string().trim().nullish()

const outraRenda = z.object({
  descricao: z.string().trim().min(1, 'Descreva a renda.'),
  valor: z.number({ invalid_type_error: 'Valor inválido.' }).nonnegative(),
})

// ── Proponente ───────────────────────────────────────────────────────────────
export const createProponentSchema = z.object({
  // Pessoais (obrigatórios; telefoneFixo opcional)
  nomeCompleto: reqStr('Nome completo', 3),
  dataNascimento: z.coerce.date({ invalid_type_error: 'Data de nascimento inválida.' }),
  cpf: z.string().trim().refine((v) => digits(v).length === 11, 'CPF deve ter 11 dígitos.'),
  rg: reqStr('RG', 3),
  nomeMae: reqStr('Nome da mãe', 3),
  nomePai: reqStr('Nome do pai', 3),
  email: z.string().trim().email('E-mail inválido.'),
  celular: z.string().trim().refine((v) => digits(v).length >= 10, 'Celular inválido.'),
  telefoneFixo: optStr,
  // Endereço residencial (número obrigatório; complemento opcional)
  cep: z.string().trim().refine((v) => digits(v).length === 8, 'CEP deve ter 8 dígitos.'),
  logradouro: reqStr('Logradouro'),
  bairro: reqStr('Bairro'),
  cidade: reqStr('Cidade'),
  estado: z.string().trim().length(2, 'UF inválida.'),
  numero: reqStr('Número', 1),
  complemento: optStr,
  // Ocupação / renda
  occupation: z.enum(['AUTONOMO', 'CLT', 'EMPRESARIO', 'APOSENTADO_PENSIONISTA'], { errorMap: () => ({ message: 'Selecione a ocupação.' }) }),
  cargo: optStr,
  renda: z.number({ invalid_type_error: 'Renda inválida.' }).nonnegative().nullish(),
  outrasRendas: z.array(outraRenda).default([]),
  numeroBeneficio: optStr,
  // Empresa (condicional)
  empresaNome: optStr,
  empresaCnpj: optStr,
  empresaTelefone: optStr,
  empresaCep: optStr,
  empresaLogradouro: optStr,
  empresaBairro: optStr,
  empresaCidade: optStr,
  empresaEstado: optStr,
  empresaNumero: optStr,
  empresaComplemento: optStr,
  notes: optStr,
}).superRefine((d, ctx) => {
  const add = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message })
  // Renda obrigatória em todas as ocupações.
  if (d.renda == null || d.renda <= 0) add('renda', 'Informe a renda.')
  if (d.occupation === 'AUTONOMO' && !d.cargo?.trim()) add('cargo', 'Informe o cargo/atividade.')
  if (d.occupation === 'CLT' && !d.empresaNome?.trim()) add('empresaNome', 'Informe a empresa onde trabalha.')
  if (d.occupation === 'EMPRESARIO') {
    if (!d.empresaCnpj || digits(d.empresaCnpj).length !== 14) add('empresaCnpj', 'CNPJ da empresa deve ter 14 dígitos.')
    if (!d.empresaNome?.trim()) add('empresaNome', 'Informe o nome da empresa.')
  }
  if (d.occupation === 'APOSENTADO_PENSIONISTA' && !d.numeroBeneficio?.trim()) add('numeroBeneficio', 'Informe o número do benefício.')
})

export const updateProponentSchema = createProponentSchema

// ── Banco ────────────────────────────────────────────────────────────────────
export const createBankSchema = z.object({
  name: reqStr('Nome do banco'),
  code: optStr,
  active: z.boolean().default(true),
  notes: optStr,
})
export const updateBankSchema = createBankSchema.partial()

// ── Ficha / Proposta ──────────────────────────────────────────────────────────
export const createProposalSchema = z.object({
  proponentId: z.string().cuid('Proponente inválido.'),
  bankId: z.string().cuid().nullish(),
  sellerId: z.string().cuid().nullish(),
  vehicle: optStr,
  amountRequested: z.number().nonnegative().nullish(),
  downPayment: z.number().nonnegative().nullish(),
  installments: z.number().int().positive().nullish(),
  status: z.enum(['SIMULACAO', 'ENVIADA', 'APROVADA', 'RECUSADA', 'CANCELADA']).default('SIMULACAO'),
  notes: optStr,
})
export const updateProposalSchema = createProposalSchema.partial().extend({
  approvedValue: z.number().nonnegative().nullish(),
  monthlyPayment: z.number().nonnegative().nullish(),
  rejectionReason: optStr,
  simulationResult: z.unknown().nullish(),
})

// ── Credencial de banco (F&I) — segredos opcionais (cifrados no servidor) ─────
export const createCredentialSchema = z.object({
  bankId:       z.string().cuid('Banco inválido.'),
  environment:  z.enum(['HOMOLOGACAO', 'PRODUCAO']).default('HOMOLOGACAO'),
  label:        optStr,
  // segredos — todos opcionais; o servidor cifra e nunca devolve em texto puro
  usuario:      optStr,
  senha:        optStr,
  token:        optStr,
  clientId:     optStr,
  clientSecret: optStr,
  storeCode:    optStr,
})
export const updateCredentialSchema = createCredentialSchema.partial()

// ── Prioridades de envio (F&I) — salva a lista inteira (upsert por banco) ──────
export const savePrioritiesSchema = z.object({
  items: z.array(z.object({
    bankId:   z.string().cuid('Banco inválido.'),
    priority: z.number().int().min(0, 'Prioridade inválida.'),
    active:   z.boolean().default(true),
  })).max(200),
})

// ── Retornos por banco (F&I) — % ou valor fixo, por faixa de parcelas ─────────
export const createReturnRuleSchema = z.object({
  bankId:          z.string().cuid('Banco inválido.').nullish(),
  percent:         z.number({ invalid_type_error: 'Percentual inválido.' }).min(0).max(100).nullish(),
  fixedValue:      z.number({ invalid_type_error: 'Valor inválido.' }).nonnegative().nullish(),
  minInstallments: z.number().int().positive().nullish(),
  maxInstallments: z.number().int().positive().nullish(),
  notes:           optStr,
  active:          z.boolean().default(true),
}).superRefine((d, ctx) => {
  if ((d.percent == null || d.percent === 0) && (d.fixedValue == null || d.fixedValue === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['percent'], message: 'Informe o percentual ou o valor fixo.' })
  }
  if (d.minInstallments != null && d.maxInstallments != null && d.minInstallments > d.maxInstallments) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['maxInstallments'], message: 'Parcela máxima deve ser ≥ mínima.' })
  }
})
export const updateReturnRuleSchema = z.object({
  bankId:          z.string().cuid('Banco inválido.').nullish(),
  percent:         z.number().min(0).max(100).nullish(),
  fixedValue:      z.number().nonnegative().nullish(),
  minInstallments: z.number().int().positive().nullish(),
  maxInstallments: z.number().int().positive().nullish(),
  notes:           optStr,
  active:          z.boolean().optional(),
})

// ── Configuração profissional de retorno / ILA / IOF ────────────────────────
const returnValueType = z.enum(['PERCENTUAL', 'FIXO'], { errorMap: () => ({ message: 'Tipo inválido.' }) })
const competenceValueSchema = z.object({
  id:        z.string().optional(),
  name:      optStr,
  month:     z.number().int().min(1).max(12).nullable().optional(),
  year:      z.number().int().min(2000).max(2100).nullable().optional(),
  startsAt:  z.string().trim().nullable().optional(),
  endsAt:    z.string().trim().nullable().optional(),
  value:     z.number({ invalid_type_error: 'Valor inválido.' }).nonnegative('Valor não pode ser negativo.').max(100, 'Percentual não pode passar de 100%.'),
  valueType: returnValueType,
  active:    z.boolean().default(true),
  notes:     optStr,
})

function dateDay(value: string | null | undefined): number | null {
  if (!value) return null
  const d = new Date(`${value.slice(0, 10)}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : Math.floor(d.getTime() / 86_400_000)
}

export const returnSettingsSchema = z.object({
  range: z.object({
    minReturnPercent: z.number({ invalid_type_error: 'Retorno mínimo inválido.' }).min(0.01, 'Retorno mínimo deve ser no mínimo 0,01%.').max(20, 'Retorno mínimo não pode passar de 20%.'),
    maxReturnPercent: z.number({ invalid_type_error: 'Retorno máximo inválido.' }).min(0.01, 'Retorno máximo deve ser maior que zero.').max(20, 'Retorno máximo não pode passar de 20%.'),
    calculationBase:  z.literal('FINANCED_AMOUNT').default('FINANCED_AMOUNT'),
    deductionBase:    z.enum(['GROSS_RETURN', 'FINANCED_AMOUNT']).default('GROSS_RETURN'),
    allowMissingIlaAsZero: z.boolean().default(false),
    allowMissingIofAsZero: z.boolean().default(false),
    active:           z.boolean().default(true),
  }),
  ila: z.array(competenceValueSchema).default([]),
  iof: z.array(competenceValueSchema).default([]),
}).superRefine((d, ctx) => {
  if (d.range.maxReturnPercent <= d.range.minReturnPercent) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['range', 'maxReturnPercent'], message: 'Retorno máximo deve ser maior que o mínimo.' })
  }
  d.ila.forEach((r, index) => {
    if (!r.month || !r.year) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ila', index, 'month'], message: 'ILA precisa de mês e ano de competência.' })
    }
  })
  d.iof.forEach((r, index) => {
    const start = dateDay(r.startsAt)
    const end = dateDay(r.endsAt)
    if (start == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['iof', index, 'startsAt'], message: 'IOF precisa de data inicial de vigência.' })
    }
    if (start != null && end != null && end < start) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['iof', index, 'endsAt'], message: 'Data final do IOF deve ser maior ou igual à inicial.' })
    }
  })
  const activeIof = d.iof
    .map((r, index) => ({ index, start: dateDay(r.startsAt), end: dateDay(r.endsAt), active: r.active !== false }))
    .filter((r): r is { index: number; start: number; end: number | null; active: true } => r.active && r.start != null)
    .sort((a, b) => a.start - b.start)
  for (let i = 1; i < activeIof.length; i += 1) {
    const previous = activeIof[i - 1]
    const current = activeIof[i]
    if (current.start <= (previous.end ?? Number.MAX_SAFE_INTEGER)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['iof', current.index, 'startsAt'], message: 'Existe outra regra de IOF ativa sobreposta para este período.' })
    }
  }
})

// ── Simulação comparativa (F&I) ───────────────────────────────────────────────
export const createSimulationSchema = z.object({
  proponentId:  z.string().cuid().nullish(),
  vehicle:      optStr,
  vehicleValue: z.number({ invalid_type_error: 'Valor do veículo inválido.' }).nonnegative().nullish(),
  downPayment:  z.number({ invalid_type_error: 'Entrada inválida.' }).nonnegative().nullish(),
  installments: z.number().int().positive('Informe o número de parcelas.'),
  notes:        optStr,
  options: z.array(z.object({
    bankId: z.string().cuid('Banco inválido.'),
    rate:   z.number({ invalid_type_error: 'Taxa inválida.' }).nonnegative().max(50).nullish(),
  })).min(1, 'Selecione ao menos um banco.').max(50),
})

// ── Documentos da ficha (F&I — checklist) ─────────────────────────────────────
const DOC_STATUS = ['PENDENTE', 'APROVADO', 'REPROVADO'] as const
export const addDocumentSchema = z.object({
  type:     reqStr('Documento', 1),
  required: z.boolean().default(true),
  status:   z.enum(DOC_STATUS).default('PENDENTE'),
  notes:    optStr,
})
export const seedDocumentsSchema = z.object({ seedRequired: z.literal(true) })
export const updateDocumentSchema = z.object({
  status:   z.enum(DOC_STATUS).optional(),
  required: z.boolean().optional(),
  notes:    optStr,
})

// ── Envio multi-banco + linha do tempo (F&I) ──────────────────────────────────
export const submitProposalSchema = z.object({
  bankIds: z.array(z.string().cuid('Banco inválido.')).min(1, 'Selecione ao menos um banco.').max(50),
  force:   z.boolean().default(false), // override supervisionado da validação de documentos
})
const SUBMISSION_STATUS = ['ENVIADA', 'EM_ANALISE', 'PENDENTE', 'APROVADA', 'RECUSADA', 'CANCELADA'] as const
export const submissionEventSchema = z.object({
  status:  z.enum(SUBMISSION_STATUS, { errorMap: () => ({ message: 'Status inválido.' }) }),
  message: optStr,
})

// ── Integração com a Negociação (F&I — Fase 8) ────────────────────────────────
export const linkedProposalSchema = z.object({
  proponentId:  z.string().cuid('Proponente inválido.'),
  bankId:       z.string().cuid().nullish(),
  installments: z.number().int().positive().nullish(),
})
export const applyProposalSchema = z.object({
  applyProposalId: z.string().cuid('Ficha inválida.'),
})

// ── Produtos agregados do F&I (garantia/seguro/proteção/rastreador) ───────────
export const productKinds = ['SEGURO', 'GARANTIA', 'PROTECAO', 'RASTREADOR', 'OUTRO'] as const
export const createProductSchema = z.object({
  name:         reqStr('Nome do produto'),
  kind:         z.enum(productKinds).default('OUTRO'),
  defaultValue: z.number({ invalid_type_error: 'Valor inválido.' }).nonnegative().nullish(),
  active:       z.boolean().default(true),
})
export const updateProductSchema = createProductSchema.partial()

// ── Master > F&I: provedores / bancos homologados / mapeamento / flags ────────
export const providerKinds = ['CREDERE', 'BANCO_DIRETO', 'INTEGRADOR', 'MANUAL', 'OUTRO'] as const
export const createProviderSchema = z.object({
  name:             reqStr('Nome do provedor'),
  kind:             z.enum(providerKinds).default('MANUAL'),
  active:           z.boolean().default(true),
  baseUrlHomolog:   optStr,
  baseUrlProd:      optStr,
  apiVersion:       optStr,
  supportsSimulate: z.boolean().default(false),
  supportsSubmit:   z.boolean().default(false),
  supportsWebhook:  z.boolean().default(false),
  supportsStatus:   z.boolean().default(false),
  notes:            optStr,
})
export const updateProviderSchema = createProviderSchema.partial()

export const createProviderBankSchema = z.object({
  providerId: z.string().cuid('Provedor inválido.'),
  name:       reqStr('Nome do banco'),
  code:       optStr,
  active:     z.boolean().default(true),
})
export const updateProviderBankSchema = createProviderBankSchema.partial().omit({ providerId: true })

// Mapeamento de/para: { campoAutoDrive: "caminho.na.api" }
export const fieldMappingsSchema = z.object({
  mappings: z.record(z.string().trim().min(1), z.string().trim().max(200)).default({}),
})

export const createFeatureFlagSchema = z.object({
  key:        z.string().trim().regex(/^fi_[a-z0-9_]+$/, 'Use o formato fi_minha_flag (minúsculas, _).'),
  name:       reqStr('Nome'),
  enabled:    z.boolean().default(false),
  rolloutPct: z.number().int().min(0).max(100).default(0),
  notes:      optStr,
})
export const featureFlagSchema = z.object({
  enabled:    z.boolean().optional(),
  rolloutPct: z.number().int().min(0).max(100).optional(),
  notes:      optStr,
})

export type CreateProponentInput = z.infer<typeof createProponentSchema>
