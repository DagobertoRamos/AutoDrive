// =============================================================================
// POST /api/ai/help-chat — chat de ajuda da loja (IA controlada).
// Responde dúvidas operacionais do AutoDrive com base em: instruções globais +
// base de conhecimento + permissões/tenant do usuário. NÃO executa ações, não
// inventa, diz "não sei" quando faltar dado, nunca expõe dados de outro tenant.
// Rate-limit por usuário/tenant; AiUsageLog sem dados sensíveis. Chave só backend.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { aiHelpChatSchema } from '@/lib/validators/ai'
import { runAiWithFailover } from '@/lib/ai/resolve-ai-provider'

export const runtime = 'nodejs'
export const maxDuration = 30

const PER_USER = Number(process.env.AI_RATE_LIMIT_PER_USER ?? 30)
const PER_TENANT = Number(process.env.AI_RATE_LIMIT_PER_TENANT ?? 300)

const BASE_SYSTEM = `Você é o assistente de ajuda do AutoDrive (SaaS para lojas de veículos).
REGRAS (obrigatórias):
- Responda em português, de forma objetiva, profissional e segura.
- Ajude SOMENTE com o uso do sistema (como fazer X, o que significa Y, onde encontrar Z).
- NÃO invente. Se não souber ou faltar informação, diga claramente que não sabe e oriente procurar o suporte/gestor.
- NUNCA diga que executou uma ação no sistema — você apenas orienta; quem executa é o usuário.
- NÃO aprove financiamento, não prometa crédito, não tome decisões financeiras/jurídicas.
- NÃO exponha dados de outro tenant, credenciais, tokens, senhas ou dados sigilosos.
- Respeite as permissões do usuário; oriente dentro das funcionalidades do AutoDrive.`

async function withinRateLimit(userId: string, tenantId: string | null): Promise<boolean> {
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000) // última hora
    const [u, t] = await Promise.all([
      prisma.aiUsageLog.count({ where: { userId, feature: 'help_chat', createdAt: { gte: since } } }),
      tenantId ? prisma.aiUsageLog.count({ where: { tenantId, feature: 'help_chat', createdAt: { gte: since } } }) : Promise.resolve(0),
    ])
    return u < PER_USER && t < PER_TENANT
  } catch {
    return true // tabela ausente → não bloqueia (fail-open)
  }
}

// Busca trechos relevantes da base de conhecimento (RAG-lite: LIKE por palavras
// da pergunta, sem embeddings). Tenant nunca vê conhecimento de outro tenant.
async function searchKnowledge(message: string, tenantId: string | null): Promise<string[]> {
  const words = [...new Set(message.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length >= 4))].slice(0, 8)
  if (!words.length) return []
  try {
    const chunks = await prisma.aiKnowledgeChunk.findMany({
      where: {
        OR: [{ tenantId: null }, ...(tenantId ? [{ tenantId }] : [])],
        AND: { OR: words.map((w) => ({ chunkText: { contains: w, mode: 'insensitive' as const } })) },
      },
      take: 5,
      select: { chunkText: true },
    })
    return chunks.map((c) => c.chunkText.slice(0, 800))
  } catch {
    return []
  }
}

async function buildContext(message: string, tenantId: string | null): Promise<string> {
  try {
    const [instructions, kb, chunks] = await Promise.all([
      prisma.aiInstruction.findMany({ where: { tenantId: null, status: 'ATIVO', scope: { in: ['global', 'ajuda'] } }, orderBy: { priority: 'desc' }, take: 30, select: { content: true } }),
      prisma.aiKnowledgeBase.findMany({ where: { tenantId: null, status: 'ATIVO' }, orderBy: { updatedAt: 'desc' }, take: 12, select: { title: true, description: true } }),
      searchKnowledge(message, tenantId),
    ])
    const parts: string[] = []
    if (instructions.length) parts.push('INSTRUÇÕES DA PLATAFORMA:\n' + instructions.map((i) => `- ${i.content}`).join('\n'))
    if (chunks.length) parts.push('TRECHOS RELEVANTES DA BASE DE CONHECIMENTO (use se ajudar; cite que veio da base):\n' + chunks.map((c) => `"""${c}"""`).join('\n'))
    if (kb.length) parts.push('OUTROS TÓPICOS DISPONÍVEIS:\n' + kb.map((k) => `- ${k.title}${k.description ? `: ${k.description}` : ''}`).join('\n'))
    return parts.join('\n\n')
  } catch {
    return ''
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'ai')) return forbiddenResponse('Sem acesso ao assistente de IA.')

  try {
    const { message, history } = aiHelpChatSchema.parse(await req.json())

    if (!(await withinRateLimit(user.id, user.tenantId ?? null))) {
      return NextResponse.json({ success: false, error: 'Limite de uso do assistente atingido. Tente novamente mais tarde.' }, { status: 429 })
    }

    const extra = await buildContext(message, user.tenantId ?? null)
    const hist = (history ?? []).map((h) => `${h.role === 'user' ? 'Usuário' : 'Assistente'}: ${h.content}`).join('\n')
    const prompt = [
      BASE_SYSTEM,
      extra,
      hist ? `Conversa até aqui:\n${hist}` : '',
      `Pergunta do usuário (papel: ${user.role}): ${message}`,
      'Responda de forma direta. Se não tiver base para responder com segurança, diga que não sabe.',
    ].filter(Boolean).join('\n\n')

    // Failover por prioridade: tenta provedor 1, 2, 3… até responder.
    const fo = await runAiWithFailover('help_chat', (r) => r.adapter.generateText(prompt, r.ctx))
    const used = fo.provider
    const answer = fo.ok
      ? (fo.result.text?.trim() || 'Não consegui gerar uma resposta agora. Tente reformular a pergunta.')
      : `Não consegui responder agora (${fo.error}). Tente novamente em instantes ou contate o suporte.`
    const status = fo.ok ? 'OK' : 'ERROR'

    // Log sem dados sensíveis (resumo curto da pergunta, sem conteúdo completo).
    await prisma.aiUsageLog.create({
      data: { tenantId: user.tenantId ?? null, userId: user.id, providerId: used?.providerId ?? null, feature: 'help_chat', promptSummary: message.slice(0, 60), tokenInput: fo.ok ? fo.result.tokenInput : undefined, tokenOutput: fo.ok ? fo.result.tokenOutput : undefined, status, errorMessage: fo.ok ? null : fo.error },
    }).catch(() => {})

    return NextResponse.json({ success: status === 'OK', answer, provider: used?.providerName, mock: used?.mock ?? false })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
