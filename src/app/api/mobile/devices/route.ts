// =============================================================================
// /api/mobile/devices — registro do token de push (FCM/APNs) do aparelho.
//   POST   : registra/atualiza o token do device do usuário logado
//   DELETE : revoga o token (logout / desinstalou)
// Usado pelo app nativo para receber push (chamada da fila etc.).
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { readMobileClient } from '@/lib/mobile/client'

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  try {
    const body = await req.json().catch(() => ({}))
    const deviceToken = typeof body?.deviceToken === 'string' ? body.deviceToken.trim() : ''
    if (!deviceToken) return NextResponse.json({ success: false, error: 'deviceToken obrigatório.' }, { status: 400 })

    const client = readMobileClient(req.headers)
    const platform = (typeof body?.platform === 'string' && body.platform) || (client.platform === 'ios' ? 'IOS' : client.platform === 'android' ? 'ANDROID' : 'ANDROID')
    const deviceName = typeof body?.deviceName === 'string' ? body.deviceName.slice(0, 120) : null
    const appVersion = (typeof body?.appVersion === 'string' && body.appVersion) || client.appVersion || null

    await prisma.mobileDevice.upsert({
      where: { deviceToken },
      update: { userId: user.id, platform: platform.toUpperCase(), deviceName, appVersion, isActive: true, revokedAt: null, lastSeenAt: new Date() },
      create: { userId: user.id, deviceToken, platform: platform.toUpperCase(), deviceName, appVersion, isActive: true, lastSeenAt: new Date() },
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function DELETE(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  try {
    const body = await req.json().catch(() => ({}))
    const deviceToken = typeof body?.deviceToken === 'string' ? body.deviceToken.trim() : ''
    if (!deviceToken) return NextResponse.json({ success: false, error: 'deviceToken obrigatório.' }, { status: 400 })
    await prisma.mobileDevice.updateMany({ where: { deviceToken, userId: user.id }, data: { isActive: false, revokedAt: new Date() } })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
