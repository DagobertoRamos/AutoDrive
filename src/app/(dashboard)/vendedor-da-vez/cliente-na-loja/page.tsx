'use client'

// =============================================================================
// Comercial › Fila de Atendimento › Cliente na Loja — registrar chegada.
// Qualquer vendedor com check-in ativo registra; o sistema chama o vendedor da
// vez (quem registra NÃO escolhe). Mostra recorrência e quem foi chamado.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Bell, Send, RefreshCw, UserCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const dt = (s: string) => new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

interface Arrival { id: string; customerName: string | null; customerPhone: string | null; recurring: boolean; status: string; createdAt: string }

export default function ClienteNaLojaPage() {
  const [form, setForm] = useState({ customerName: '', customerPhone: '', notes: '' })
  const [items, setItems] = useState<Arrival[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const set = <K extends keyof typeof form>(k: K, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const flash = (msg: string, ok: boolean) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 5000) }

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/seller-queue/customer-arrivals', { credentials: 'include' })
      if (res.status === 403 || res.status === 400) { const j = await res.json().catch(() => ({})); setDenied(j?.error ?? 'Sem acesso.'); return }
      setDenied(null); setItems((await res.json())?.data ?? [])
    } catch { /* noop */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load(); const i = setInterval(load, 8000); return () => clearInterval(i) }, [load])

  const submit = async () => {
    if (!form.customerName && !form.customerPhone) { flash('Informe nome ou telefone.', false); return }
    setSaving(true)
    try {
      const res = await fetch('/api/seller-queue/customer-arrivals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ customerName: form.customerName || null, customerPhone: form.customerPhone || null, notes: form.notes || null }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { flash(j?.error ?? 'Não foi possível registrar.', false); return }
      const call = j?.data?.call
      flash(call?.ok ? 'Cliente registrado — vendedor da vez foi chamado!' : `Cliente registrado. ${call?.reason ?? 'Aguardando vendedor.'}`, true)
      setForm({ customerName: '', customerPhone: '', notes: '' }); await load()
    } catch { flash('Erro de rede.', false) } finally { setSaving(false) }
  }

  if (denied) return <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{denied}</div>

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Bell size={20} className="text-brand-600" />Cliente na Loja</h1>
      {toast && <div className={cn('rounded-lg px-4 py-2 text-sm', toast.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600')}>{toast.msg}</div>}

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card">
        <p className="mb-3 text-xs text-gray-500">Você registra a chegada — o sistema chama o <strong>vendedor da vez</strong> (não escolha quem atende).</p>
        <div className="space-y-3">
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Nome do cliente</label><input className={inputCls} value={form.customerName} onChange={(e) => set('customerName', e.target.value)} /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Telefone</label><input className={inputCls} value={form.customerPhone} onChange={(e) => set('customerPhone', e.target.value)} placeholder="(11) 9 9999-9999" /></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Observações</label><input className={inputCls} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
        </div>
        <button onClick={submit} disabled={saving} className="btn-primary mt-4 w-full justify-center py-3 text-base"><Send size={17} />{saving ? 'Registrando...' : 'Registrar e chamar vendedor'}</button>
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
                <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold', a.status === 'DONE' ? 'bg-green-100 text-green-700' : a.status === 'ASSIGNED' ? 'bg-blue-100 text-blue-700' : a.status === 'CALLING' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500')}>{a.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
