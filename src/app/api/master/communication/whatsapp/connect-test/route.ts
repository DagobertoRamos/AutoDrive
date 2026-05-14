// =============================================================================
// POST /api/master/communication/whatsapp/connect-test
// Testa a conexão com a Meta WhatsApp Cloud API SEM enviar mensagem.
// Faz GET no Phone Number ID para validar token + número + versão.
// Grava resultado em CommunicationTestLog e atualiza status da config.
// Apenas MASTER.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireMaster, upsertSystemSetting } from '@/lib/master-guards'
import { prisma }  from '@/lib/prisma'
import { getWhatsAppConfig } from '../route'

interface MetaPhoneInfo {
  id:                  string
  display_phone_number: string
  verified_name:       string
  quality_rating:      string
  platform_type:       string
  throughput?:         { level: string }
  error?:              { message: string; code: number; type?: string; fbtrace_id?: string }
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireMaster()
  if (error) return error

  const start = Date.now()

  const cfg = await getWhatsAppConfig().catch(() => null)

  // Validações pré-requisito
  if (!cfg?.token) {
    return NextResponse.json({ success: false, error: 'Token de acesso não configurado.', errorCode: 'NO_TOKEN' }, { status: 400 })
  }
  if (!cfg?.phoneNumberId) {
    return NextResponse.json({ success: false, error: 'Phone Number ID não configurado.', errorCode: 'NO_PHONE_NUMBER_ID' }, { status: 400 })
  }

  const apiVersion = cfg.apiVersion || 'v20.0'
  const baseUrl    = (cfg.apiUrl || 'https://graph.facebook.com').replace(/\/$/, '')
  const url        = `${baseUrl}/${apiVersion}/${cfg.phoneNumberId}`

  let success = false
  let errorCode: string | undefined
  let errorMessage: string | undefined
  let errorDetails: string | undefined
  let responseData: MetaPhoneInfo | null = null
  let httpStatus = 0

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${cfg.token}` },
    })
    httpStatus = res.status

    const json = await res.json() as MetaPhoneInfo

    if (!res.ok || json.error) {
      const e = json.error
      errorCode    = e?.code ? String(e.code) : String(res.status)
      errorMessage = e?.message ?? `HTTP ${res.status}`
      errorDetails = JSON.stringify(json, null, 2)
    } else {
      success      = true
      responseData = json
    }
  } catch (err) {
    const e = err as { message?: string; code?: string }
    errorCode    = e.code ?? 'FETCH_ERROR'
    errorMessage = e.message ?? 'Erro de rede ao contactar a API Meta.'
    errorDetails = err instanceof Error ? err.stack : String(err)
  }

  const responseMs = Date.now() - start

  // Atualiza status da config
  const statusValue = success ? 'CONECTADO' : `ERRO:${errorCode}`
  await Promise.all([
    upsertSystemSetting('whatsapp.lastConnectAt',     new Date().toISOString(), 'whatsapp', session.id),
    upsertSystemSetting('whatsapp.lastConnectStatus', statusValue,              'whatsapp', session.id),
  ]).catch(() => {})

  // Grava log
  await prisma.communicationTestLog.create({
    data: {
      channel:      'WHATSAPP',
      provider:     cfg.provider ?? 'meta',
      triggeredBy:  session.id,
      target:       `PhoneNumberID:${cfg.phoneNumberId}`,
      success,
      errorCode:    errorCode    ?? null,
      errorMessage: errorMessage ?? null,
      errorDetails: errorDetails ?? null,
      responseMs,
      metadata:     responseData ? (responseData as unknown as object) : undefined,
    },
  }).catch(err => console.error('[connect-test] log failed:', err))

  if (success && responseData) {
    return NextResponse.json({
      success: true,
      message: 'Conexão com a Meta validada com sucesso.',
      phoneInfo: {
        displayNumber: responseData.display_phone_number,
        verifiedName:  responseData.verified_name,
        qualityRating: responseData.quality_rating,
        platformType:  responseData.platform_type,
        throughput:    responseData.throughput?.level,
      },
      httpStatus,
      responseMs,
    })
  }

  return NextResponse.json(
    {
      success:      false,
      error:        errorMessage ?? 'Falha na conexão com a Meta.',
      errorCode,
      errorDetails,
      httpStatus,
      responseMs,
    },
    { status: 502 },
  )
}
