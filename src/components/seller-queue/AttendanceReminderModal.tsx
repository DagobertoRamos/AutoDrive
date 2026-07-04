'use client'

import { useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Clock, RefreshCw, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ReminderState {
  reminderCount: number
  lastReminderAt: string | null
  lastAcknowledgedAt: string | null
}

export interface AttendanceReminderData {
  id: string
  sellerId: string
  sellerName: string
  status: string
  calledAt: string
  acceptedAt: string | null
  startedAt: string | null
  customerName: string | null
  customerPhone: string | null
  reminderState: ReminderState
}

interface Props {
  reminder: AttendanceReminderData
  onClose: () => void
  onChanged: () => void
}

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

const typeOptions = [
  ['SALE', 'Venda'],
  ['EXCHANGE', 'Troca'],
  ['PURCHASE', 'Compra'],
  ['CONSIGNMENT', 'Consignação'],
  ['FINANCING', 'Financiamento'],
  ['AFTER_SALES', 'Pós-venda'],
  ['OTHER', 'Outro'],
]

const resultOptions = [
  ['CONVERTED_TO_NEGOTIATION', 'Virou negociação'],
  ['SCHEDULED_RETURN', 'Retorno agendado'],
  ['NO_INTEREST', 'Sem interesse'],
  ['LOST', 'Perdido'],
  ['DUPLICATED', 'Duplicado'],
  ['FORWARDED_TO_RESPONSIBLE', 'Encaminhado ao responsável'],
  ['INVALID_ATTENDANCE', 'Atendimento inválido'],
]

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  const j = await res.json().catch(() => ({})) as { error?: string }
  return { ok: res.ok, error: j.error }
}

function elapsedLabel(start: string | null): string {
  if (!start) return 'há algum tempo'
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(start).getTime()) / 60000))
  if (minutes < 60) return `há ${minutes} min`
  return `há ${Math.floor(minutes / 60)}h ${minutes % 60}min`
}

export default function AttendanceReminderModal({ reminder, onClose, onChanged }: Props) {
  const [mode, setMode] = useState<'question' | 'finish'>('question')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [form, setForm] = useState({
    type: 'SALE',
    result: 'NO_INTEREST',
    customerName: reminder.customerName ?? '',
    customerPhone: reminder.customerPhone ?? '',
    customerEmail: '',
    notes: '',
  })

  const startedAt = reminder.startedAt ?? reminder.acceptedAt ?? reminder.calledAt
  const needsNotes = form.result !== 'CONVERTED_TO_NEGOTIATION'
  const hasCustomer = useMemo(() => {
    const phoneDigits = form.customerPhone.replace(/\D/g, '')
    return form.customerName.trim().length > 0 && phoneDigits.length >= 10
  }, [form.customerName, form.customerPhone])

  const confirmActive = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const r = await postJson(`/api/seller-queue/reminders/${reminder.id}`, { action: 'still-active' })
      if (!r.ok) { setMsg({ ok: false, text: r.error ?? 'Não foi possível confirmar.' }); return }
      onChanged()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const requestFinish = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const r = await postJson(`/api/seller-queue/reminders/${reminder.id}`, { action: 'finish-requested' })
      if (!r.ok) { setMsg({ ok: false, text: r.error ?? 'Não foi possível abrir a finalização.' }); return }
      setMode('finish')
    } finally {
      setBusy(false)
    }
  }

  const finish = async () => {
    if (!hasCustomer) { setMsg({ ok: false, text: 'Informe nome e telefone do cliente.' }); return }
    if (needsNotes && !form.notes.trim()) { setMsg({ ok: false, text: 'Informe uma observação/motivo.' }); return }
    setBusy(true)
    setMsg(null)
    try {
      const r = await postJson(`/api/seller-queue/attendances/${reminder.id}/finish`, {
        type: form.type,
        result: form.result,
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone.trim(),
        customerEmail: form.customerEmail.trim() || null,
        notes: form.notes.trim() || null,
      })
      if (!r.ok) { setMsg({ ok: false, text: r.error ?? 'Não foi possível finalizar.' }); return }
      onChanged()
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
              <Clock size={18} className="text-brand-600" />
              {mode === 'question' ? 'Você ainda está em atendimento?' : 'Finalizar atendimento'}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {reminder.customerName ?? 'Cliente não cadastrado'} · atendimento aberto {elapsedLabel(startedAt)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {msg && (
            <div className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm', msg.ok ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700')}>
              {msg.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
              {msg.text}
            </div>
          )}

          {mode === 'question' ? (
            <>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Este lembrete ajuda a manter a fila limpa e evita atendimento esquecido em aberto.
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={confirmActive} disabled={busy} className="btn-primary justify-center py-3 text-sm">
                  {busy ? <RefreshCw size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                  Sim, ainda estou atendendo
                </button>
                <button type="button" onClick={requestFinish} disabled={busy} className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60">
                  Não, finalizar atendimento
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Tipo</label>
                  <select className={inputCls} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                    {typeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Resultado</label>
                  <select className={inputCls} value={form.result} onChange={(e) => setForm((f) => ({ ...f, result: e.target.value }))}>
                    {resultOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Cliente</label>
                  <input className={inputCls} value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} placeholder="Nome do cliente" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">Telefone</label>
                  <input className={inputCls} value={form.customerPhone} onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))} placeholder="(00) 00000-0000" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">E-mail</label>
                <input className={inputCls} value={form.customerEmail} onChange={(e) => setForm((f) => ({ ...f, customerEmail: e.target.value }))} placeholder="opcional" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Observação / motivo</label>
                <textarea className={cn(inputCls, 'min-h-[88px]')} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder={needsNotes ? 'Obrigatório quando não vira negociação' : 'Opcional'} />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setMode('question')} className="btn-secondary text-sm">Voltar</button>
                <button type="button" onClick={finish} disabled={busy} className="btn-primary text-sm">
                  {busy ? <RefreshCw size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                  Finalizar atendimento
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
