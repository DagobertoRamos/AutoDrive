// =============================================================================
// Zod validators — Módulo de IA (Master). Provedores, instruções, conhecimento.
// =============================================================================

import { z } from 'zod'

const optStr = z.string().trim().nullish()
const reqStr = (label: string, min = 1) => z.string().trim().min(min, `${label} é obrigatório.`)

export const aiProviderKinds = ['GEMINI', 'OPENAI', 'ANTHROPIC', 'CUSTOM'] as const
export const aiEnvironments = ['SANDBOX', 'PRODUCAO'] as const

export const createAiProviderSchema = z.object({
  name:                reqStr('Nome'),
  code:                z.string().trim().regex(/^[a-z0-9][a-z0-9_-]{1,40}$/, 'Código: minúsculas, números, - ou _ (2-41).'),
  kind:                z.enum(aiProviderKinds).default('CUSTOM'),
  priority:            z.number().int().min(1).max(999).default(100), // 1 = tentado primeiro
  model:               optStr,
  authType:            optStr,
  baseUrl:             optStr,
  active:              z.boolean().default(false),
  environment:         z.enum(aiEnvironments).default('SANDBOX'),
  maxTokensPerRequest: z.number().int().positive().nullish(),
  dailyLimit:          z.number().int().nonnegative().nullish(),
  monthlyLimit:        z.number().int().nonnegative().nullish(),
  timeoutMs:           z.number().int().positive().max(120000).nullish(),
  allowPdf:            z.boolean().default(false),
  allowImage:          z.boolean().default(false),
  allowReports:        z.boolean().default(false),
  allowHelpChat:       z.boolean().default(false),
  allowDocAnalysis:    z.boolean().default(false),
  notes:               optStr,
  // segredos — opcionais; cifrados no servidor, nunca devolvidos em texto puro
  apiKey:              optStr,
  clientSecret:        optStr,
})
export const updateAiProviderSchema = createAiProviderSchema.partial().omit({ code: true })

const INSTRUCTION_SCOPES = ['global', 'ajuda', 'relatorios', 'documentos', 'f&i', 'estoque', 'vendas', 'financeiro', 'pos-venda', 'marketing'] as const
export const createAiInstructionSchema = z.object({
  title:    reqStr('Título', 2),
  area:     optStr,
  scope:    z.enum(INSTRUCTION_SCOPES).default('global'),
  content:  reqStr('Conteúdo', 2),
  status:   z.enum(['ATIVO', 'INATIVO']).default('ATIVO'),
  priority: z.number().int().min(0).max(100).default(0),
})
export const updateAiInstructionSchema = createAiInstructionSchema.partial()

const KNOWLEDGE_SOURCES = ['manual_text', 'pdf', 'docx', 'image', 'url', 'system_doc'] as const
export const createAiKnowledgeSchema = z.object({
  scope:       z.enum(['global', 'tenant']).default('global'),
  title:       reqStr('Título', 2),
  description: optStr,
  content:     optStr,
  sourceType:  z.enum(KNOWLEDGE_SOURCES).default('manual_text'),
  status:      z.enum(['ATIVO', 'INATIVO']).default('ATIVO'),
})
export const updateAiKnowledgeSchema = createAiKnowledgeSchema.partial()

// Resumo de relatório (loja). title + dados que o usuário JÁ vê na tela.
export const aiSummarizeReportSchema = z.object({
  title: z.string().trim().min(1).max(160),
  data:  z.unknown(),
})

// Chat de ajuda (loja). Mensagem do usuário + histórico curto opcional.
export const aiHelpChatSchema = z.object({
  message: z.string().trim().min(1, 'Digite sua pergunta.').max(2000, 'Mensagem muito longa.'),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().max(4000),
  })).max(12).optional(),
})
