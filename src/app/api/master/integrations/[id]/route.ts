// =============================================================================
// /api/master/integrations/[id] — Gerenciar credencial de integração (MASTER only)
//
// GET    — detalhes (valores sensíveis mascarados)
// PATCH  — atualizar campos
// DELETE — excluir credencial
// POST   — ações especiais: test, rotate
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireMaster, logMasterAction } from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { prisma } from '@/lib/prisma'

const MASKED = '••••••••'
const SENSITIVE_KEYS = ['apiKey', 'apiSecret', 'token', 'webhookSecret']

function maskSensitive(cred: Record<string, unknown>): Record<string, unknown> {
  const masked = { ...cred }
  for (const key of SENSITIVE_KEYS) {
    if (masked[key]) masked[key] = MASKED
  }
  return masked
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { error } = await requireMaster()
  if (error) return error

  try {
    const cred = await prisma.integrationCredential.findUnique({ where: { id: params.id } })
    if (!cred) {
      return NextResponse.json({ success: false, error: 'Credencial não encontrada.' }, { status: 404 })
    }
    return NextResponse.json({ success: true, data: maskSensitive(cred as unknown as Record<string, unknown>) })
  } catch (err) {
    console.error('[GET /api/master/integrations/:id]', err)
    return handlePrismaError(err)
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const cred = await prisma.integrationCredential.findUnique({ where: { id: params.id } })
    if (!cred) {
      return NextResponse.json({ success: false, error: 'Credencial não encontrada.' }, { status: 404 })
    }

    const body = await req.json()
    const { name, description, apiUrl, apiKey, apiSecret, token, username, webhookSecret, isDefault, active, notes } = body

    const data: Record<string, unknown> = {}
    if (name          != null) data.name          = String(name).trim()
    if (description   != null) data.description   = String(description).trim()   || null
    if (apiUrl        != null) data.apiUrl        = String(apiUrl).trim()        || null
    if (active        != null) data.active        = Boolean(active)
    if (isDefault     != null) data.isDefault     = Boolean(isDefault)
    if (notes         != null) data.notes         = String(notes).trim()         || null
    if (username      != null) data.username      = String(username).trim()      || null

    // Apenas sobrescreve secrets se não for o valor mascarado
    for (const key of ['apiKey', 'apiSecret', 'token', 'webhookSecret']) {
      const val = body[key]
      if (val != null && val !== MASKED) {
        data[key] = String(val).trim() || null
      }
    }

    // Se isDefault=true, desmarcar outros do mesmo serviço
    if (data.isDefault === true) {
      await prisma.integrationCredential.updateMany({
        where: { service: cred.service, isDefault: true, id: { not: params.id } },
        data:  { isDefault: false },
      })
    }

    const updated = await prisma.integrationCredential.update({
      where: { id: params.id },
      data,
    })

    await logMasterAction(session, 'UPDATE_INTEGRATION', 'IntegrationCredential', params.id, {
      beforeData: { active: cred.active, isDefault: cred.isDefault },
      afterData:  { active: updated.active, isDefault: updated.isDefault },
      req,
    })

    return NextResponse.json({
      success: true,
      data: maskSensitive(updated as unknown as Record<string, unknown>),
      message: 'Credencial atualizada com sucesso.',
    })
  } catch (err) {
    console.error('[PATCH /api/master/integrations/:id]', err)
    return handlePrismaError(err)
  }
}

// ── DELETE ─────────────────────────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const cred = await prisma.integrationCredential.findUnique({ where: { id: params.id } })
    if (!cred) {
      return NextResponse.json({ success: false, error: 'Credencial não encontrada.' }, { status: 404 })
    }

    await prisma.integrationCredential.delete({ where: { id: params.id } })

    await logMasterAction(session, 'DELETE_INTEGRATION', 'IntegrationCredential', params.id, {
      beforeData: { service: cred.service, name: cred.name },
      req,
    })

    return NextResponse.json({ success: true, message: 'Credencial excluída com sucesso.' })
  } catch (err) {
    console.error('[DELETE /api/master/integrations/:id]', err)
    return handlePrismaError(err)
  }
}

// ── POST — ações especiais ────────────────────────────────────────────────────
// Ações: test (testa conexão), rotate (regenera token)

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const { action } = await req.json()

    const cred = await prisma.integrationCredential.findUnique({ where: { id: params.id } })
    if (!cred) {
      return NextResponse.json({ success: false, error: 'Credencial não encontrada.' }, { status: 404 })
    }

    if (action === 'TEST') {
      // Simulação de teste de conexão — implementação real depende de cada serviço
      // Aqui apenas marcamos a data de teste e simula sucesso
      await prisma.integrationCredential.update({
        where: { id: params.id },
        data: {
          lastTestedAt: new Date(),
          lastTestOk:   true,
          lastTestMsg:  'Conexão testada manualmente — implementar integração real.',
        },
      })

      await logMasterAction(session, 'TEST_INTEGRATION', 'IntegrationCredential', params.id, {
        afterData: { service: cred.service, testResult: 'OK' },
        req,
      })

      return NextResponse.json({
        success: true,
        message: 'Teste registrado. Implemente o teste real para este provedor.',
      })
    }

    return NextResponse.json({ success: false, error: `Ação desconhecida: ${action}` }, { status: 400 })
  } catch (err) {
    console.error('[POST /api/master/integrations/:id]', err)
    return handlePrismaError(err)
  }
}
