// =============================================================================
// GET /api/evaluations/fipe/history?fipeCode=XXX&vehicleType=carros
// Retorna histórico FIPE dos últimos 6 meses para o código informado.
// Responde sempre com 6 entradas (valor null quando o mês não tem preço).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { canAccessModule } from '@/lib/permissions'
import { getReferences, getPriceByCodeAt } from '@/lib/fipe/parallelum'
import { assertModuleEnabled } from '@/lib/tenant-modules'

export const dynamic = 'force-dynamic'

function refToYYYYMM(label: string): string {
  // Parallelum: "maio/2026 " ou "Maio/2026"
  const map: Record<string, string> = {
    janeiro: '01', fevereiro: '02', marco: '03', 'março': '03',
    abril: '04', maio: '05', junho: '06', julho: '07', agosto: '08',
    setembro: '09', outubro: '10', novembro: '11', dezembro: '12',
  }
  const m = String(label ?? '').trim().toLowerCase().match(/^([a-zçãéí]+)\/?\s*(\d{4})/i)
  if (!m) return ''
  const month = map[m[1]] ?? '01'
  return `${m[2]}-${month}`
}

function parsePrice(s: string | undefined): number | null {
  if (!s) return null
  const cleaned = String(s).replace(/[^\d,]/g, '').replace(',', '.')
  const n = Number(cleaned)
  return Number.isFinite(n) && n > 0 ? n : null
}

export async function GET(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!canAccessModule(session.user.role, 'stock.evaluate')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }
  { const gate = await assertModuleEnabled(session.user, 'stock.evaluate'); if (gate) return gate }

  const fipeCode = (req.nextUrl.searchParams.get('fipeCode') ?? '').trim()
  const vehicleType = (req.nextUrl.searchParams.get('vehicleType') ?? 'carros').trim()
  if (!fipeCode) {
    return NextResponse.json({ months: [], note: 'Histórico FIPE indisponível (sem código FIPE).' })
  }

  const refs = await getReferences()
  if (!refs.ok || !refs.data?.length) {
    return NextResponse.json({ months: [], note: 'Histórico FIPE indisponível para este modelo.' })
  }

  // Últimas 6 referências (a primeira do array é a mais recente em geral)
  const last6 = refs.data.slice(0, 6)

  const results = await Promise.all(
    last6.map(async (r) => {
      const monthKey = refToYYYYMM(r.month) || r.code
      try {
        const p = await getPriceByCodeAt(fipeCode, r.code, vehicleType)
        if (p.ok && Array.isArray(p.data) && p.data.length > 0) {
          // priceByCode retorna várias entradas (ano modelo); pega o maior valor
          const values = p.data.map((d) => parsePrice(d.price)).filter((v): v is number => v != null)
          const value = values.length ? Math.max(...values) : null
          return { month: monthKey, value }
        }
        return { month: monthKey, value: null }
      } catch {
        return { month: monthKey, value: null }
      }
    }),
  )

  // Ordem cronológica crescente
  const months = results.reverse()
  const hasAny = months.some((m) => m.value != null)
  return NextResponse.json({
    months,
    note: hasAny ? null : 'Histórico FIPE indisponível para este modelo.',
  })
}
