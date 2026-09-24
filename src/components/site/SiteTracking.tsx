'use client'

// Aviso de cookies + Pixel da Meta / tag do Google do site da loja. Só aparece
// se a loja configurou algum ID. PageView a cada navegação; clique em link do
// WhatsApp vira evento Contact.
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { readConsent, siteTrack, startTags, trackPageView, TRACKING_READY_EVENT, writeConsent, type Consent } from '@/lib/site/tracking-client'

export function SiteTracking({ pixelId, googleTagId, privacyHref }: { pixelId: string; googleTagId: string; privacyHref: string }) {
  const enabled = Boolean(pixelId || googleTagId)
  const pathname = usePathname()
  const [consent, setConsent] = useState<Consent>('unknown')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // setTimeout (não requestAnimationFrame): rAF fica parado em aba oculta.
    const t = setTimeout(() => setConsent(readConsent()), 0)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!enabled || consent !== 'accepted') return
    startTags(pixelId, googleTagId)
    trackPageView()
  }, [enabled, consent, pixelId, googleTagId, pathname])

  useEffect(() => {
    if (!enabled) return
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (a && /(^https:\/\/(wa\.me|api\.whatsapp\.com)\/)/.test(a.href)) siteTrack('Contact', { content_type: 'whatsapp' })
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [enabled])

  if (!enabled) return null
  const choose = (v: 'accepted' | 'rejected') => {
    writeConsent(v); setConsent(v); setOpen(false)
    // Recusou depois de aceitar: recarrega para descarregar os scripts.
    if (v === 'rejected' && window.__siteTracking) location.reload()
  }

  return (
    <>
      {(consent === 'unknown' || open) && (
        <section className="cookie-consent" role="dialog" aria-label="Preferências de cookies" aria-live="polite">
          <div>
            <strong>Privacidade e cookies</strong>
            <p>Com a sua autorização, usamos cookies de medição (Meta e Google) para entender as visitas e melhorar os anúncios. Não enviamos nome, telefone, e-mail ou CPF. <a href={privacyHref}>Política de Privacidade</a>.</p>
          </div>
          <div className="cookie-consent-actions">
            <button type="button" className="button button-outline" onClick={() => choose('rejected')}>Recusar</button>
            <button type="button" className="button" onClick={() => choose('accepted')}>Aceitar</button>
          </div>
        </section>
      )}
      {consent !== 'unknown' && !open && <button type="button" className="cookie-settings" onClick={() => setOpen(true)}>Cookies</button>}
    </>
  )
}

/** Marca a visualização de um carro (ViewContent / view_item). */
export function SiteTrackView({ id, name, value }: { id: string; name: string; value: number | null }) {
  useEffect(() => {
    const fire = () => siteTrack('ViewContent', { content_ids: [id], content_name: name, content_type: 'vehicle', value: value ?? undefined, currency: 'BRL' })
    // Tag já iniciada: dispara após o carregamento; senão, quando o visitante aceitar.
    const t = setTimeout(fire, 400)
    window.addEventListener(TRACKING_READY_EVENT, fire)
    return () => { clearTimeout(t); window.removeEventListener(TRACKING_READY_EVENT, fire) }
  }, [id, name, value])
  return null
}
