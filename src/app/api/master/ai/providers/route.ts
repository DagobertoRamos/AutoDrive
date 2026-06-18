// =============================================================================
// /api/master/ai/providers — provedores de IA (GLOBAL, Master). MASTER-only.
//   GET  : lista MASCARADA (nunca retorna segredo) + cryptoReady
//   POST : cria provedor; cifra apiKey/clientSecret (AI_ENCRYPTION_KEY)
// Segredos NUNCA vão ao front nem a log. Auditado.
// =============================================================================

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { zodErrorResponse } from '@/lib/finance/finance-service'
import { createAiProviderSchema } from '@/lib/validators/ai'
import { encryptSecrets, maskSecret, isAiCryptoConfigured } from '@/lib/ai/crypto'

function buildHints(d: Record<string, string | null | undefined>) {
  const h: Record<string, string> = {}
  if (d.apiKey) h.apiKey = maskSecret(d.apiKey)
  if (d.clientSecret) h.clientSecret = maskSecret(d.clientSecret)
  return h
}

export async function GET() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'master.ai')) return forbiddenResponse('Área exclusiva do MASTER.')
  try {
    const rows = await prisma.aiProvider.findMany({
      orderBy: [{ active: 'desc' }, { priority: 'asc' }, { name: 'asc' }],
      select: {
        id: true, name: true, code: true, kind: true, priority: true, model: true, authType: true, baseUrl: true, active: true,
        environment: true, maxTokensPerRequest: true, dailyLimit: true, monthlyLimit: true, timeoutMs: true,
        allowPdf: true, allowImage: true, allowReports: true, allowHelpChat: true, allowDocAnalysis: true,
        maskedHints: true, notes: true, updatedAt: true,
      },
    })
    return NextResponse.json({ success: true, cryptoReady: isAiCryptoConfigured(), data: rows })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'master.ai')) return forbiddenResponse('Área exclusiva do MASTER.')
  if (!isAiCryptoConfigured()) return NextResponse.json({ success: false, error: 'Criptografia não configurada (AI_ENCRYPTION_KEY).' }, { status: 503 })
  try {
    const d = createAiProviderSchema.parse(await req.json())
    const exists = await prisma.aiProvider.findUnique({ where: { code: d.code }, select: { id: true } })
    if (exists) return NextResponse.json({ success: false, error: 'Já existe um provedor com esse código.' }, { status: 409 })
    const secrets = { apiKey: d.apiKey ?? '', clientSecret: d.clientSecret ?? '' }
    const p = await prisma.aiProvider.create({
      data: {
        name: d.name, code: d.code, kind: d.kind, priority: d.priority, model: d.model ?? null, authType: d.authType ?? null,
        baseUrl: d.baseUrl ?? null, active: d.active, environment: d.environment,
        maxTokensPerRequest: d.maxTokensPerRequest ?? null, dailyLimit: d.dailyLimit ?? null,
        monthlyLimit: d.monthlyLimit ?? null, timeoutMs: d.timeoutMs ?? null,
        allowPdf: d.allowPdf, allowImage: d.allowImage, allowReports: d.allowReports,
        allowHelpChat: d.allowHelpChat, allowDocAnalysis: d.allowDocAnalysis, notes: d.notes ?? null,
        secretsEncrypted: encryptSecrets(secrets), maskedHints: buildHints(secrets) as never,
        createdById: user.id, updatedById: user.id,
      },
    })
    await createSafeAuditLog({ userId: user.id, action: 'CREATE', entity: 'AiProvider', entityId: p.id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: true, data: { id: p.id } }, { status: 201 })
  } catch (err) {
    if (err instanceof ZodError) return zodErrorResponse(err)
    return handlePrismaError(err)
  }
}
