// Utilitários dos formulários do site (máscaras, rastreio de campanha, envio).

export function phoneMask(value: string) {
  const d = value.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function moneyMask(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  return digits ? (Number(digits) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : ''
}

export function todayIso() {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 10)
}

function tracking() {
  const url = new URL(window.location.href)
  return {
    pageUrl: url.href,
    utmSource: url.searchParams.get('utm_source') ?? '',
    utmMedium: url.searchParams.get('utm_medium') ?? '',
    utmCampaign: url.searchParams.get('utm_campaign') ?? '',
  }
}

export type SubmitResult = { ok: true; protocol: string | null } | { ok: false; error: string }

export async function submitSiteLead(apiUrl: string, payload: Record<string, unknown>): Promise<SubmitResult> {
  try {
    const res = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, ...tracking() }) })
    const j = await res.json().catch(() => ({})) as { error?: string; protocol?: string | null }
    return res.ok ? { ok: true, protocol: j.protocol ?? null } : { ok: false, error: j.error ?? 'Não foi possível enviar agora.' }
  } catch {
    return { ok: false, error: 'Sem conexão. Tente novamente ou fale pelo WhatsApp.' }
  }
}

/** Campo-isca: invisível para pessoas, robôs preenchem. */
export const HONEYPOT_STYLE = { position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' } as const
