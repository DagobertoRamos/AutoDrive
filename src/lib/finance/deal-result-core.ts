// =============================================================================
// Resultado completo da negociação (regra pura, testada).
//   Receitas: venda do veículo (− desconto) + serviços/documentação/garantia
//             cobrados + F&I (retorno líquido, PLUS, agregados da loja).
//   Custos:   custo do veículo (aquisição + preparação + documentação do carro)
//             + custo dos serviços/documentação/garantia + débitos que a loja
//             assumiu + comissões.
//   Resultado = receitas − custos; margem sobre a receita.
// O custo do veículo é o do carro (centro de resultado do veículo); o resultado
// da negociação soma tudo o que a venda gerou.
// =============================================================================

const c2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

export interface DealResultService { kind: string; label: string; charged: number; cost: number }

export interface DealResultInput {
  vehicleSale: number
  discount: number
  vehicleCost: { acquisition: number; preparation: number; documentation: number }
  fi: number
  services: DealResultService[]
  storeDebts: number
  commissions: number
}

export interface DealResultLine { key: string; label: string; value: number; sign: 1 | -1 }

export interface DealResult {
  revenue: { vehicle: number; services: number; fi: number; total: number }
  cost: { vehicle: number; services: number; storeDebts: number; commissions: number; total: number }
  vehicleMargin: number
  profit: number
  margin: number | null
  lines: DealResultLine[]
}

export function dealResult(i: DealResultInput): DealResult {
  const vehicleRevenue = c2(i.vehicleSale - i.discount)
  const servicesRevenue = c2(i.services.reduce((s, x) => s + x.charged, 0))
  const fi = c2(i.fi)
  const vehicleCost = c2(i.vehicleCost.acquisition + i.vehicleCost.preparation + i.vehicleCost.documentation)
  const servicesCost = c2(i.services.reduce((s, x) => s + x.cost, 0))
  const storeDebts = c2(i.storeDebts)
  const commissions = c2(i.commissions)
  const revenueTotal = c2(vehicleRevenue + servicesRevenue + fi)
  const costTotal = c2(vehicleCost + servicesCost + storeDebts + commissions)
  const profit = c2(revenueTotal - costTotal)

  const lines: DealResultLine[] = [
    { key: 'venda', label: 'Venda do veículo', value: c2(i.vehicleSale), sign: 1 },
    ...(i.discount ? [{ key: 'desconto', label: 'Desconto', value: c2(i.discount), sign: -1 as const }] : []),
    { key: 'aquisicao', label: 'Aquisição', value: c2(i.vehicleCost.acquisition), sign: -1 },
    ...(i.vehicleCost.preparation ? [{ key: 'preparacao', label: 'Preparação', value: c2(i.vehicleCost.preparation), sign: -1 as const }] : []),
    ...(i.vehicleCost.documentation ? [{ key: 'doc_veiculo', label: 'Documentação do veículo', value: c2(i.vehicleCost.documentation), sign: -1 as const }] : []),
    ...(fi ? [{ key: 'fi', label: 'F&I', value: fi, sign: 1 as const }] : []),
    ...i.services.flatMap((s) => [
      ...(s.charged ? [{ key: `srv_${s.kind}_r`, label: s.label, value: c2(s.charged), sign: 1 as const }] : []),
      ...(s.cost ? [{ key: `srv_${s.kind}_c`, label: `Custo: ${s.label}`, value: c2(s.cost), sign: -1 as const }] : []),
    ]),
    ...(storeDebts ? [{ key: 'debitos', label: 'Débitos assumidos pela loja', value: storeDebts, sign: -1 as const }] : []),
    ...(commissions ? [{ key: 'comissoes', label: 'Comissões', value: commissions, sign: -1 as const }] : []),
  ]

  return {
    revenue: { vehicle: vehicleRevenue, services: servicesRevenue, fi, total: revenueTotal },
    cost: { vehicle: vehicleCost, services: servicesCost, storeDebts, commissions, total: costTotal },
    vehicleMargin: c2(vehicleRevenue - vehicleCost),
    profit,
    margin: revenueTotal > 0 ? c2((profit / revenueTotal) * 100) : null,
    lines,
  }
}

/** Agrupa os serviços por tipo (mesmo tipo soma). */
export function groupServices(rows: DealResultService[]): DealResultService[] {
  const map = new Map<string, DealResultService>()
  for (const r of rows) {
    const cur = map.get(r.kind)
    if (cur) { cur.charged = c2(cur.charged + r.charged); cur.cost = c2(cur.cost + r.cost) }
    else map.set(r.kind, { ...r, charged: c2(r.charged), cost: c2(r.cost) })
  }
  return [...map.values()]
}
