// =============================================================================
// POST /api/ai/documents/analyze — analisa um documento com IA (Etapa 10).
// Multipart { file }. Pipeline: extrai texto (extractDocumentText); se houver
// texto → analisa o texto; se for imagem/PDF escaneado → análise multimodal
// (Gemini visão). Devolve resumo/tipo/legível/needsHumanReview. IA controlada:
// só resume/identifica, nunca valida juridicamente nem decide. Gate `ai`,
// rate-limit, AiUsageLog sem conteúdo sensível. Chave só no backend.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { extractDocumentText } from '@/lib/documents/extract-text'
import { resolveAiProvider } from '@/lib/ai/resolve-ai-provider'

export const runtime = 'nodejs'
export const maxDuration = 45

const MAX_BYTES = 8 * 1024 * 1024 // 8MB (limite p/ envio multimodal)
const PER_USER = Number(process.env.AI_RATE_LIMIT_PER_USER ?? 30)

async function withinRateLimit(userId: string): Promise<boolean> {
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000)
    const n = await prisma.aiUsageLog.count({ where: { userId, feature: 'analyze_document', createdAt: { gte: since } } })
    return n < PER_USER
  } catch { return true }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'ai')) return forbiddenResponse('Sem acesso à análise por IA.')

  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ success: false, error: 'Arquivo ausente.' }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ success: false, error: `Arquivo excede o limite (${Math.round(MAX_BYTES / 1024 / 1024)} MB).` }, { status: 200 })

    if (!(await withinRateLimit(user.id))) {
      return NextResponse.json({ success: false, error: 'Limite de análises por IA atingido. Tente mais tarde.' }, { status: 429 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const mimeType = (file.type || 'application/pdf').toLowerCase()
    const extraction = await extractDocumentText(buffer, mimeType, { fileName: file.name, maxBytes: MAX_BYTES })

    // Estados sem como analisar → mensagem clara, sem chamar a IA.
    if (['protected', 'corrupted', 'too_large', 'unsupported'].includes(extraction.status)) {
      return NextResponse.json({ success: false, status: extraction.status, error: extraction.message }, { status: 200 })
    }

    const { adapter, ctx, providerId, providerName, mock } = await resolveAiProvider('analyze_document')

    let analysis
    let status = 'OK'
    let errorMessage: string | null = null
    try {
      if (extraction.status === 'text_extracted') {
        analysis = await adapter.analyzeDocument({ text: extraction.text, mimeType }, ctx)
      } else {
        // requires_ocr (imagem / PDF escaneado) → multimodal (visão).
        analysis = await adapter.analyzeDocument({ base64: buffer.toString('base64'), mimeType }, ctx)
      }
    } catch (e) {
      status = 'ERROR'
      errorMessage = e instanceof Error ? e.message : 'Falha na IA.'
      analysis = { summary: `Não foi possível analisar agora (${errorMessage}).`, legible: false, needsHumanReview: true }
    }

    await prisma.aiUsageLog.create({
      data: { tenantId: user.tenantId ?? null, userId: user.id, providerId, feature: 'analyze_document', promptSummary: file.name.slice(0, 60), status, errorMessage },
    }).catch(() => {})

    return NextResponse.json({
      success: status === 'OK',
      provider: providerName,
      mock,
      extractionStatus: extraction.status,
      data: {
        summary: analysis.summary,
        documentType: analysis.documentType ?? null,
        legible: analysis.legible,
        needsHumanReview: analysis.needsHumanReview ?? false,
        note: analysis.note ?? null,
      },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
