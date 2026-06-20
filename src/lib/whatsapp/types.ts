// =============================================================================
// whatsapp/types.ts — contrato de ADAPTADORES de WhatsApp (provider-agnóstico).
// Cada loja escolhe um provedor (BYOC) e informa as credenciais dele. Para
// adicionar um novo provedor (Zenvia, 360dialog, Twilio, ...), basta criar um
// adapter que implemente WhatsappAdapter e registrá-lo em registry.ts.
// =============================================================================

export type WhatsappProviderKind = 'META' | 'TWILIO' | 'ZENVIA'

/** Credenciais da loja para o provedor (chaves dependem do provedor). */
export type WhatsappCreds = Record<string, string>

export interface SendResult {
  id?: string | null
}

/** Descreve um campo de credencial — usado pela UI para montar o formulário. */
export interface ProviderField {
  key:          string
  label:        string
  secret?:      boolean   // mascara na UI e nunca retorna o valor
  required?:    boolean
  placeholder?: string
  help?:        string
}

export interface WhatsappAdapter {
  kind:   WhatsappProviderKind
  label:  string
  fields: ProviderField[]
  /** Envia texto simples. Lança em erro (tratado como best-effort pelo caller). */
  sendText(args: { to: string; text: string }, creds: WhatsappCreds): Promise<SendResult>
}
