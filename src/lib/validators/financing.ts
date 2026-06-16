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

export type CreateProponentInput = z.infer<typeof createProponentSchema>
