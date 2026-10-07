// =============================================================================
// Adapters MANUAIS: a loja faz no portal oficial (integradora RENAVE, emissor
// de NF-e, Detran/CDT) e registra aqui o protocolo ou o XML. Mantêm o mesmo
// contrato dos adapters por API, então o fluxo, a auditoria e as pendências
// são idênticos — trocar para integração automática não muda nenhuma tela.
// =============================================================================

import { ProviderError } from '../external-core'
import { parseNfeXml, parseCancelEvent } from '../nfe-xml-core'
import type { FiscalProvider, ManualInput, ProviderResult, RenaveProvider, TransferProvider } from './types'

function requireProtocol(m: ManualInput | undefined, what: string): string {
  const p = m?.protocol?.trim()
  if (!p) throw new ProviderError(`Informe o protocolo ${what}.`, 'MANUAL_PROTOCOL_REQUIRED', true, false)
  return p.slice(0, 80)
}

function confirmed(protocol: string, data?: Record<string, unknown>): ProviderResult {
  return { state: 'CONFIRMED', externalId: protocol, protocol, data }
}

export const manualRenave: RenaveProvider = {
  info: { id: 'MANUAL', label: 'Registro manual', mode: 'MANUAL', webhooks: false },
  async checkEligibility() { return null },
  async enterStock(_ctx, input) { return confirmed(requireProtocol(input.manual, 'da entrada'), { date: input.manual?.date ?? null }) },
  async confirmEntry(_ctx, externalId, manual) { return confirmed(manual?.protocol?.trim() || externalId) },
  async exitStock(_ctx, input) { return confirmed(requireProtocol(input.manual, 'da saída'), { date: input.manual?.date ?? null }) },
  async cancelEntry(_ctx, externalId, manual) { return { state: 'CANCELLED', externalId, protocol: manual?.protocol?.trim() || null } },
  async cancelExit(_ctx, externalId, manual) { return { state: 'CANCELLED', externalId, protocol: manual?.protocol?.trim() || null } },
  async getStock() { return null },
  async getStatus() { return null },
  async getDocuments() { return null },
  async getATPV() { return null },
  async consign(_ctx, input) { return confirmed(requireProtocol(input.manual, 'da consignação')) },
  async transferBetweenStores(_ctx, input) { return confirmed(requireProtocol(input.manual, 'da transferência')) },
}

export const manualFiscal: FiscalProvider = {
  info: { id: 'MANUAL', label: 'Nota emitida no emissor da loja (importar XML)', mode: 'MANUAL', webhooks: false },
  async emit(_ctx, input) {
    if (!input.xml?.trim()) throw new ProviderError('Envie o XML autorizado da nota.', 'MANUAL_XML_REQUIRED', true, false)
    const n = parseNfeXml(input.xml)
    if (n.statusCode !== '100' && n.statusCode !== '150') {
      return { state: 'REJECTED', errorCode: n.statusCode, errorMessage: n.statusText ?? 'Nota sem autorização' }
    }
    return { state: 'CONFIRMED', externalId: n.accessKey, protocol: n.protocol, data: { xml: input.xml, accessKey: n.accessKey ?? undefined, number: n.number ?? undefined, series: n.series ?? undefined } }
  },
  async status() { return null },
  async cancel(_ctx, reference, _reason, manual) {
    if (manual?.eventXml) {
      const ev = parseCancelEvent(manual.eventXml)
      if (!ev.ok) throw new ProviderError('O arquivo não é um cancelamento homologado.', 'MANUAL_CANCEL_INVALID', true, false)
      if (ev.accessKey && ev.accessKey !== reference) throw new ProviderError('O cancelamento é de outra nota.', 'MANUAL_CANCEL_OTHER_NOTE', true, false)
      return { state: 'CANCELLED', externalId: reference, protocol: ev.protocol }
    }
    return { state: 'CANCELLED', externalId: reference, protocol: requireProtocol({ protocol: manual?.protocol }, 'do cancelamento') }
  },
  async correct() { throw new ProviderError('Carta de correção: emita no emissor da loja.', 'NOT_SUPPORTED', true, false) },
  async downloadXml() { return null },
  async downloadPdf() { return null },
  async events() { return null },
}

export const manualTransfer: TransferProvider = {
  info: { id: 'MANUAL', label: 'Acompanhamento manual (Detran / despachante)', mode: 'MANUAL', webhooks: false },
  async startTransfer(_ctx, input) { return { state: 'CONFIRMED', externalId: input.manual?.protocol?.trim() || null, protocol: input.manual?.protocol?.trim() || null } },
  async recordStage(_ctx, externalId, stage, manual) { return { state: 'CONFIRMED', externalId, protocol: manual?.protocol?.trim() || null, data: { stage } } },
  async getStatus() { return null },
  async getATPV() { return null },
  async getSignatureStatus() { return null },
  async getInspectionStatus() { return null },
  async getDebts() { return null },
  async getFees() { return null },
  async getCRLV() { return null },
  async cancel(_ctx, externalId) { return { state: 'CANCELLED', externalId } },
}
