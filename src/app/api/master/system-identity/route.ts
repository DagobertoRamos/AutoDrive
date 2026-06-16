// =============================================================================
// /api/master/system-identity — Identidade global da plataforma (MASTER only)
//
// GET   — retorna configuração atual (singleton)
// PATCH — atualiza campos da identidade global
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireMaster, logMasterAction } from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { prisma } from '@/lib/prisma'

const ALLOWED_FIELDS = [
  'systemName', 'systemSlogan',
  'logoUrl', 'faviconUrl',
  'primaryColor', 'secondaryColor', 'accentColor',
  'footerText',
  'supportEmail', 'supportPhone', 'supportUrl',
  'termsUrl', 'privacyUrl',
  'customDomain',
  'timezone', 'locale', 'currency',
] as const

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  const { error } = await requireMaster()
  if (error) return error

  try {
    // Singleton — pega o único registro ou cria com defaults
    let identity = await prisma.systemIdentity.findFirst()

    if (!identity) {
      identity = await prisma.systemIdentity.create({ data: {} })
    }

    return NextResponse.json({ success: true, data: identity })
  } catch (err) {
    console.error('[GET /api/master/system-identity]', err)
    return handlePrismaError(err)
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const body = await req.json() as Record<string, string>

    // Construir objeto de atualização apenas com campos permitidos
    const updateData: Record<string, string | null> = {
      updatedById: session.id,
    }

    for (const field of ALLOWED_FIELDS) {
      if (field in body && body[field] != null) {
        updateData[field] = String(body[field]).trim() || null as never
      }
    }

    // Garantir que systemName nunca fique vazio
    if (updateData.systemName === null) {
      updateData.systemName = 'AutoDrive'
    }

    // Upsert singleton
    let identity = await prisma.systemIdentity.findFirst()

    if (!identity) {
      identity = await prisma.systemIdentity.create({
        data: { updatedById: session.id },
      })
    }

    const updated = await prisma.systemIdentity.update({
      where: { id: identity.id },
      data:  updateData,
    })

    await logMasterAction(session, 'UPDATE_SYSTEM_IDENTITY', 'SystemIdentity', updated.id, {
      afterData: { systemName: updated.systemName, primaryColor: updated.primaryColor },
      req,
    })

    return NextResponse.json({
      success: true,
      data: updated,
      message: 'Identidade do sistema atualizada com sucesso.',
    })
  } catch (err) {
    console.error('[PATCH /api/master/system-identity]', err)
    return handlePrismaError(err)
  }
}
