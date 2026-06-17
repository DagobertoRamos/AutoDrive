// =============================================================================
// /api/master/ai/providers/[id]/test — testar conexão do provedor de IA.
// Decifra a chave em runtime, resolve o adapter e chama testConnection().
// Registra AiUsageLog (sem segredo) + auditoria. MASTER-only.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { handlePrismaError } from '@/lib/prisma-errors'
import { decryptSecrets, isAiCryptoConfigured } from '@/lib/ai/crypto'
import { getAiAdapter } from '@/lib/ai/adapters'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: Request, { params }: Ctx) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'master.ai')) return forbiddenResponse('Área exclusiva do MASTER.')
  const { id } = await params
  try {
    const p = await prisma.aiProvider.findUnique({ where: { id } })
    if (!p) return NextResponse.json({ success: false, error: 'Provedor não encontrado.' }, { status: 404 })

    const secrets = isAiCryptoConfigured() ? decryptSecrets(p.secretsEncrypted) : {}
    // BYOK do servidor: provedor GEMINI sem chave salva usa process.env (backend-only).
    const apiKey = secrets.apiKey || (p.kind === 'GEMINI' ? process.env.GEMINI_API_KEY : undefined)
    const adapter = getAiAdapter(p.kind)
    const ctx = {
      providerId: p.id, model: p.model, baseUrl: p.baseUrl, apiKey,
      environment: p.environment, timeoutMs: p.timeoutMs ?? undefined, maxTokens: p.maxTokensPerRequest,
    }
    const result = await adapter.testConnection(ctx)

    await prisma.aiUsageLog.create({
      data: { providerId: p.id, userId: user.id, feature: 'test_connection', status: result.ok ? 'OK' : 'ERROR', errorMessage: result.ok ? null : result.message.slice(0, 200) },
    }).catch(() => {})
    await createSafeAuditLog({ userId: user.id, action: 'TEST_CONNECTION', entity: 'AiProvider', entityId: id, userName: user.name, userRole: user.role })
    return NextResponse.json({ success: result.ok, message: result.message })
  } catch (err) {
    return handlePrismaError(err)
  }
}
