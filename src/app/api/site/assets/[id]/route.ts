// GET /api/site/assets/[id] — arquivo público do site da loja (logo, favicon…).
// Imutável (trocar a logo gera outro id) → cache longo. Cabeçalhos impedem que
// o navegador interprete o arquivo como outra coisa que não imagem.
// ?format=jpg entrega JPEG (o catálogo da Meta não aceita WebP).
// ?on=RRGGBB entrega a versão da logo para aquele fundo escuro (rodapé):
// original, branca ou em cartão branco — decidido pelos pixels.
import { NextResponse } from 'next/server'
import { readSiteAsset } from '@/lib/site/assets'
import { renderFooterLogo } from '@/lib/site/footer-logo'

export const runtime = 'nodejs'

async function toJpeg(input: Uint8Array): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    const sharp = (await import('sharp')).default
    return new Uint8Array(await sharp(input).rotate().flatten({ background: '#ffffff' }).jpeg({ quality: 85, mozjpeg: true }).toBuffer())
  } catch {
    return null
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return new NextResponse('Não encontrado', { status: 404 })
  const asset = await readSiteAsset(id).catch((e) => { console.error('[site/assets] falha ao ler', id, e); return null })
  // Fotos enviadas por clientes (podem mostrar placa/dados) não são públicas.
  if (!asset || asset.kind === 'LEAD_PHOTO' || asset.kind === 'SOCIAL_VPART' || asset.kind === 'SOCIAL_VIDEO') return new NextResponse('Não encontrado', { status: 404 })
  let body = new Uint8Array(asset.data)
  let type = asset.mimeType
  const sp = new URL(req.url).searchParams
  let variant = ''
  const on = sp.get('on') ?? ''
  if (/^[0-9a-f]{6}$/i.test(on) && (asset.kind === 'LOGO' || asset.kind === 'LOGO_LIGHT')) {
    const r = await renderFooterLogo(body, on)
    if (r && r.plan !== 'original' && r.plan !== 'asis') { body = r.body; type = 'image/png'; variant = `-${r.plan}-${on.toLowerCase()}` }
  } else if (sp.get('format') === 'jpg' && type !== 'image/jpeg' && type !== 'image/png') {
    const jpg = await toJpeg(body)
    if (jpg) { body = jpg; type = 'image/jpeg'; variant = '-jpg' }
  }
  return new NextResponse(body, {
    headers: {
      'Content-Type': type,
      'Content-Length': String(body.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: `"${asset.sha256}${variant}"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  })
}
