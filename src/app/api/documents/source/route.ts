// =============================================================================
// GET /api/documents/source — dados da base para o gerador de documentos.
//   ?dealId= | ?customerId= | ?vehicleId= | ?supplierId=  → origem escolhida
//   (sem parâmetro)                                      → só a loja
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { buildNegotiationAccessWhere } from '@/lib/negotiation-access'
import { loadCustomerSource, loadDealSource, loadStoreSource, loadSupplierSource, loadVehicleSource, type DocSourcePayload } from '@/lib/documents/source-loader'
import { guardDocuments } from '@/lib/documents/source-guard'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const g = await guardDocuments()
  if ('error' in g) return g.error
  const sp = req.nextUrl.searchParams
  try {
    let data: DocSourcePayload | null
    const dealId = sp.get('dealId'), customerId = sp.get('customerId'), vehicleId = sp.get('vehicleId'), supplierId = sp.get('supplierId')
    if (dealId) data = await loadDealSource(dealId, await buildNegotiationAccessWhere(g.user, { id: dealId, ...g.scope }))
    else if (customerId) data = await loadCustomerSource(customerId, g.scope)
    else if (vehicleId) data = await loadVehicleSource(vehicleId, g.scope)
    else if (supplierId) data = await loadSupplierSource(supplierId, g.scope)
    else data = await loadStoreSource(g.user.tenantId)
    if (!data) return NextResponse.json({ success: false, error: 'Registro não encontrado.' }, { status: 404 })
    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('[GET /api/documents/source]', err)
    return NextResponse.json({ success: false, error: 'Não foi possível carregar os dados.' }, { status: 500 })
  }
}
