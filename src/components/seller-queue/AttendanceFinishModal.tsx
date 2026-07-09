'use client'

// =============================================================================
// AttendanceFinishModal — modal de FINALIZAÇÃO do atendimento (cadastro do
// cliente + tipo + resultado + observações). Reutilizável: usado no dashboard
// da fila e no painel "Minha Vez". POST /api/seller-queue/attendances/:id/finish.
// Anti-duplicação de cliente via CustomerLookup. Se virar negociação, abre a
// negociação criada. Erros mostrados inline (autossuficiente).
// =============================================================================

import { useState } from 'react'
import { CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react'
import CustomerLookup, { type CustomerMatch } from '@/components/seller-queue/CustomerLookup'

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base md:text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const TYPES = [['SALE', 'Venda'], ['EXCHANGE', 'Troca'], ['PURCHASE', 'Compra'], ['CONSIGNMENT', 'Consignação'], ['FINANCING', 'Financiamento'], ['AFTER_SALES', 'Pós-venda'], ['OTHER', 'Outro']] as const
const RESULTS = [['CONVERTED_TO_NEGOTIATION', 'Virou negociação'], ['SCHEDULED_RETURN', 'Retorno agendado'], ['NO_INTEREST', 'Sem interesse'], ['LOST', 'Perdido'], ['DUPLICATED', 'Duplicado'], ['FORWARDED_TO_RESPONSIBLE', 'Encaminhado'], ['INVALID_ATTENDANCE', 'Inválido']] as const
const SMALL_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])
function capName(s: string): string {
  return s.toLowerCase().split(/\s+/).filter(Boolean).map((w, i) => (i > 0 && SMALL_WORDS.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
function maskPhoneBR(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 3) return `(${d.slice(0, 2)})${d.slice(2)}`
  if (d.length <= 7) return `(${d.slice(0, 2)})${d.slice(2, 3)}.${d.slice(3)}`
  return `(${d.slice(0, 2)})${d.slice(2, 3)}.${d.slice(3, 7)}-${d.slice(7, 11)}`
}

interface Arrival { customerName: string | null; customerPhone: string | null; customerEmail: string | null }

export default function AttendanceFinishModal({ attendanceId, visitType, arrival, closeReasons = [], onClose, onFinished }: {
  attendanceId: string
  visitType?: string | null
  arrival?: Arrival | null
  closeReasons?: string[]
  onClose: () => void
  onFinished?: () => void
}) {
  const [form, setForm] = useState({
    type: 'SALE', result: 'CONVERTED_TO_NEGOTIATION', motivo: '', notes: '',
    customerName: arrival?.customerName ?? '', customerPhone: arrival?.customerPhone ?? '', customerEmail: arrival?.customerEmail ?? '',
  })
  const [pickedCustomerId, setPickedCustomerId] = useState<string | null>(null)
  const [pickedLeadId, setPickedLeadId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const clearPick = () => { setPickedCustomerId(null); setPickedLeadId(null) }
  const pickMatch = (m: CustomerMatch) => {
    setForm((f) => ({ ...f, customerName: m.name ?? f.customerName, customerPhone: m.phone ?? f.customerPhone, customerEmail: m.email ?? f.customerEmail }))
    setPickedCustomerId(m.customerId); setPickedLeadId(m.leadId)
  }

  const finish = async () => {
    const name = capName(form.customerName.trim())
    const isInfoRapida = visitType === 'INFORMACAO_RAPIDA'
    setErr(null)
    const validateCustomer = () => {
      if (!name) { setErr('Informe o nome do cliente.'); return false }
      if (form.customerPhone.replace(/\D/g, '').length < 10) { setErr('Informe um telefone válido.'); return false }
      if (form.customerEmail.trim() && !isEmail(form.customerEmail)) { setErr('Informe um e-mail válido.'); return false }
      return true
    }
    if (!isInfoRapida) {
      if (!validateCustomer()) return
    } else if (name || form.customerPhone.replace(/\D/g, '').length > 0 || form.customerEmail.trim()) {
      if (!validateCustomer()) return
    }
    if (!form.notes.trim()) { setErr('As observações são obrigatórias.'); return }

    const notesWithMotivo = (form.motivo ? `Motivo: ${form.motivo}. ` : '') + form.notes.trim()
    const payload: Record<string, unknown> = {
      type: form.type, result: form.result, notes: notesWithMotivo,
      customerName: name || undefined, customerPhone: form.customerPhone || undefined, customerEmail: form.customerEmail.trim() || undefined,
      customerId: pickedCustomerId || undefined, leadId: pickedLeadId || undefined,
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/seller-queue/attendances/${attendanceId}/finish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j?.error ?? 'Não foi possível finalizar.'); return }
      onFinished?.()
      if (j?.data?.dealId) { window.location.assign(`/negociacoes/${j.data.dealId}`); return }
      onClose()
    } catch { setErr('Erro de rede. Tente de novo.') } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-3 sm:items-center" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-[min(28rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl bg-white p-4 shadow-xl sm:p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 text-lg font-bold text-gray-900">Cadastrar cliente e finalizar</h2>
        <p className="mb-3 text-xs text-gray-500">Registre os dados do cliente e o resultado. Gera um lead de atendimento no seu nome.</p>
        {err && <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle size={15} />{err}</div>}
        <div className="space-y-3">
          <div className="relative"><label className="mb-1 block text-xs font-medium text-gray-700">Nome do cliente *</label><input className={inputCls} value={form.customerName} onChange={(e) => { setForm((f) => ({ ...f, customerName: e.target.value })); clearPick() }} onBlur={() => setForm((f) => ({ ...f, customerName: capName(f.customerName) }))} placeholder="Ex.: Dagoberto Ramos de Francisco" /><CustomerLookup query={form.customerName} onPick={pickMatch} /></div>
          <div className="relative"><label className="mb-1 block text-xs font-medium text-gray-700">Telefone *</label><input type="tel" inputMode="numeric" className={inputCls} value={form.customerPhone} onChange={(e) => { setForm((f) => ({ ...f, customerPhone: maskPhoneBR(e.target.value) })); clearPick() }} placeholder="(11)9.9999-9999" /><CustomerLookup query={form.customerPhone} onPick={pickMatch} /></div>
          <div className="relative"><label className="mb-1 block text-xs font-medium text-gray-700">E-mail (opcional)</label><input type="email" className={inputCls} value={form.customerEmail} onChange={(e) => { setForm((f) => ({ ...f, customerEmail: e.target.value })); clearPick() }} placeholder="cliente@email.com" /><CustomerLookup query={form.customerEmail} onPick={pickMatch} /></div>
          {pickedCustomerId && <p className="-mt-1 text-[11px] font-medium text-green-600">✓ Cliente existente selecionado — não vai duplicar.</p>}
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Tipo</label><select className={inputCls} value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Resultado</label><select className={inputCls} value={form.result} onChange={(e) => setForm((f) => ({ ...f, result: e.target.value }))}>{RESULTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          {closeReasons.length > 0 && (
            <div><label className="mb-1 block text-xs font-medium text-gray-700">Motivo</label><select className={inputCls} value={form.motivo} onChange={(e) => setForm((f) => ({ ...f, motivo: e.target.value }))}><option value="">— selecione —</option>{closeReasons.map((m) => <option key={m} value={m}>{m}</option>)}</select></div>
          )}
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Observações *</label><textarea rows={2} className={inputCls} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Obrigatório — resumo do atendimento" /></div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-[auto_auto] sm:justify-end">
          <button onClick={onClose} className="btn-secondary justify-center text-sm">Cancelar</button>
          <button onClick={finish} disabled={busy} className="btn-primary justify-center text-sm">{busy ? <RefreshCw size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}Finalizar</button>
        </div>
      </div>
    </div>
  )
}
