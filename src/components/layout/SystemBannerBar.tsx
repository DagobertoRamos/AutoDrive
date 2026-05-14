'use client'

// =============================================================================
// SystemBannerBar — AutoDrive
//
// Exibe avisos do MASTER (InternalNotice) como banner no topo do dashboard.
// Aparece abaixo do ImpersonationBanner e acima do conteúdo principal.
//
// • Busca avisos do tipo BANNER ativos para o usuário atual
// • Usuário pode dispensar avisos dispensáveis (persiste no servidor)
// • Avisos required=true exigem confirmação via botão "Confirmar ciência"
// • Máximo de 2 banners exibidos ao mesmo tempo
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { X, AlertTriangle, Info, AlertCircle, Wrench, CreditCard, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Notice {
  id:          string
  title:       string
  message:     string
  type:        string  // INFO | WARNING | CRITICAL | MAINTENANCE | BILLING | RELEASE
  required:    boolean
  dismissible: boolean
  actionUrl?:  string | null
  actionLabel?: string | null
}

// ── Mapa de estilos ───────────────────────────────────────────────────────────

const TYPE_STYLES: Record<string, { bg: string; border: string; text: string; icon: React.ElementType }> = {
  INFO:        { bg: 'bg-blue-50',   border: 'border-blue-200',  text: 'text-blue-800',  icon: Info },
  WARNING:     { bg: 'bg-amber-50',  border: 'border-amber-200', text: 'text-amber-800', icon: AlertTriangle },
  CRITICAL:    { bg: 'bg-red-50',    border: 'border-red-200',   text: 'text-red-800',   icon: AlertCircle },
  MAINTENANCE: { bg: 'bg-slate-50',  border: 'border-slate-200', text: 'text-slate-800', icon: Wrench },
  BILLING:     { bg: 'bg-orange-50', border: 'border-orange-200',text: 'text-orange-800',icon: CreditCard },
  RELEASE:     { bg: 'bg-emerald-50',border: 'border-emerald-200',text: 'text-emerald-800',icon: Sparkles },
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function SystemBannerBar() {
  const [notices,    setNotices]    = useState<Notice[]>([])
  const [dismissed,  setDismissed]  = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState<string | null>(null)

  const fetchNotices = useCallback(async () => {
    try {
      const res  = await fetch('/api/internal-notices/active?displayType=BANNER', { credentials: 'include' })
      if (!res.ok) return
      const json = await res.json()
      setNotices(json.data ?? [])
    } catch {
      // silencioso — banner não deve travar UI
    }
  }, [])

  useEffect(() => {
    fetchNotices()
    // Re-fetch a cada 5 minutos
    const interval = setInterval(fetchNotices, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchNotices])

  const handleDismiss = async (id: string) => {
    setDismissed((prev) => new Set(prev).add(id))
    try {
      await fetch(`/api/internal-notices/${id}/read`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ dismissed: true }),
        credentials: 'include',
      })
    } catch { /* silencioso */ }
  }

  const handleConfirm = async (id: string) => {
    setConfirming(id)
    try {
      await fetch(`/api/internal-notices/${id}/read`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ confirmed: true, dismissed: true }),
        credentials: 'include',
      })
      setDismissed((prev) => new Set(prev).add(id))
    } catch { /* silencioso */ } finally {
      setConfirming(null)
    }
  }

  const visible = notices.filter((n) => !dismissed.has(n.id)).slice(0, 2)
  if (!visible.length) return null

  return (
    <div className="flex flex-col gap-0.5">
      {visible.map((notice) => {
        const style = TYPE_STYLES[notice.type] ?? TYPE_STYLES.INFO
        const Icon  = style.icon

        return (
          <div
            key={notice.id}
            className={cn(
              'border-b flex items-start gap-3 px-4 py-2.5 text-sm',
              style.bg, style.border, style.text,
            )}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />

            <div className="flex-1 min-w-0">
              <span className="font-semibold">{notice.title}:</span>{' '}
              <span className="opacity-90">{notice.message}</span>
              {notice.actionUrl && (
                <a
                  href={notice.actionUrl}
                  target={notice.actionUrl.startsWith('http') ? '_blank' : '_self'}
                  rel="noreferrer"
                  className="ml-2 underline font-medium opacity-80 hover:opacity-100"
                >
                  {notice.actionLabel ?? 'Saiba mais'}
                </a>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {notice.required && (
                <button
                  onClick={() => handleConfirm(notice.id)}
                  disabled={confirming === notice.id}
                  className={cn(
                    'rounded px-2 py-0.5 text-xs font-medium border',
                    'transition hover:opacity-80 disabled:opacity-60',
                    style.border,
                  )}
                >
                  {confirming === notice.id ? 'Salvando…' : 'Confirmar ciência'}
                </button>
              )}
              {notice.dismissible && !notice.required && (
                <button
                  onClick={() => handleDismiss(notice.id)}
                  aria-label="Fechar aviso"
                  className="rounded p-0.5 hover:bg-black/10 transition"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
