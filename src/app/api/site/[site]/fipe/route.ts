// =============================================================================
// GET /api/site/[site]/fipe — tabela FIPE (carros) para o formulário público
// "Venda seu carro". Sem login: só dados públicos da FIPE, com o cache do
// provider (lib/fipe/parallelum). O token do provider nunca sai do servidor.
//   ?                          → marcas
//   ?brandId=59                → modelos (= versões) da marca
//   ?brandId=59&modelId=5940   → anos do modelo
// =============================================================================

import { NextResponse } from 'next/server'
import { resolveSite } from '@/lib/site/config'
import { getBrands, getModels, getYears } from '@/lib/fipe/parallelum'

export const dynamic = 'force-dynamic'

const ID = /^\d{1,8}$/

export async function GET(req: Request, { params }: { params: Promise<{ site: string }> }) {
  const { site } = await params
  const resolved = await resolveSite(site)
  if (!resolved) return NextResponse.json({ ok: false, error: 'Site não encontrado.' }, { status: 404 })

  const sp = new URL(req.url).searchParams
  const brandId = sp.get('brandId') ?? ''
  const modelId = sp.get('modelId') ?? ''
  if ((brandId && !ID.test(brandId)) || (modelId && !ID.test(modelId)) || (modelId && !brandId)) {
    return NextResponse.json({ ok: false, error: 'Parâmetros inválidos.' }, { status: 400 })
  }

  const r = modelId ? await getYears('carros', brandId, modelId)
    : brandId       ? await getModels('carros', brandId)
    :                 await getBrands('carros')

  if (!r.ok) {
    console.error('[site fipe]', brandId || '-', modelId || '-', r.error)
    return NextResponse.json({ ok: false, error: 'Tabela FIPE indisponível no momento.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
  const data = (r.data ?? []).map((x) => ({ code: String(x.code), name: String(x.name) }))
  return NextResponse.json({ ok: true, data }, { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' } })
}
