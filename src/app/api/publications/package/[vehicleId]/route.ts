// GET /api/publications/package/<vehicleId> — pacote para anúncio: nome do
// arquivo, quantidade de fotos e os textos prontos (Marketplace, grupos,
// WhatsApp, legenda). Fotos e vídeo vêm pelas rotas /photo e /video.
import { NextResponse } from 'next/server'
import { bad, pubAuth } from '@/lib/publications/api'
import { packageManifest } from '@/lib/publications/package'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, ctx: { params: Promise<{ vehicleId: string }> }) {
  const a = await pubAuth(req)
  if (a instanceof NextResponse) return a
  try { return NextResponse.json({ success: true, data: await packageManifest(a.tenantId, (await ctx.params).vehicleId) }) } catch (e) { return bad((e as Error).message, 404) }
}
