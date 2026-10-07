'use client'

// =============================================================================
// Peças comuns do F&I (painel). Reaproveita o design system do Centro Financeiro.
// Status SEMPRE com ícone + texto + cor (acessível para quem não distingue cores).
// =============================================================================

import type { ReactNode } from 'react'
import {
  AlertTriangle, Ban, Check, CheckCheck, Circle, Clock, FileText, Hourglass, Lock, PenLine, RefreshCw, Search, Send, Wallet, X,
} from 'lucide-react'

export { api, brl, dateBR, PageHeader, EmptyState, inputClass, smallInputClass, iconBtn, Toggle } from '@/components/finance/center/config/ui'

// Acima do botão flutuante do Assistente (z-9998), para o rodapé não ficar coberto.
const LAYER = 'z-[9999]'

export type Tone = 'neutral' | 'info' | 'progress' | 'success' | 'warning' | 'danger'

const TONE_CLS: Record<Tone, string> = {
  neutral: 'bg-gray-100 text-gray-700 ring-gray-200',
  info: 'bg-blue-50 text-blue-700 ring-blue-200',
  progress: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  success: 'bg-green-50 text-green-700 ring-green-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
}

const ICONS: Record<string, typeof Circle> = {
  circle: Circle, clock: Clock, search: Search, check: Check, 'check-double': CheckCheck, x: X, alert: AlertTriangle,
  ban: Ban, send: Send, hourglass: Hourglass, file: FileText, pen: PenLine, lock: Lock, wallet: Wallet, refresh: RefreshCw,
}

export interface StatusMetaLike { label: string; tone: string; icon?: string }

export function StatusBadge({ meta, size = 'sm' }: { meta: StatusMetaLike | null | undefined; size?: 'sm' | 'md' }) {
  if (!meta) return null
  const tone = (meta.tone in TONE_CLS ? meta.tone : 'neutral') as Tone
  const Icon = ICONS[meta.icon ?? ''] ?? (tone === 'success' ? Check : tone === 'danger' ? X : tone === 'warning' ? AlertTriangle : Circle)
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full font-medium ring-1 ring-inset ${TONE_CLS[tone]} ${size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[11px]'}`}>
      <Icon size={size === 'md' ? 13 : 11} aria-hidden />
      {meta.label}
    </span>
  )
}

export function toneText(tone: string): string {
  return ({ success: 'text-green-700', danger: 'text-red-700', warning: 'text-amber-700', info: 'text-blue-700', progress: 'text-indigo-700' } as Record<string, string>)[tone] ?? 'text-gray-700'
}

export const btnPrimary = 'inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50'
export const btnSecondary = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50'
export const btnDanger = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3.5 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50'
export const btnLink = 'text-sm font-medium text-brand-700 hover:underline'

export const pct = (n: number | null | undefined, digits = 2) => (n == null ? '—' : `${n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`)
export const brlOrDash = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
export const dateTimeBR = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
export const timeBR = (s: string | null | undefined) => (s ? new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—')

/** Uma chave por clique — o servidor ignora a repetição (duplo clique não duplica). */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
}

/** Bloco com título discreto, para separar seções sem virar "card" à toa. */
export function Section({ title, actions, children, hint }: { title: string; actions?: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">{title}{hint}</h2>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

/** Painel lateral (detalhes sem tirar o usuário da tela). */
export function Drawer({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className={`fixed inset-0 ${LAYER} flex justify-end bg-black/30`} onMouseDown={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100" aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <div className={`fixed inset-0 ${LAYER} flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4`} onMouseDown={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className={`flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100" aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function Alert({ tone = 'warning', children }: { tone?: 'warning' | 'danger' | 'info' | 'success'; children: ReactNode }) {
  const cls = { warning: 'border-amber-200 bg-amber-50 text-amber-900', danger: 'border-red-200 bg-red-50 text-red-800', info: 'border-blue-200 bg-blue-50 text-blue-900', success: 'border-green-200 bg-green-50 text-green-900' }[tone]
  return <div className={`rounded-lg border px-3 py-2 text-sm ${cls}`} role={tone === 'danger' ? 'alert' : 'status'}>{children}</div>
}
