// =============================================================================
// Caixa de Entrada omnichannel — regras PURAS (testadas; também usadas na tela).
// =============================================================================

export type ConversationChannel = 'WHATSAPP' | 'INSTAGRAM' | 'MESSENGER' | 'OLX' | 'MERCADO_LIVRE' | 'SITE_CHAT'

/** O que cada canal permite na conversa. Canal sem resposta integrada não finge que tem. */
export const CONVERSATION_CHANNELS: Record<ConversationChannel, { label: string; color: string; canReply: boolean; replyWindowHours: number | null }> = {
  WHATSAPP: { label: 'WhatsApp', color: '#25d366', canReply: true, replyWindowHours: 24 },
  INSTAGRAM: { label: 'Instagram', color: '#e1306c', canReply: false, replyWindowHours: 24 },
  MESSENGER: { label: 'Messenger', color: '#0084ff', canReply: false, replyWindowHours: 24 },
  OLX: { label: 'OLX', color: '#6e0ad6', canReply: false, replyWindowHours: null },
  MERCADO_LIVRE: { label: 'Mercado Livre', color: '#f5c400', canReply: false, replyWindowHours: null },
  SITE_CHAT: { label: 'Chat do site', color: '#0f766e', canReply: false, replyWindowHours: null },
}

export const channelInfo = (c: string) => CONVERSATION_CHANNELS[c as ConversationChannel] ?? { label: c, color: '#64748b', canReply: false, replyWindowHours: null }

export type ReplyCheck = { ok: true } | { ok: false; reason: 'CHANNEL' | 'WINDOW' | 'NO_INBOUND'; message: string }

/** Pode responder agora? (WhatsApp: só até 24 h depois da última mensagem do cliente.) */
export function canReplyNow(channel: string, lastInboundAt: Date | string | null, now = new Date()): ReplyCheck {
  const info = channelInfo(channel)
  if (!info.canReply) return { ok: false, reason: 'CHANNEL', message: 'Este canal ainda não permite resposta integrada.' }
  if (info.replyWindowHours == null) return { ok: true }
  if (!lastInboundAt) return { ok: false, reason: 'NO_INBOUND', message: 'O cliente ainda não mandou mensagem por este canal.' }
  const last = new Date(lastInboundAt).getTime()
  if (now.getTime() - last > info.replyWindowHours * 3_600_000) {
    return { ok: false, reason: 'WINDOW', message: `Passaram mais de ${info.replyWindowHours} h da última mensagem do cliente. Pelas regras do WhatsApp, só um modelo aprovado pode ser enviado agora.` }
  }
  return { ok: true }
}

export function messagePreview(text: string | null | undefined, max = 140): string {
  const t = (text ?? '').replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

const o = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** Mensagem do webhook do WhatsApp → tipo + texto legível. */
export function whatsappMessageText(msg: Record<string, unknown>): { type: string; text: string } {
  const t = str(msg.type)
  switch (t) {
    case 'text': return { type: 'TEXT', text: str(o(msg.text).body) }
    case 'image': return { type: 'IMAGE', text: str(o(msg.image).caption) || '[Imagem]' }
    case 'video': return { type: 'VIDEO', text: str(o(msg.video).caption) || '[Vídeo]' }
    case 'document': return { type: 'DOCUMENT', text: str(o(msg.document).caption) || `[Documento${str(o(msg.document).filename) ? `: ${str(o(msg.document).filename)}` : ''}]` }
    case 'audio': case 'voice': return { type: 'AUDIO', text: '[Áudio]' }
    case 'sticker': return { type: 'OTHER', text: '[Figurinha]' }
    case 'location': {
      const l = o(msg.location)
      return { type: 'LOCATION', text: `[Localização${str(l.name) ? `: ${str(l.name)}` : ''}${l.latitude != null ? ` ${l.latitude},${l.longitude}` : ''}]` }
    }
    case 'button': return { type: 'TEXT', text: str(o(msg.button).text) }
    case 'interactive': {
      const i = o(msg.interactive)
      return { type: 'TEXT', text: str(o(i.button_reply).title) || str(o(i.list_reply).title) || '[Resposta]' }
    }
    case 'contacts': return { type: 'OTHER', text: '[Contato compartilhado]' }
    case 'reaction': return { type: 'OTHER', text: `[Reação ${str(o(msg.reaction).emoji)}]` }
    default: return { type: 'OTHER', text: '[Mensagem não suportada]' }
  }
}

/** Número do cliente para wa.me / telefone (só dígitos, com DDI 55). */
export function waDigits(phoneOrWaId: string | null | undefined): string {
  let d = (phoneOrWaId ?? '').replace(/\D/g, '')
  if (d.length === 10 || d.length === 11) d = `55${d}`
  return d
}
