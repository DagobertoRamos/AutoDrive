// =============================================================================
// GET /api/marketing/telephony/recordings/[id]/stream?exp=..&sig=..
// Serve a gravação via LINK ASSINADO de curta duração (a assinatura É a
// capability — emitida pelo /play, que já checou permissão/tenant). Aqui:
// valida assinatura+expiração → confere status AVAILABLE → audita →
// resolve a origem (storage gerenciado: redirect; URL externa em allowlist:
// proxy com guarda anti-SSRF; senão 501). A URL bruta nunca vai ao cliente.
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { verifyPlayToken, resolveRecordingSource } from '@/lib/telephony/recording-storage'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params
  const sp = new URL(req.url).searchParams
  const exp = Number(sp.get('exp'))
  const sig = sp.get('sig') ?? ''

  if (!verifyPlayToken(id, exp, sig, Date.now())) {
    return NextResponse.json({ success: false, error: 'Link inválido ou expirado.' }, { status: 403 })
  }

  try {
    const rec = await prisma.telephonyRecording.findUnique({
      where: { id },
      select: { id: true, tenantId: true, status: true, storageUrl: true, mimeType: true, callId: true },
    })
    if (!rec) return NextResponse.json({ success: false, error: 'Gravação não encontrada.' }, { status: 404 })
    if (rec.status !== 'AVAILABLE') {
      return NextResponse.json({ success: false, error: 'Gravação indisponível.' }, { status: 409 })
    }

    const source = resolveRecordingSource(rec.storageUrl)
    if (source.kind === 'unavailable') {
      await prisma.telephonyIntegrationLog.create({
        data: { tenantId: rec.tenantId, action: 'RECORDING_STREAM', status: 'ERROR', message: source.reason },
      }).catch(() => {})
      return NextResponse.json({ success: false, error: source.reason }, { status: 501 })
    }

    // Auditoria do acesso efetivo ao áudio (via link assinado).
    await prisma.telephonyIntegrationLog.create({
      data: { tenantId: rec.tenantId, action: 'RECORDING_STREAM', status: 'OK', message: `stream ${source.kind} (call ${rec.callId})` },
    }).catch(() => {})

    if (source.kind === 'redirect') {
      return NextResponse.redirect(source.url, 302)
    }

    // Proxy (URL externa https em allowlist) — a URL nunca é exposta ao cliente.
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 20000)
    let upstream: Response
    try {
      upstream = await fetch(source.url, { signal: ctrl.signal, redirect: 'follow' })
    } catch {
      clearTimeout(timer)
      return NextResponse.json({ success: false, error: 'Falha ao obter a gravação.' }, { status: 502 })
    }
    clearTimeout(timer)
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ success: false, error: 'Gravação indisponível na origem.' }, { status: 502 })
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || rec.mimeType || 'audio/mpeg',
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
