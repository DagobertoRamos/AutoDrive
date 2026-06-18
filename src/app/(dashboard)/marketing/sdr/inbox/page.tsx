'use client'

// =============================================================================
// Marketing > Mesa SDR > Caixa de Leads — inbox operacional.
// Consome /api/marketing/sdr/inbox ({available, mine}). Ações: assumir (claim,
// tanque de tubarão), liberar (release) e converter (convert). + novo lead.
// Gate: marketing.sdr (claim exige marketing.leads.claim).
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Inbox, Hand, RefreshCw, Plus, X, Save, CheckCircle2, Undo2, Phone, Mail } from 'lucide-react'
import { cn } from '@/lib/utils'

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const dt = (s: string | null) => (s ? new Date(s).toLocaleString('pt-BR') : '—')

interface Lead { id: string; name: string | null; phone: string | null; email: string | null; source: string | null; status: string; createdAt: string; lastContactAt: string | null }
interface NewForm { name: string; phone: string; email: string; source: string }
const emptyNew: NewForm = { name: '', phone: '', email: '', source: '' }

export default function SdrInboxPage() {
  const [available, setAvailable] = useState<Lead[]>([])
  const [mine, setMine] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState<NewForm>(emptyNew)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof NewForm>(k: K, v: NewForm[K]) => setForm((f) => ({ ...f, [k]: v }))

  const flash = (msg: string, ok: boolean) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500) }

  const load = useCallback(async () => {
    setLoading(true); setDenied(false)
    try {
      const res = await fetch('/api/marketing/sdr/inbox', { credentials: 'include' })
      if (res.status === 403) { setDenied(true); return }
      const j = await res.json(); setAvailable(j?.data?.available ?? []); setMine(j?.data?.mine ?? [])
    } catch { /* noop */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const act = async (id: string, path: string, body?: unknown, okMsg?: string) => {
    setBusy(id)
    try {
      const res = await fetch(`/api/marketing/sdr/leads/${id}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: body ? JSON.stringify(body) : undefined })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { flash(j?.error ?? 'Não foi possível concluir.', false) } else { flash(okMsg ?? 'Feito.', true) }
      await load()
    } catch { flash('Erro de rede.', false) } finally { setBusy(null) }
  }
  const claim = (l: Lead) => act(l.id, 'claim', undefined, 'Lead assumido!')
  const release = (l: Lead) => act(l.id, 'release', { recycle: true }, 'Lead devolvido à fila.')
  const convert = (l: Lead) => act(l.id, 'convert', {}, 'Lead convertido!')

  const createLead = async () => {
    if (!form.name && !form.phone && !form.email) { setError('Informe nome, telefone ou e-mail.'); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/marketing/sdr/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ name: form.name || null, phone: form.phone || null, email: form.email || null, source: form.source || null }) })
      const j = await res.json(); if (!res.ok) { setError(j?.error ?? 'Erro ao criar.'); return }
      setModal(false); setForm(emptyNew); await load()
    } catch { setError('Erro de rede.') } finally { setSaving(false) }
  }

  const card = (l: Lead) => (
    <div key={l.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-gray-900">{l.name || l.phone || l.email || 'Lead sem nome'}</p>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
            {l.phone && <span className="inline-flex items-center gap-1"><Phone size={11} />{l.phone}</span>}
            {l.email && <span className="inline-flex items-center gap-1"><Mail size={11} />{l.email}</span>}
          </div>
        </div>
        {l.source && <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 text-[10px] uppercase text-gray-500">{l.source}</span>}
      </div>
      <p className="mt-1 text-[11px] text-gray-400">Criado {dt(l.createdAt)}</p>
      <div className="mt-2 flex gap-2">
        {l.status === 'NEW' || l.status === 'RECYCLED' ? (
          <button onClick={() => claim(l)} disabled={busy === l.id} className="btn-primary flex-1 justify-center text-xs"><Hand size={13} />{busy === l.id ? '...' : 'Assumir'}</button>
        ) : <>
          <button onClick={() => convert(l)} disabled={busy === l.id} className="btn-primary flex-1 justify-center text-xs"><CheckCircle2 size={13} />Converter</button>
          <button onClick={() => release(l)} disabled={busy === l.id} className="btn-secondary justify-center text-xs"><Undo2 size={13} />Liberar</button>
        </>}
      </div>
    </div>
  )

  if (denied) return <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Seu perfil não tem acesso à Mesa SDR.</div>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Inbox size={20} className="text-brand-600" />Caixa de Leads</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${available.length} disponível(is) · ${mine.length} em atendimento`}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
          <button onClick={() => { setForm(emptyNew); setError(null); setModal(true) }} className="btn-primary text-sm"><Plus size={15} />Novo lead</button>
        </div>
      </div>

      {toast && <div className={cn('rounded-lg px-4 py-2 text-sm', toast.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600')}>{toast.msg}</div>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-700"><Hand size={15} className="text-brand-600" />Disponíveis (tanque)</h2>
          {loading ? <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />)}</div>
          : available.length === 0 ? <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">Nenhum lead disponível.</div>
          : <div className="space-y-2">{available.map(card)}</div>}
        </section>
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-700"><Inbox size={15} className="text-brand-600" />Meus leads</h2>
          {loading ? <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />)}</div>
          : mine.length === 0 ? <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">Você não tem leads em atendimento.</div>
          : <div className="space-y-2">{mine.map(card)}</div>}
        </section>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={() => setModal(false)}>
          <div className="my-8 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-gray-900">Novo lead</h2><button onClick={() => setModal(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Nome</label><input className={inputCls} value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="mb-1 block text-xs font-medium text-gray-700">Telefone</label><input className={inputCls} value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
                <div><label className="mb-1 block text-xs font-medium text-gray-700">Origem</label><input className={inputCls} value={form.source} onChange={(e) => set('source', e.target.value)} placeholder="site, indicação..." /></div>
              </div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">E-mail</label><input className={inputCls} value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
              <p className="text-xs text-gray-400">Informe ao menos nome, telefone ou e-mail.</p>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2"><button onClick={() => setModal(false)} className="btn-secondary text-sm">Cancelar</button><button onClick={createLead} disabled={saving} className="btn-primary text-sm"><Save size={15} />{saving ? 'Salvando...' : 'Criar lead'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
