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

/**
 * Credenciais por loja (BYOC). Quando passadas, sobrepõem as env da plataforma —
 * assim cada tenant envia pelo SEU número/token. Sem creds, cai nas env (uso
 * de plataforma / MASTER).
 */
export interface MetaCreds {
  phoneNumberId: string
  accessToken:   string
  apiVersion?:   string
}

class MetaWhatsAppService {
  private resolve(creds?: MetaCreds) {
    return {
      apiVersion:    creds?.apiVersion    || process.env.META_API_VERSION   || 'v19.0',
      phoneNumberId: creds?.phoneNumberId || process.env.META_PHONE_NUMBER_ID || '',
      accessToken:   creds?.accessToken   || process.env.META_WHATSAPP_TOKEN  || '',
    }
  }

  private async request(body: unknown, creds?: MetaCreds): Promise<MetaApiResponse> {
    const c = this.resolve(creds)
    if (!c.phoneNumberId || !c.accessToken) {
      throw new Error('WhatsApp não configurado (phoneNumberId/accessToken ausentes).')
    }
    const res = await fetch(`https://graph.facebook.com/${c.apiVersion}/${c.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${c.accessToken}`,
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

  async sendTemplate({ to, templateName, languageCode = 'pt_BR', bodyParams = [], headerImageUrl }: SendTemplateParams, creds?: MetaCreds) {
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

    return this.request(body, creds)
  }

  async sendText({ to, text }: SendTextParams, creds?: MetaCreds) {
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to.replace(/\D/g, ''),
      type: 'text',
      text: { body: text, preview_url: false },
    }

    return this.request(body, creds)
  }

  async getMessageStatus(messageId: string, creds?: MetaCreds) {
    const c = this.resolve(creds)
    const url = `https://graph.facebook.com/${c.apiVersion}/${messageId}`
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${c.accessToken}` },
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
