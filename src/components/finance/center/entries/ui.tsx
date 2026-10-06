'use client'

// Peças comuns das telas de contas a pagar/receber, recorrências e lançamento.

import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { RequiredMark } from '@/components/ui/field'

export const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-50 disabled:text-gray-500'
export const PAYMENT_METHODS = ['PIX', 'Transferência', 'Boleto', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito', 'Débito em conta', 'Cheque', 'Outro']

export const brl = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
/** Data gravada ao meio-dia UTC → dia civil sem cair no anterior. */
export const dt = (s: string | Date | null | undefined) => {
  if (!s) return '—'
  const iso = typeof s === 'string' ? s : s.toISOString()
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
export const todayYmd = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })

export function Field({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: ReactNode }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1 flex items-center gap-0.5 text-xs font-medium text-gray-700">{label}{required && <RequiredMark />}</span>
      {children}
    </label>
  )
}

export function Modal({ title, onClose, children, footer, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean | 'xl' }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className={cn('flex max-h-[95vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl', wide === 'xl' ? 'sm:max-w-6xl' : wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100" aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function ErrorLine({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p className="text-sm text-red-600">{children}</p>
}

export async function postJson<T = unknown>(url: string, body: unknown, method = 'POST'): Promise<{ ok: boolean; data: T & { error?: string } }> {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) })
  const data = (await r.json().catch(() => ({}))) as T & { error?: string }
  return { ok: r.ok, data }
}
