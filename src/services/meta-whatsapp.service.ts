// =============================================================================
// Meta WhatsApp Cloud API Service
// =============================================================================

interface SendTemplateParams {
  to: string
  templateName: string
  languageCode?: string
  bodyParams?: string[]
  headerImageUrl?: string
}

interface SendTextParams {
  to: string
  text: string
}

interface MetaApiResponse {
  messages?: Array<{ id: string }>
  error?: { message: string; code: number }
}

class MetaWhatsAppService {
  private get apiVersion() {
    return process.env.META_API_VERSION ?? 'v19.0'
  }
  private get phoneNumberId() {
    return process.env.META_PHONE_NUMBER_ID ?? ''
  }
  private get accessToken() {
    return process.env.META_WHATSAPP_TOKEN ?? ''
  }
  private get baseUrl() {
    return `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`
  }

  private async request(body: unknown): Promise<MetaApiResponse> {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const data = await res.json() as MetaApiResponse

    if (!res.ok) {
      throw new Error(`Meta API error: ${data.error?.message ?? 'Unknown error'} (code: ${data.error?.code})`)
    }

    return data
  }

  async sendTemplate({ to, templateName, languageCode = 'pt_BR', bodyParams = [], headerImageUrl }: SendTemplateParams) {
    const components: any[] = []

    if (headerImageUrl) {
      components.push({
        type: 'header',
        parameters: [{ type: 'image', image: { link: headerImageUrl } }],
      })
    }

    if (bodyParams.length > 0) {
      components.push({
        type: 'body',
        parameters: bodyParams.map(p => ({ type: 'text', text: p })),
      })
    }

    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to.replace(/\D/g, ''),
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: components.length > 0 ? components : undefined,
      },
    }

    return this.request(body)
  }

  async sendText({ to, text }: SendTextParams) {
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to.replace(/\D/g, ''),
      type: 'text',
      text: { body: text, preview_url: false },
    }

    return this.request(body)
  }

  async getMessageStatus(messageId: string) {
    const url = `https://graph.facebook.com/${this.apiVersion}/${messageId}`
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${this.accessToken}` },
    })
    return res.json()
  }
}

// Exportar instância singleton e também uma factory para provedores futuros
export const metaWhatsApp = new MetaWhatsAppService()

// =============================================================================
// Interface de provedor genérico (preparado para Zenvia, Twilio, etc.)
// =============================================================================
export interface WhatsAppProvider {
  sendTemplate(params: SendTemplateParams): Promise<MetaApiResponse>
  sendText(params: SendTextParams): Promise<MetaApiResponse>
  getMessageStatus(messageId: string): Promise<unknown>
}

export function getWhatsAppProvider(): WhatsAppProvider {
  // Futuramente: ler o provedor ativo das configurações e retornar a instância correta
  return metaWhatsApp
}
