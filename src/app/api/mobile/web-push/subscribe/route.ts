// =============================================================================
// /api/mobile/web-push/subscribe — registra/remove a inscrição de Web Push
// (PWA/iPhone) do usuário logado. Guarda em MobileDevice (platform=WEBPUSH).
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { handlePrismaError } from '@/lib/prisma-errors'

export const dynamic = 'force-dynamic'

// Entrega a chave pública VAPID em runtime (robusto: não depende do build inlining).
export async function GET() {
  return NextResponse.json({ publicKey: process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null })
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  try {
    const body = await req.json().catch(() => ({}))
    const sub = body?.subscription
    if (!sub?.endpoint) return NextResponse.json({ success: false, error: 'subscription inválida.' }, { status: 400 })
    const token = JSON.stringify(sub)
    await prisma.mobileDevice.upsert({
      where: { deviceToken: token },
      update: { userId: user.id, platform: 'WEBPUSH', isActive: true, revokedAt: null, lastSeenAt: new Date() },
      create: { userId: user.id, deviceToken: token, platform: 'WEBPUSH', isActive: true, lastSeenAt: new Date() },
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
    const sub = body?.subscription
    if (!sub?.endpoint) return NextResponse.json({ success: false, error: 'subscription inválida.' }, { status: 400 })
    await prisma.mobileDevice.updateMany({ where: { deviceToken: JSON.stringify(sub), userId: user.id }, data: { isActive: false, revokedAt: new Date() } })
    return NextResponse.json({ success: true })
  } catch (err) {
    return handlePrismaError(err)
  }
}
