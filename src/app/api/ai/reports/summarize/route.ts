// =============================================================================
// POST /api/ai/reports/summarize — resumo gerencial por IA (Etapa 9).
// Recebe { title, data } — os DADOS QUE O USUÁRIO JÁ VÊ na tela (logo, já
// passaram pelas permissões/tenant das APIs de relatório). A IA só resume/
// destaca tendências, sem inventar nem decidir. Gate `ai`, rate-limit, log.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { aiSummarizeReportSchema } from '@/lib/validators/ai'
import { runAiWithFailover } from '@/lib/ai/resolve-ai-provider'
import { assertModuleEnabled } from '@/lib/tenant-modules'

export const runtime = 'nodejs'
export const maxDuration = 30

const PER_USER = Number(process.env.AI_RATE_LIMIT_PER_USER ?? 30)

async function withinRateLimit(userId: string): Promise<boolean> {
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000)
    const n = await prisma.aiUsageLog.count({ where: { userId, feature: 'summarize_report', createdAt: { gte: since } } })
    return n < PER_USER
  } catch { return true }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'ai')) return forbiddenResponse('Sem acesso ao resumo por IA.')
  { const gate = await assertModuleEnabled(user, 'ai'); if (gate) return gate }

  try {
    const { title, data } = aiSummarizeReportSchema.parse(await req.json())
    if (!(await withinRateLimit(user.id))) {
      return NextResponse.json({ success: false, error: 'Limite de resumos por IA atingido. Tente mais tarde.' }, { status: 429 })
    }

    const payload = JSON.stringify(data ?? {}).slice(0, 14000)
    const prompt = [
      'Você é um analista do AutoDrive. Resuma o relatório gerencial abaixo em português.',
      'REGRAS: baseie-se SOMENTE nos dados fornecidos; NÃO invente números; destaque os principais pontos, tendências e atenções; seja objetivo (bullet points curtos). Não tome decisões nem prometa resultados.',
      `Relatório: ${title}`,
      `Dados (JSON):\n${payload}`,
    ].join('\n\n')

    const fo = await runAiWithFailover('summarize_report', (r) => r.adapter.generateText(prompt, r.ctx))
    const used = fo.provider
    const summary = fo.ok ? (fo.result.text?.trim() || 'Não consegui gerar o resumo agora.') : `Não consegui resumir agora (${fo.error}).`
    const status = fo.ok ? 'OK' : 'ERROR'

    await prisma.aiUsageLog.create({
      data: { tenantId: user.tenantId ?? null, userId: user.id, providerId: used?.providerId ?? null, feature: 'summarize_report', promptSummary: title.slice(0, 60), status, errorMessage: fo.ok ? null : fo.error },
    }).catch(() => {})

    return NextResponse.json({ success: status === 'OK', summary, provider: used?.providerName, mock: used?.mock ?? false })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
