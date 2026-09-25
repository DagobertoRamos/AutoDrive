'use client'
/* eslint-disable @next/next/no-img-element -- miniaturas do estoque */

// Peças visuais da Central de Publicações (padrão AutoDrive: discreto, textos curtos).
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, Car, PlugZap, Rocket } from 'lucide-react'
import { cn } from '@/lib/utils'

export type Tone = 'neutral' | 'info' | 'progress' | 'success' | 'warning' | 'danger' | 'muted'

const TONE: Record<Tone, string> = {
  neutral: 'bg-gray-50 text-gray-700 border-gray-200',
  info: 'bg-sky-50 text-sky-700 border-sky-200',
  progress: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  success: 'bg-green-50 text-green-700 border-green-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
  muted: 'bg-gray-100 text-gray-500 border-gray-200',
}
const DOT: Record<Tone, string> = {
  neutral: 'bg-gray-400', info: 'bg-sky-500', progress: 'bg-indigo-500 animate-pulse', success: 'bg-green-500',
  warning: 'bg-amber-500', danger: 'bg-red-500', muted: 'bg-gray-300',
}

export function StatusPill({ tone, label, className }: { tone: Tone; label: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium', TONE[tone], className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', DOT[tone])} aria-hidden />
      {label}
    </span>
  )
}

export const STATUS_TONE: Record<string, Tone> = {
  RASCUNHO: 'neutral', PRONTO: 'neutral', AGENDADO: 'info', NA_FILA: 'progress', ENVIANDO: 'progress', EM_ANALISE: 'progress',
  PUBLICADO: 'success', ATUALIZACAO_PENDENTE: 'progress', PAUSADO: 'warning', REMOCAO_PENDENTE: 'progress', REMOVIDO: 'muted',
  REJEITADO: 'danger', FALHA: 'danger', ACAO_MANUAL: 'warning',
}
export const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: 'Rascunho', PRONTO: 'Pronto', AGENDADO: 'Agendado', NA_FILA: 'Na fila', ENVIANDO: 'Enviando', EM_ANALISE: 'Em análise',
  PUBLICADO: 'Publicado', ATUALIZACAO_PENDENTE: 'Atualização pendente', PAUSADO: 'Pausado', REMOCAO_PENDENTE: 'Remoção pendente',
  REMOVIDO: 'Removido', REJEITADO: 'Rejeitado', FALHA: 'Falha', ACAO_MANUAL: 'Ação manual',
}

const TABS = [
  { href: '/marketing/publicacoes', label: 'Publicações', icon: Rocket },
  { href: '/marketing/calendario', label: 'Calendário', icon: CalendarDays },
  { href: '/marketing/canais', label: 'Canais conectados', icon: PlugZap },
]

/** Abas das três áreas da Central. */
export function PubTabs() {
  const pathname = usePathname() ?? ''
  return (
    <nav aria-label="Central de Publicações" className="-mx-1 flex gap-1 overflow-x-auto border-b border-gray-200 px-1">
      {TABS.map((t) => {
        const active = pathname === t.href || (t.href === '/marketing/publicacoes' && pathname.startsWith('/marketing/publicacoes/'))
        return (
          <Link key={t.href} href={t.href} aria-current={active ? 'page' : undefined}
            className={cn('inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 rounded-t', active ? 'border-brand-700 text-brand-800' : 'border-transparent text-gray-500 hover:text-gray-800')}>
            <t.icon size={15} />{t.label}
          </Link>
        )
      })}
    </nav>
  )
}

/** Sigla do canal (sem logotipos de terceiros). */
const INITIALS: Record<string, string> = {
  SITE: 'SI', WEBMOTORS: 'WM', OLX: 'OLX', MERCADO_LIVRE: 'ML', CHAVES_NA_MAO: 'CM', META_PAGE: 'FB', INSTAGRAM: 'IG', META_CATALOGO: 'CT', MANUAL_SOCIAL: 'MN',
}
export function ChannelMark({ channel, className }: { channel: string; className?: string }) {
  return <span className={cn('inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-gray-200 bg-white px-1 text-[10px] font-bold tracking-tight text-gray-600', className)} aria-hidden>{INITIALS[channel] ?? channel.slice(0, 2)}</span>
}

export function Thumb({ src, className }: { src: string | null | undefined; className?: string }) {
  return (
    <div className={cn('shrink-0 overflow-hidden rounded-lg bg-gray-100', className)}>
      {src ? <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" /> : <div className="flex h-full w-full items-center justify-center text-gray-300"><Car size={18} /></div>}
    </div>
  )
}

export const money = (v: number | null | undefined) => (v == null ? 'Consulte' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }))

export function ago(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const ms = Date.now() - new Date(d).getTime()
  if (ms < 60_000) return 'agora'
  const m = Math.round(ms / 60_000); if (m < 60) return `há ${m} min`
  const h = Math.round(m / 60); if (h < 48) return `há ${h} h`
  return new Date(d).toLocaleDateString('pt-BR')
}

export function when(d: string | Date | null | undefined, tz?: string): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/** fetch JSON com credenciais e erro legível. */
export async function api<T = any>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = await fetch(url, {
    credentials: 'include', ...init,
    headers: { ...(init?.json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(init?.headers ?? {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j?.success === false) throw new Error(j?.error ?? `Falha (${r.status}).`)
  return j as T
}

export const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20'

export function Drawer({ open, onClose, title, subtitle, children, wide }: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode; wide?: boolean }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose} onKeyDown={(e) => { if (e.key === 'Escape') onClose() }} role="presentation">
      <div role="dialog" aria-modal="true" aria-label={title} className={cn('flex h-full w-full flex-col bg-white shadow-2xl', wide ? 'max-w-3xl' : 'max-w-xl')} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0"><h2 className="truncate text-lg font-bold text-gray-900">{title}</h2>{subtitle && <p className="truncate text-xs text-gray-500">{subtitle}</p>}</div>
          <button autoFocus onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600" aria-label="Fechar">Fechar</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-500">{children}</p>
}

export function ErrorNote({ message, hint }: { message: string; hint?: string | null }) {
  return (
    <div role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
      <p className="font-medium">{message}</p>
      {hint && <p className="mt-0.5 text-red-600/90">Como resolver: {hint}</p>}
    </div>
  )
}
