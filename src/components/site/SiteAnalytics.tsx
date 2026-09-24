'use client'

// Contador de visitas próprio do site (primeira parte, anônimo): id aleatório
// de visitante no navegador, sem IP nem dados pessoais. Porta do SiteAnalytics
// do dagobertoeasycar.
import { useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

function storedId(storage: Storage, key: string) {
  try {
    const existing = storage.getItem(key)
    if (existing) return { id: existing, created: false }
    const id = crypto.randomUUID()
    storage.setItem(key, id)
    return { id, created: true }
  } catch {
    return { id: crypto.randomUUID(), created: true }
  }
}

let firstHit = true

function send(url: string, event: 'pageview' | 'whatsapp_click') {
  const visitor = storedId(window.localStorage, 'ad_vid')
  const session = storedId(window.sessionStorage, 'ad_sid')
  const body = JSON.stringify({
    event, path: window.location.pathname, search: window.location.search,
    // Só a primeira página da sessão diz de onde a pessoa veio.
    referrer: firstHit ? document.referrer : '', landing: firstHit && event === 'pageview',
    visitorId: visitor.id, sessionId: session.id, isNew: visitor.created,
  })
  if (event === 'pageview') firstHit = false
  try { if (navigator.sendBeacon?.(url, new Blob([body], { type: 'application/json' }))) return } catch { /* cai no fetch */ }
  fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => undefined)
}

export function SiteAnalytics({ trackUrl }: { trackUrl: string }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const last = useRef('')

  useEffect(() => {
    const key = `${pathname}?${searchParams.toString()}`
    if (last.current === key) return
    last.current = key
    send(trackUrl, 'pageview')
  }, [pathname, searchParams, trackUrl])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (a && /(^|\/\/)(wa\.me|api\.whatsapp\.com)\//.test(a.href)) send(trackUrl, 'whatsapp_click')
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [trackUrl])

  return null
}
