// =============================================================================
// /api/master/ai/test-gemini — testa a conexão com o Gemini usando a chave do
// SERVIDOR (process.env.GEMINI_API_KEY). MASTER-only. A chave é lida apenas no
// backend, NUNCA enviada ao front nem registrada em log. Retorna só ok/mensagem.
// =============================================================================

import { NextResponse } from 'next/server'
import { getSessionUser, unauthorizedResponse, forbiddenResponse, createSafeAuditLog } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { prisma } from '@/lib/prisma'
import { GeminiAdapter } from '@/lib/ai/adapters'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST() {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!canAccessModule(user.role, 'master.ai')) return forbiddenResponse('Área exclusiva do MASTER.')

  // Chave lida SOMENTE no servidor. Nunca vai ao front nem a log.
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey || !apiKey.trim()) {
    return NextResponse.json({ success: false, configured: false, message: 'GEMINI_API_KEY não está configurada no servidor.' }, { status: 200 })
  }

  try {
    const adapter = new GeminiAdapter()
    const result = await adapter.testConnection({
      apiKey,
      model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
      environment: 'PRODUCAO',
      timeoutMs: Number(process.env.AI_TIMEOUT_MS ?? 30000),
    })

    // Log de uso SEM a chave / SEM dados sensíveis.
    await prisma.aiUsageLog.create({
      data: { userId: user.id, feature: 'test_gemini', status: result.ok ? 'OK' : 'ERROR', errorMessage: result.ok ? null : result.message.slice(0, 200) },
    }).catch(() => {})
    await createSafeAuditLog({ userId: user.id, action: 'TEST_GEMINI', entity: 'AiProvider', userName: user.name, userRole: user.role })

    return NextResponse.json({ success: result.ok, configured: true, message: result.message })
  } catch {
    // Mensagem genérica — nunca expõe a chave.
    return NextResponse.json({ success: false, configured: true, message: 'Falha ao testar a conexão com o Gemini.' }, { status: 200 })
  }
}
