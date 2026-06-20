// =============================================================================
// whatsapp/adapters/twilio.ts — Twilio WhatsApp (API REST).
// POST Accounts/{Sid}/Messages.json com Basic Auth (Sid:Token), From/To/Body.
// =============================================================================

import type { WhatsappAdapter } from '../types'

const waNumber = (n: string) => (n.startsWith('whatsapp:') ? n : `whatsapp:+${n.replace(/[^\d]/g, '')}`)

export const twilioAdapter: WhatsappAdapter = {
  kind: 'TWILIO',
  label: 'Twilio (WhatsApp)',
  fields: [
    { key: 'accountSid', label: 'Account SID', required: true, placeholder: 'ACxxxxxxxx...' },
    { key: 'authToken',  label: 'Auth Token', secret: true, required: true },
    { key: 'from',       label: 'Número de origem (From)', required: true, placeholder: '+5511999999999', help: 'Número WhatsApp habilitado na Twilio' },
  ],
  async sendText({ to, text }, creds) {
    if (!creds.accountSid || !creds.authToken || !creds.from) {
      throw new Error('Twilio não configurado (accountSid/authToken/from ausentes).')
    }
    const url = `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`
    const body = new URLSearchParams({ From: waNumber(creds.from), To: waNumber(to), Body: text })
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    })
    const data = await res.json().catch(() => ({})) as { sid?: string; message?: string; code?: number }
    if (!res.ok) throw new Error(`Twilio API error: ${data.message ?? 'desconhecido'} (code: ${data.code ?? res.status})`)
    return { id: data.sid ?? null }
  },
}
