// GET /api/financing/performance?from=AAAA-MM-DD&to=AAAA-MM-DD — desempenho por
// banco (histórico da loja). Retorno médio só para quem pode ver retorno.
// A sugestão é recomendação, nunca aprovação.
import { NextResponse } from 'next/server'
import { isFiAllowed } from '@/lib/finance/fi-permissions'
import { bankPerformance, historySuggestion } from '@/lib/finance/fi/dashboard'
import { fiAuth, fiErrorResponse } from '@/lib/finance/fi/route'

const day = (s: string | null, end = false) => {
  const m = /^(\d{4}-\d{2}-\d{2})$/.exec(s ?? '')
  return m ? new Date(`${m[1]}T${end ? '23:59:59.999' : '00:00:00.000'}-03:00`) : null
}

export async function GET(req: Request) {
  const auth = await fiAuth(req)
  if (!auth.ok) return auth.res
  try {
    const sp = new URL(req.url).searchParams
    const to = day(sp.get('to'), true) ?? new Date()
    const from = day(sp.get('from')) ?? new Date(to.getTime() - 90 * 86_400_000)
    const perf = await bankPerformance(auth.tenantId, from, to)
    const seeReturn = await isFiAllowed(auth.tenantId, 'verRetorno', auth.user.role)
    return NextResponse.json({
      success: true,
      data: perf.map((p) => ({ ...p, avgReturnPercent: seeReturn ? p.avgReturnPercent : undefined })),
      suggestion: historySuggestion(perf),
    })
  } catch (err) { return fiErrorResponse(err) }
}
