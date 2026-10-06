'use client'

// Peças comuns das telas de configuração do Centro Financeiro (contas, plano de
// contas, centros de custo, orçamento) e da folha.

import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { HelpHint } from '@/components/ui/help-hint'
import type { GlossaryTerm } from '@/lib/glossary'

export const inputClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-500'
export const smallInputClass = 'w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
export const iconBtn = 'inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40'

export const brl = (n: number | null | undefined) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const dateBR = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—')
export const todayYmd = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
export const currentMonth = () => todayYmd().slice(0, 7)

export const COLOR_OPTIONS = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#4b5563']

/** fetch JSON com credenciais; devolve { ok, data, error }. */
export async function api<T = unknown>(url: string, init?: { method?: string; body?: unknown }): Promise<{ ok: boolean; data: T | null; error: string | null; json: Record<string, unknown> | null }> {
  try {
    const res = await fetch(url, {
      method: init?.method ?? 'GET',
      credentials: 'include',
      headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
    const json = await res.json().catch(() => null)
    if (!res.ok || json?.success === false) return { ok: false, data: null, error: json?.error ?? 'Não foi possível concluir.', json }
    return { ok: true, data: (json?.data ?? null) as T, error: null, json }
  } catch {
    return { ok: false, data: null, error: 'Erro de rede.', json: null }
  }
}

export function PageHeader({ title, subtitle, actions, helpTerm, helpText }: { title: string; subtitle?: ReactNode; actions?: ReactNode; helpTerm?: GlossaryTerm; helpText?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="flex items-center gap-1.5 text-xl font-bold text-gray-900">{title}{(helpTerm || helpText) && <HelpHint term={helpTerm} text={helpText} size={15} />}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        className={`flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
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

export function Toggle({ checked, onChange, label, helpTerm, helpText }: { checked: boolean; onChange: (v: boolean) => void; label: string; helpTerm?: GlossaryTerm; helpText?: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
      <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
      {(helpTerm || helpText) && <HelpHint term={helpTerm} text={helpText} size={12} />}
    </label>
  )
}

export function ColorPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => onChange(null)} className={`h-7 w-7 rounded-full border-2 bg-white text-[10px] text-gray-400 ${!value ? 'border-gray-700' : 'border-gray-200'}`} aria-label="Sem cor">—</button>
      {COLOR_OPTIONS.map((c) => (
        <button key={c} type="button" onClick={() => onChange(c)} className={`h-7 w-7 rounded-full border-2 ${value === c ? 'border-gray-900' : 'border-transparent'}`} style={{ backgroundColor: c }} aria-label={c} />
      ))}
    </div>
  )
}

export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'green' | 'amber' | 'red' | 'blue' }) {
  const cls = { gray: 'bg-gray-100 text-gray-600', green: 'bg-green-100 text-green-700', amber: 'bg-amber-100 text-amber-700', red: 'bg-red-100 text-red-700', blue: 'bg-blue-100 text-blue-700' }[tone]
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>
}

export function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="py-14 text-center">
      <div className="mx-auto mb-2 flex justify-center text-gray-300">{icon}</div>
      <p className="text-sm text-gray-400">{text}</p>
    </div>
  )
}
