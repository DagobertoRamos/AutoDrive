'use client'

// =============================================================================
// QualityScoreWatcher — pop-up de aviso de score de qualidade.
// Monta no DashboardShell. Poll leve a cada 5 min no endpoint /api/quality/popup.
// Exibe um balão quando o score cai abaixo do limiar de popup.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ShieldAlert, X, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const POLL_MS = 5 * 60 * 1000 // 5 minutos

interface Restriction {
  action: string
  label:  string
  message: string
}

interface PopupData {
  total:        number
  popup:        boolean
  warn:         boolean
  enabled:      boolean
  restrictions: Restriction[]
}

export default function QualityScoreWatcher() {
  const [data, setData] = useState<PopupData | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [lastScore, setLastScore] = useState<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const poll = useCallback(async () => {
    const r = await fetch('/api/quality/popup', { credentials: 'include' }).then(x => x.json()).catch(() => null)
    if (!r?.success || !r.data?.enabled) return
    const d: PopupData = r.data
    // Reabre o popup se o score piorou desde a última vez.
    if (lastScore !== null && d.total < lastScore) setDismissed(false)
    setLastScore(d.total)
    setData(d)
  }, [lastScore])

  useEffect(() => {
    void poll()
    timerRef.current = setInterval(() => void poll(), POLL_MS)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [poll])

  if (!data?.enabled || (!data.popup && !data.warn) || dismissed) return null

  const activeBlocks = data.restrictions.filter(r => r.action.startsWith('BLOCK'))
  const score = data.total

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      className="fixed bottom-4 right-4 z-[9999] w-full max-w-sm animate-in slide-in-from-bottom-4 fade-in duration-300"
    >
      <div className={cn(
        'rounded-xl border shadow-xl p-4 space-y-3',
        score <= -40
          ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950'
          : score <= -20
          ? 'border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-950'
          : 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950'
      )}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} className={score <= -40 ? 'text-red-600' : score <= -20 ? 'text-orange-600' : 'text-amber-600'} />
            <p className={cn('text-sm font-bold', score <= -40 ? 'text-red-800 dark:text-red-200' : score <= -20 ? 'text-orange-800 dark:text-orange-200' : 'text-amber-800 dark:text-amber-200')}>
              Score de Qualidade: <span className="tabular-nums">{score}</span>
            </p>
          </div>
          <button onClick={() => setDismissed(true)} className="shrink-0 rounded p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            <X size={14} />
          </button>
        </div>

        {activeBlocks.length > 0 && (
          <div className="space-y-1">
            {activeBlocks.map(r => (
              <div key={r.action} className="flex items-center gap-1.5 text-xs text-red-700 dark:text-red-300">
                <AlertTriangle size={11} />
                <span className="font-semibold">{r.label}</span>
              </div>
            ))}
          </div>
        )}

        <p className={cn('text-xs', score <= -40 ? 'text-red-700 dark:text-red-300' : score <= -20 ? 'text-orange-700 dark:text-orange-300' : 'text-amber-700 dark:text-amber-300')}>
          Resolva as pendências e atualize seus leads para recuperar pontos.
        </p>

        <div className="flex items-center gap-2 pt-1">
          <Link href="/vendedor-da-vez/qualidade" onClick={() => setDismissed(true)} className={cn('flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white', score <= -40 ? 'bg-red-600 hover:bg-red-700' : score <= -20 ? 'bg-orange-600 hover:bg-orange-700' : 'bg-amber-600 hover:bg-amber-700')}>
            <ExternalLink size={11} />Ver meu score
          </Link>
          <button onClick={() => setDismissed(true)} className="text-xs text-gray-500 hover:underline dark:text-gray-400">Dispensar</button>
        </div>
      </div>
    </div>
  )
}
