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
import { getServiceDef } from '@/lib/integrations/catalog'
import { clearActiveCredentialCache } from '@/lib/integrations/active'
import { clearPlacasCredentialCache } from '@/lib/integrations/placas/client'
import { clearPlateProviderCache } from '@/lib/plate-lookup/service'

const MASKED = '••••••••'

function maskSensitive(cred: Record<string, unknown>): Record<string, unknown> {
  const masked = { ...cred }
  for (const key of ['apiKey', 'apiSecret', 'token', 'webhookSecret']) {
    if (masked[key]) masked[key] = MASKED
  }
  return masked
}

const SERVICES = [
  'BRASILAPI',
  'FIPE_PROVIDER',
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
    const serviceKey = String(service).toUpperCase()
    if (!SERVICES.includes(serviceKey as never)) {
      return NextResponse.json(
        { success: false, error: `Serviço "${serviceKey}" não é suportado.` },
        { status: 400 },
      )
    }

    // ── Whitelist por serviço (catálogo) ────────────────────────────────────
    // Garante que campos indevidos enviados acidentalmente (ex.: e-mail do
    // usuário em "username" para FIPE) NÃO sejam persistidos.
    const def = getServiceDef(serviceKey)
    const allowsField = (k: string) => !def || def.fields.includes(k as never)

    // ── Validação de URL específica do serviço ──────────────────────────────
    // Bloqueia, por exemplo, cadastrar BrasilAPI com URL de PlacaFipe.
    if (def?.validateUrl && apiUrl) {
      const urlError = def.validateUrl(String(apiUrl).trim())
      if (urlError) {
        return NextResponse.json({ success: false, error: urlError }, { status: 400 })
      }
    }

    // Helper: salva apenas se o campo é permitido pelo serviço E o usuário
    // forneceu um valor não-vazio (placeholder mascarado nunca chega aqui
    // pois o frontend não envia campos sensíveis vazios).
    const cleanString = (v: unknown): string | null => {
      if (v == null) return null
      const s = String(v).trim()
      if (!s) return null
      if (s === MASKED) return null  // segurança extra: nunca persiste o placeholder
      return s
    }

    // Se isDefault=true, desmarcar as outras do mesmo serviço
    if (isDefault) {
      await prisma.integrationCredential.updateMany({
        where: { service: serviceKey, isDefault: true },
        data:  { isDefault: false },
      })
    }

    const cred = await prisma.integrationCredential.create({
      data: {
        service:       serviceKey,
        name:          String(name).trim(),
        description:   description ? String(description).trim() : null,
        apiUrl:        allowsField('apiUrl')        ? cleanString(apiUrl)        : null,
        apiKey:        allowsField('apiKey')        ? cleanString(apiKey)        : null,
        apiSecret:     allowsField('apiSecret')     ? cleanString(apiSecret)     : null,
        token:         allowsField('token')         ? cleanString(token)         : null,
        username:      allowsField('username')      ? cleanString(username)      : null,
        webhookSecret: allowsField('webhookSecret') ? cleanString(webhookSecret) : null,
        isDefault:     Boolean(isDefault),
        notes:         notes ? String(notes).trim() : null,
        createdById:   session.id,
      },
    })

    await logMasterAction(session, 'CREATE_INTEGRATION', 'IntegrationCredential', cred.id, {
      afterData: { service: cred.service, name: cred.name, isDefault: cred.isDefault },
      req,
    })
    clearActiveCredentialCache()
    // Limpa também os caches específicos para que a nova credencial seja
    // efetiva imediatamente (sem esperar 5 min do cache do placas client).
    if (cred.service === 'PLATE_LOOKUP') {
      clearPlacasCredentialCache()
      clearPlateProviderCache()
    }

    return NextResponse.json(
      { success: true, data: maskSensitive(cred as unknown as Record<string, unknown>), message: 'Credencial criada com sucesso.' },
      { status: 201 },
    )
  } catch (err) {
    console.error('[POST /api/master/integrations]', err)
    return handlePrismaError(err)
  }
}
