'use client'

// =============================================================================
// RequestAttendanceAuth — botão do VENDEDOR para pedir autorização de atender
// AGENDAMENTO/RETORNO (que fura a rotação). Cria um pedido PENDENTE; o líder+/
// gerência aprova via app. Anti-fraude: o vendedor não atende até ser autorizado.
// =============================================================================

import { useState } from 'react'
import { CalendarClock, X, Send } from 'lucide-react'
import { cn } from '@/lib/utils'

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

export default function RequestAttendanceAuth() {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [f, setF] = useState({ visitType: 'AGENDAMENTO', customerName: '', customerPhone: '', customerEmail: '', notes: '' })
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))
  const flash = (msg: string, ok: boolean) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 6000) }

  const submit = async () => {
    if (!f.customerName.trim()) { flash('Informe o nome do cliente.', false); return }
    setSaving(true)
    try {
      const res = await fetch('/api/seller-queue/attendance-auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(f),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { flash(j?.error ?? 'Não foi possível enviar o pedido.', false); return }
      flash(j?.data?.approvers ? 'Pedido enviado! Aguarde a autorização do líder/gerência.' : 'Pedido enviado, mas nenhum líder/gerência foi encontrado para autorizar.', !!j?.data?.approvers)
      setOpen(false); setF({ visitType: 'AGENDAMENTO', customerName: '', customerPhone: '', customerEmail: '', notes: '' })
    } catch { flash('Erro de rede.', false) } finally { setSaving(false) }
  }

  return (
    <>
      {toast && <div className={cn('mb-2 rounded-lg px-3 py-2 text-sm', toast.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600')}>{toast.msg}</div>}
      <button onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100">
        <CalendarClock size={16} />Atender agendamento/retorno
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-3" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">Pedir autorização de atendimento</h3>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button>
            </div>
            <p className="mb-3 text-xs text-gray-500">Agendamento/retorno fura a rotação da fila, então precisa da autorização de um líder ou da gerência. Você será avisado quando decidirem.</p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Tipo *</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['AGENDAMENTO', 'RETORNO'] as const).map((t) => (
                    <button key={t} type="button" onClick={() => set('visitType', t)} className={cn('rounded-lg border px-2 py-2 text-xs font-semibold', f.visitType === t ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-500 hover:border-gray-300')}>{t === 'AGENDAMENTO' ? 'Agendamento' : 'Retorno'}</button>
                  ))}
                </div>
              </div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Nome do cliente *</label><input className={inputCls} value={f.customerName} onChange={(e) => set('customerName', e.target.value)} placeholder="Ex.: João da Silva" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="mb-1 block text-xs font-medium text-gray-700">Telefone</label><input className={inputCls} value={f.customerPhone} onChange={(e) => set('customerPhone', e.target.value)} placeholder="(11)9.9999-9999" /></div>
                <div><label className="mb-1 block text-xs font-medium text-gray-700">E-mail</label><input className={inputCls} value={f.customerEmail} onChange={(e) => set('customerEmail', e.target.value)} placeholder="cliente@email.com" /></div>
              </div>
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Observações</label><input className={inputCls} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Ex.: cliente agendou às 14h" /></div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={submit} disabled={saving} className="btn-primary text-sm"><Send size={15} />{saving ? 'Enviando...' : 'Pedir autorização'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
