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
import { runAiWithFailover } from '@/lib/ai/resolve-ai-provider'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export const runtime = 'nodejs'
export const maxDuration = 45

const MAX_BYTES = 8 * 1024 * 1024 // 8MB (limite p/ envio multimodal)
const PER_USER = Number(process.env.AI_RATE_LIMIT_PER_USER ?? 30)

const MIME_BY_EXT: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic' }

// Lê um arquivo do storage local (somente /uploads/, anti path-traversal).
async function readLocalUpload(fileUrl: string): Promise<{ buffer: Buffer; mimeType: string; fileName: string } | null> {
  if (!fileUrl.startsWith('/uploads/') || fileUrl.includes('..')) return null
  const key = fileUrl.replace(/^\/uploads\//, '')
  const full = path.join(process.cwd(), 'public', 'uploads', key)
  try {
    const buffer = await fs.readFile(full)
    const ext = (full.split('.').pop() ?? '').toLowerCase()
    return { buffer, mimeType: MIME_BY_EXT[ext] ?? 'application/pdf', fileName: path.basename(full) }
  } catch { return null }
}

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
    // Entrada: multipart { file } OU JSON { fileUrl } (arquivo já anexado, /uploads/).
    let buffer: Buffer
    let mimeType: string
    let fileName: string
    const contentType = (req.headers.get('content-type') ?? '').toLowerCase()
    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({}))
      const local = typeof body?.fileUrl === 'string' ? await readLocalUpload(body.fileUrl) : null
      if (!local) return NextResponse.json({ success: false, error: 'Arquivo não encontrado.' }, { status: 400 })
      buffer = local.buffer; mimeType = local.mimeType; fileName = local.fileName
    } else {
      const form = await req.formData()
      const file = form.get('file')
      if (!(file instanceof File)) return NextResponse.json({ success: false, error: 'Arquivo ausente.' }, { status: 400 })
      buffer = Buffer.from(await file.arrayBuffer()); mimeType = (file.type || 'application/pdf').toLowerCase(); fileName = file.name
    }
    if (buffer.byteLength > MAX_BYTES) return NextResponse.json({ success: false, error: `Arquivo excede o limite (${Math.round(MAX_BYTES / 1024 / 1024)} MB).` }, { status: 200 })

    if (!(await withinRateLimit(user.id))) {
      return NextResponse.json({ success: false, error: 'Limite de análises por IA atingido. Tente mais tarde.' }, { status: 429 })
    }

    const extraction = await extractDocumentText(buffer, mimeType, { fileName, maxBytes: MAX_BYTES })

    // Estados sem como analisar → mensagem clara, sem chamar a IA.
    if (['protected', 'corrupted', 'too_large', 'unsupported'].includes(extraction.status)) {
      return NextResponse.json({ success: false, status: extraction.status, error: extraction.message }, { status: 200 })
    }

    const input = extraction.status === 'text_extracted'
      ? { text: extraction.text, mimeType }
      : { base64: buffer.toString('base64'), mimeType } // requires_ocr → multimodal (visão)
    // Failover por prioridade entre provedores conectados.
    const fo = await runAiWithFailover('analyze_document', (r) => r.adapter.analyzeDocument(input, r.ctx))
    const used = fo.provider
    const analysis = fo.ok ? fo.result : { summary: `Não foi possível analisar agora (${fo.error}).`, legible: false, needsHumanReview: true }
    const status = fo.ok ? 'OK' : 'ERROR'

    await prisma.aiUsageLog.create({
      data: { tenantId: user.tenantId ?? null, userId: user.id, providerId: used?.providerId ?? null, feature: 'analyze_document', promptSummary: fileName.slice(0, 60), status, errorMessage: fo.ok ? null : fo.error },
    }).catch(() => {})

    return NextResponse.json({
      success: status === 'OK',
      provider: used?.providerName,
      mock: used?.mock ?? false,
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
