// =============================================================================
// Conectores por banco. HOJE nenhum tem implementação oficial homologada —
// todos respondem "Banco ainda não integrado" e a ficha segue em
// acompanhamento manual (o operador registra a resposta do banco).
//
// Para integrar um banco: implementar os métodos com a API OFICIAL contratada,
// declarar `capabilities`, `credentialFields` e `official = true`.
// Nenhuma tela precisa mudar.
// =============================================================================

import { NotIntegratedBank } from './base'
import type { BankChannel } from './types'

export class BVAdapter extends NotIntegratedBank { readonly key = 'bv'; readonly name = 'Banco BV' }
export class PanAdapter extends NotIntegratedBank { readonly key = 'pan'; readonly name = 'Banco PAN' }
export class SantanderAdapter extends NotIntegratedBank { readonly key = 'santander'; readonly name = 'Santander' }
export class ItauAdapter extends NotIntegratedBank { readonly key = 'itau'; readonly name = 'Itaú' }
export class SafraAdapter extends NotIntegratedBank { readonly key = 'safra'; readonly name = 'Safra' }
export class C6Adapter extends NotIntegratedBank { readonly key = 'c6'; readonly name = 'C6 Bank' }
export class BradescoAdapter extends NotIntegratedBank { readonly key = 'bradesco'; readonly name = 'Bradesco' }
export class DaycovalAdapter extends NotIntegratedBank { readonly key = 'daycoval'; readonly name = 'Daycoval' }

/**
 * Agregador autorizado (API contratada que atende vários bancos). O banco final
 * vai em `BankContext.routedBankCode`. Quando um banco ganhar integração direta,
 * basta trocar o `adapterKey` dele de "agregador" para o conector direto.
 */
export class AggregatorAdapter extends NotIntegratedBank {
  readonly key = 'agregador'
  readonly name = 'Agregador'
  readonly channel: BankChannel = 'AGREGADOR'
}
