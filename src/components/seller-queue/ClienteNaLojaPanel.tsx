'use client'

// =============================================================================
// Painel "Cliente na Loja" — bloco de registro de chegada dentro da Visão Geral.
// Qualquer vendedor com check-in ativo registra; o sistema chama o vendedor da
// vez (quem registra NÃO escolhe, salvo modos responsável/pós-vendas/agendamento).
// Extraído da antiga página "Cliente na Loja". Some se o usuário não tem acesso.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Bell, Send, RefreshCw, UserCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import CustomerLookup, { type CustomerMatch } from '@/components/seller-queue/CustomerLookup'
import { queueStatusLabel } from '@/lib/seller-queue/labels'

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base md:text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const dt = (s: string) => new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

function maskPhoneBR(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 3) return `(${d.slice(0, 2)})${d.slice(2)}`
  if (d.length <= 7) return `(${d.slice(0, 2)})${d.slice(2, 3)}.${d.slice(3)}`
  return `(${d.slice(0, 2)})${d.slice(2, 3)}.${d.slice(3, 7)}-${d.slice(7, 11)}`
}
const SMALL_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])
function capitalizeName(s: string): string {
  return s.toLowerCase().split(/\s+/).filter(Boolean).map((w, i) => (i > 0 && SMALL_WORDS.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())

interface Arrival { id: string; customerName: string | null; customerPhone: string | null; recurring: boolean; status: string; createdAt: string }
interface Callable { sellerId: string; name: string; role: string; positionName: string | null; queueStatus: string | null; inQueue: boolean }
type Mode = 'NORMAL' | 'SPECIFIC' | 'POS_VENDAS' | 'AGENDAMENTO'

export default function ClienteNaLojaPanel() {
  const [form, setForm] = useState({ customerName: '', customerPhone: '', customerEmail: '', notes: '', isWhatsapp: false })
  const [mode, setMode] = useState<Mode>('NORMAL')
  const [targetSellerId, setTargetSellerId] = useState('')
  const [callable, setCallable] = useState<Callable[]>([])
  const [items, setItems] = useState<Arrival[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const set = (k: 'customerName' | 'customerPhone' | 'customerEmail' | 'notes', v: string) => setForm((f) => ({ ...f, [k]: v }))
  const flash = (msg: string, ok: boolean) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 5000) }
  // Cliente/lead reaproveitado da busca (anti-duplicação). Limpa ao digitar manual.
  const [pickedCustomerId, setPickedCustomerId] = useState<string | null>(null)
  const [pickedLeadId, setPickedLeadId] = useState<string | null>(null)
  const typeField = (k: 'customerName' | 'customerPhone' | 'customerEmail', v: string) => { set(k, v); setPickedCustomerId(null); setPickedLeadId(null) }
  const pickMatch = (m: CustomerMatch) => {
    setForm((f) => ({ ...f, customerName: m.name ?? f.customerName, customerPhone: m.phone ?? f.customerPhone, customerEmail: m.email ?? f.customerEmail }))
    setPickedCustomerId(m.customerId); setPickedLeadId(m.leadId)
  }

  useEffect(() => {
    if (mode === 'NORMAL' || callable.length) return
    let cancelled = false
    ;(async () => {
      try { const r = await fetch('/api/seller-queue/callable', { credentials: 'include' }); const j = await r.json(); if (!cancelled && j?.success) setCallable(j.data ?? []) } catch { /* noop */ }
    })()
    return () => { cancelled = true }
  }, [mode, callable.length])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/seller-queue/customer-arrivals', { credentials: 'include' })
      if (res.status === 403 || res.status === 400) { setDenied(true); return }
      setDenied(false); setItems((await res.json())?.data ?? [])
    } catch { /* noop */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load(); const i = setInterval(load, 8000); return () => clearInterval(i) }, [load])

  const submit = async () => {
    const name = capitalizeName(form.customerName.trim())
    const phoneDigits = form.customerPhone.replace(/\D/g, '')
    if (!name) { flash('Informe o nome do cliente.', false); return }
    if (phoneDigits.length < 10) { flash('Informe um telefone válido.', false); return }
    if (!isEmail(form.customerEmail)) { flash('Informe um e-mail válido.', false); return }
    if (mode !== 'NORMAL' && !targetSellerId) { flash('Escolha o colaborador.', false); return }
    setSaving(true)
    try {
      const res = await fetch('/api/seller-queue/customer-arrivals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ customerName: name, customerPhone: form.customerPhone, customerEmail: form.customerEmail.trim(), customerIsWhatsapp: form.isWhatsapp, notes: form.notes || null, mode, targetSellerId: mode === 'NORMAL' ? null : targetSellerId, customerId: pickedCustomerId || undefined, leadId: pickedLeadId || undefined }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { flash(j?.error ?? 'Não foi possível registrar.', false); return }
      const personalQueued = j?.data?.personalQueued
      const call = j?.data?.call
      if (personalQueued) {
        flash('Cliente registrado com sucesso na fila individual do colaborador!', true)
      } else {
        const okMsg = mode === 'POS_VENDAS' ? 'Cliente registrado — colaborador em pós-vendas (pausado).' : mode === 'AGENDAMENTO' ? 'Agendamento iniciado — colaborador em atendimento.' : mode === 'SPECIFIC' ? 'Cliente registrado — colaborador chamado!' : 'Cliente registrado — vendedor da vez foi chamado!'
        flash(call?.ok ? okMsg : `Cliente registrado. ${call?.reason ?? 'Aguardando vendedor.'}`, !!call?.ok)
      }
      setForm({ customerName: '', customerPhone: '', customerEmail: '', notes: '', isWhatsapp: false }); setTargetSellerId(''); setPickedCustomerId(null); setPickedLeadId(null); await load()
    } catch { flash('Erro de rede.', false) } finally { setSaving(false) }
  }

  if (denied) return null

  return (
    <div className="space-y-4">
      <h2 className="flex items-center gap-2 text-base font-bold text-gray-900"><Bell size={18} className="text-brand-600" />Cliente na Loja</h2>
      {toast && <div className={cn('rounded-lg px-4 py-2 text-sm', toast.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600')}>{toast.msg}</div>}

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card">
        <div className="mb-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {([['NORMAL', 'Vendedor da vez'], ['SPECIFIC', 'Responsável'], ['POS_VENDAS', 'Pós-vendas'], ['AGENDAMENTO', 'Agendamento']] as [Mode, string][]).map(([m, label]) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={cn('rounded-lg border px-2 py-2 text-xs font-semibold transition', mode === m ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300')}>{label}</button>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {mode !== 'NORMAL' && (
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-700">Colaborador *</label>
              <select className={inputCls} value={targetSellerId} onChange={(e) => setTargetSellerId(e.target.value)}>
                <option value="">— selecione —</option>
                {callable.map((c) => (
                  <option key={c.sellerId} value={c.sellerId}>{c.name}{c.positionName ? ` — ${c.positionName}` : ''}{c.inQueue ? ' (na fila)' : c.queueStatus ? ` (${c.queueStatus.toLowerCase()})` : ' (fora da fila)'}</option>
                ))}
              </select>
            </div>
          )}
          <div className="relative sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-700">Nome do cliente *</label><input className={inputCls} value={form.customerName} onChange={(e) => typeField('customerName', e.target.value)} onBlur={() => set('customerName', capitalizeName(form.customerName))} placeholder="Ex.: Dagoberto Ramos de Francisco" /><CustomerLookup query={form.customerName} onPick={pickMatch} /></div>
          <div className="relative"><label className="mb-1 block text-xs font-medium text-gray-700">Telefone *</label><input type="tel" inputMode="numeric" className={inputCls} value={form.customerPhone} onChange={(e) => typeField('customerPhone', maskPhoneBR(e.target.value))} placeholder="(11)9.9999-9999" /><CustomerLookup query={form.customerPhone} onPick={pickMatch} /></div>
          <div className="relative"><label className="mb-1 block text-xs font-medium text-gray-700">E-mail *</label><input type="email" className={inputCls} value={form.customerEmail} onChange={(e) => typeField('customerEmail', e.target.value)} placeholder="cliente@email.com" /><CustomerLookup query={form.customerEmail} onPick={pickMatch} /></div>
          {pickedCustomerId && <p className="text-[11px] font-medium text-green-600 sm:col-span-2">✓ Cliente existente selecionado — não vai duplicar.</p>}
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.isWhatsapp} onChange={(e) => setForm((f) => ({ ...f, isWhatsapp: e.target.checked }))} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />É WhatsApp?</label>
          <div className="sm:col-span-2"><label className="mb-1 block text-xs font-medium text-gray-700">Observações</label><input className={inputCls} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
        </div>
        <button onClick={submit} disabled={saving} className="btn-primary mt-4 w-full justify-center py-3 text-base"><Send size={17} />{saving ? 'Registrando...' : mode === 'POS_VENDAS' ? 'Registrar e iniciar pós-vendas' : mode === 'AGENDAMENTO' ? 'Registrar agendamento' : 'Registrar e chamar'}</button>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
          <p className="text-sm font-semibold text-gray-700">Clientes de hoje</p>
          <button onClick={load} disabled={loading} className="text-gray-400 hover:text-gray-600"><RefreshCw size={14} className={cn(loading && 'animate-spin')} /></button>
        </div>
        {items.length === 0 ? <p className="px-4 py-8 text-center text-sm text-gray-400">Nenhum cliente registrado hoje.</p> : (
          <ul className="divide-y divide-gray-100">
            {items.map((a) => (
              <li key={a.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900">{a.customerName || a.customerPhone || 'Cliente'}{a.recurring && <span className="ml-2 inline-flex items-center gap-0.5 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] text-brand-700"><UserCheck size={10} />recorrente</span>}</p>
                  <p className="text-xs text-gray-400">{dt(a.createdAt)}{a.customerPhone && a.customerName ? ` · ${a.customerPhone}` : ''}</p>
                </div>
                <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold', a.status === 'DONE' ? 'bg-green-100 text-green-700' : a.status === 'ASSIGNED' ? 'bg-blue-100 text-blue-700' : a.status === 'CALLING' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500')}>{queueStatusLabel(a.status)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
