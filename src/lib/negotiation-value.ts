// Valor do carro na negociação (o que aparece na lista e no resumo): o valor
// negociado do veículo principal — nunca o total de pagamentos.
//   • COMPRA → valor de compra; demais → valor de venda.
//   • Sem valor na negociação (ex.: consignação recém-criada) → preço do estoque.

type Num = string | number | { toString(): string } | null | undefined

export interface DealValueVehicle {
  role?: string | null
  agreedValue?: Num
  vehicle?: { salePrice?: Num } | null
}

export interface DealValueLike {
  type: string
  saleAmount?: Num
  purchaseAmount?: Num
  vehicleValue?: Num
  vehicles?: DealValueVehicle[] | null
}

const num = (v: Num): number | null => {
  if (v == null || v === '') return null
  const n = Number(String(v))
  return Number.isFinite(n) && n > 0 ? n : null
}

export function dealMainRole(type: string): string {
  return type === 'COMPRA' ? 'COMPRADO' : type === 'CONSIGNACAO' ? 'CONSIGNADO' : 'VENDIDO'
}

export function dealMainVehicle<T extends DealValueVehicle>(deal: { type: string; vehicles?: T[] | null }): T | undefined {
  const list = deal.vehicles ?? []
  return list.find((v) => v.role === dealMainRole(deal.type)) ?? list[0]
}

export function dealVehiclePrice(deal: DealValueLike): number | null {
  const main = dealMainVehicle(deal)
  if (deal.type === 'COMPRA') return num(deal.purchaseAmount) ?? num(main?.agreedValue) ?? num(deal.vehicleValue)
  return num(deal.saleAmount) ?? num(main?.agreedValue) ?? num(deal.vehicleValue) ?? num(main?.vehicle?.salePrice)
}
