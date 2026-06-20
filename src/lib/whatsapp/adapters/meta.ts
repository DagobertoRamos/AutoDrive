// =============================================================================
// whatsapp/adapters/meta.ts — Meta WhatsApp Cloud API (oficial).
// Reusa o meta-whatsapp.service (que aceita credenciais por chamada).
// =============================================================================

import { metaWhatsApp } from '@/services/meta-whatsapp.service'
import type { WhatsappAdapter } from '../types'

export const metaAdapter: WhatsappAdapter = {
  kind: 'META',
  label: 'Meta WhatsApp Cloud API (oficial)',
  fields: [
    { key: 'phoneNumberId',     label: 'Phone Number ID', required: true, placeholder: '123456789012345' },
    { key: 'accessToken',       label: 'Access Token (permanente)', secret: true, required: true, placeholder: 'EAAxxxxxxx...' },
    { key: 'businessAccountId', label: 'WhatsApp Business Account ID', placeholder: '987654321098765' },
    { key: 'apiVersion',        label: 'Versão da API', placeholder: 'v19.0', help: 'Opcional — padrão v19.0' },
    { key: 'webhookVerifyToken', label: 'Webhook Verify Token', secret: true, help: 'Opcional — para receber status/respostas' },
  ],
  async sendText({ to, text }, creds) {
    const res = await metaWhatsApp.sendText({ to, text }, {
      phoneNumberId: creds.phoneNumberId,
      accessToken:   creds.accessToken,
      apiVersion:    creds.apiVersion || undefined,
    })
    return { id: res.messages?.[0]?.id ?? null }
  },
}
