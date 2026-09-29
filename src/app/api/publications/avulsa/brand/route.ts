// GET /api/publications/avulsa/brand?style=DISCRETO|COMPLETO&assetId=  → foto com a identidade da loja (prévia)
// GET /api/publications/avulsa/brand?style=...&w=1080&h=1920          → só a camada (PNG), para a prévia do vídeo
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { bad, pubAuth } from '@/lib/publications/api'
import { isBrandMark } from '@/lib/publications/social/avulsa-core'
import { brandOverlay, brandPhoto, tenantBrand } from '@/lib/publications/social/brand-frame'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: Request) {
  const a = await pubAuth(req)
  if (a instanceof NextResponse) return a
  const sp = new URL(req.url).searchParams
  const style = sp.get('style')
  if (!isBrandMark(style)) return bad('Estilo inválido.')
  const brand = await tenantBrand(a.tenantId)
  const assetId = sp.get('assetId')
  if (assetId) {
    const asset = await prisma.siteAsset.findFirst({ where: { id: assetId, tenantId: a.tenantId, kind: 'SOCIAL_UPLOAD' }, select: { data: true } })
    if (!asset) return bad('Foto não encontrada.', 404)
    const jpg = await brandPhoto(Buffer.from(asset.data), brand, style)
    return new NextResponse(new Uint8Array(jpg), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=120' } })
  }
  const w = Math.min(2160, Math.max(200, Number(sp.get('w')) || 1080)); const h = Math.min(3840, Math.max(200, Number(sp.get('h')) || 1920))
  const png = await brandOverlay(w, h, brand, style)
  return new NextResponse(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=120' } })
}
