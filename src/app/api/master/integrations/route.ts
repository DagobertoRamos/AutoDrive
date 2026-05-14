// =============================================================================
// /api/master/integrations — Credenciais de integrações globais (MASTER only)
//
// GET  — lista todas as credenciais (valores sensíveis mascarados)
// POST — cria nova credencial de integração
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireMaster, logMasterAction } from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { prisma } from '@/lib/prisma'

const MASKED = '••••••••'

function maskSensitive(cred: Record<string, unknown>): Record<string, unknown> {
  const masked = { ...cred }
  for (const key of ['apiKey', 'apiSecret', 'token', 'webhookSecret']) {
    if (masked[key]) masked[key] = MASKED
  }
  return masked
}

const SERVICES = [
  'FIPE', 'PLATE_LOOKUP', 'RENAVAM', 'CNPJ_LOOKUP', 'CEP',
  'STORAGE', 'PAYMENT_GATEWAY', 'DIGITAL_SIGN', 'MAPS', 'OTHER',
] as const

export async function GET(req: NextRequest) {
  const { error } = await requireMaster()
  if (error) return error

  const { searchParams } = new URL(req.url)
  const service = searchParams.get('service')

  try {
    const credentials = await prisma.integrationCredential.findMany({
      where: service ? { service } : undefined,
      orderBy: [{ service: 'asc' }, { createdAt: 'desc' }],
    })

    // Mascara campos sensíveis no GET
    const safe = credentials.map(c => maskSensitive(c as unknown as Record<string, unknown>))

    return NextResponse.json({ success: true, data: safe, services: SERVICES })
  } catch (err) {
    console.error('[GET /api/master/integrations]', err)
    return handlePrismaError(err)
  }
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const body = await req.json()
    const {
      service, name, description,
      apiUrl, apiKey, apiSecret, token, username,
      webhookSecret, isDefault, notes,
    } = body

    if (!service?.trim() || !name?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Serviço e nome são obrigatórios.' },
        { status: 400 },
      )
    }

    // Se isDefault=true, desmarcar as outras do mesmo serviço
    if (isDefault) {
      await prisma.integrationCredential.updateMany({
        where: { service: String(service), isDefault: true },
        data:  { isDefault: false },
      })
    }

    const cred = await prisma.integrationCredential.create({
      data: {
        service:       String(service).toUpperCase(),
        name:          String(name).trim(),
        description:   description   ? String(description).trim()   : null,
        apiUrl:        apiUrl        ? String(apiUrl).trim()        : null,
        apiKey:        apiKey        ? String(apiKey).trim()        : null,
        apiSecret:     apiSecret     ? String(apiSecret).trim()     : null,
        token:         token         ? String(token).trim()         : null,
        username:      username      ? String(username).trim()      : null,
        webhookSecret: webhookSecret ? String(webhookSecret).trim() : null,
        isDefault:     Boolean(isDefault),
        notes:         notes         ? String(notes).trim()         : null,
        createdById:   session.id,
      },
    })

    await logMasterAction(session, 'CREATE_INTEGRATION', 'IntegrationCredential', cred.id, {
      afterData: { service: cred.service, name: cred.name, isDefault: cred.isDefault },
      req,
    })

    return NextResponse.json(
      { success: true, data: maskSensitive(cred as unknown as Record<string, unknown>), message: 'Credencial criada com sucesso.' },
      { status: 201 },
    )
  } catch (err) {
    console.error('[POST /api/master/integrations]', err)
    return handlePrismaError(err)
  }
}
