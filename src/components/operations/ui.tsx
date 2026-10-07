'use client'

// =============================================================================
// Peças visuais das operações veiculares: status, gaveta lateral, modal de
// ação, seção recolhível e estado vazio. Mesmo visual do resto do sistema.
// =============================================================================

import { useEffect, useState, type ReactNode } from 'react'
import { CheckCircle2, ChevronDown, X } from 'lucide-react'
import { HelpHint } from '@/components/ui/help-hint'
import { TONE_CLASSES, type Tone } from '@/lib/automotive/status-core'
import { opsHint, type OpsTerm } from '@/lib/glossary-ops'

export function StatusBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  const c = TONE_CLASSES[tone]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${c.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {children}
    </span>
  )
}

export function Hint({ term, size = 12 }: { term: OpsTerm; size?: number }) {
  return <HelpHint {...opsHint(term)} size={size} />
}

/** Linha "Rótulo ........ valor ✓" do card. */
export function StatusRow({ label, hint, value, ok, tone }: { label: string; hint?: OpsTerm; value: ReactNode; ok?: boolean; tone?: Tone }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="inline-flex items-center gap-1 text-gray-500">{label}{hint && <Hint term={hint} />}</span>
      <span className={`inline-flex items-center gap-1.5 text-right font-medium ${tone ? TONE_CLASSES[tone].text : 'text-gray-800'}`}>
        {value}
        {ok && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
      </span>
    </div>
  )
}

export function Drawer({ open, title, subtitle, onClose, children, footer }: { open: boolean; title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/40" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="flex h-full w-full animate-slide-in-right flex-col bg-gray-50 shadow-2xl sm:max-w-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">{children}</div>
        {footer && <div className="border-t border-gray-200 bg-white px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function Modal({ open, title, onClose, children, footer }: { open: boolean; title: ReactNode; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3 px-5 py-4">{children}</div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">{footer}</div>
      </div>
    </div>
  )
}

export function Section({ title, hint, count, defaultOpen = false, children, action }: { title: string; hint?: OpsTerm; count?: number | null; defaultOpen?: boolean; children: ReactNode; action?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <button onClick={() => setOpen((o) => !o)} className="flex flex-1 items-center gap-2 text-left">
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? '' : '-rotate-90'}`} />
          <span className="text-sm font-semibold text-gray-800">{title}</span>
          {hint && <Hint term={hint} />}
          {count != null && count > 0 && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">{count}</span>}
        </button>
        {action}
      </div>
      {open && <div className="border-t border-gray-100 px-4 py-3">{children}</div>}
    </div>
  )
}

export function EmptyState({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <p className="text-sm text-gray-500">{text}</p>
      {action}
    </div>
  )
}

export const btn = {
  primary: 'inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50',
  secondary: 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50',
  danger: 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50',
  link: 'text-sm font-medium text-brand-700 hover:underline',
}

export const input = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const x = new Date(d)
  return `${x.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${x.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}
export function fmtDate(d: string | Date | null | undefined): string {
  return d ? new Date(d).toLocaleDateString('pt-BR') : '—'
}
export function fmtBRL(n: number | null | undefined): string {
  return n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** POST JSON com mensagem amigável de erro. */
export async function postJson<T = unknown>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string; details?: any }> {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || j.success === false) return { ok: false, error: j.error ?? 'Não foi possível concluir agora.', details: j.details }
    return { ok: true, data: j.data as T }
  } catch {
    return { ok: false, error: 'Sem conexão. Tente novamente.' }
  }
}

export function ErrorLine({ text }: { text: string | null }) {
  if (!text) return null
  return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{text}</p>
}
