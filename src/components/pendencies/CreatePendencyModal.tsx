'use client'

// =============================================================================
// CreatePendencyModal — gerente+ cadastra uma pendência manual e, se quiser,
// liga o LEMBRETE AUTOMÁTICO por push (Android + iPhone/PWA) que cobra o
// colaborador responsável na cadência escolhida (hora/dia/semana) até ele
// baixar a pendência. POST /api/pendencies.
// =============================================================================

import { useState, useEffect } from 'react'
import { X, BellRing, Save } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Seller { id: string; fullName: string; unit?: { id: string; name: string } | null }
interface Unit { id: string; name: string }

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const FREQS = [['HOURLY', 'A cada hora'], ['DAILY', 'Diário'], ['WEEKLY', 'Semanal']] as const
const PRIORITIES = [['BAIXA', 'Baixa'], ['MEDIA', 'Média'], ['ALTA', 'Alta'], ['URGENTE', 'Urgente']] as const

export function CreatePendencyModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [sellers, setSellers] = useState<Seller[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [f, setF] = useState({ customerName: '', type: '', description: '', priority: 'MEDIA', unitId: '', responsibleId: '', dueDate: '' })
  const [remind, setRemind] = useState(true)
  const [remindFrequency, setRemindFrequency] = useState('DAILY')
  const [remindMaxSends, setRemindMaxSends] = useState(10)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = <K extends keyof typeof f>(k: K, v: string) => setF((p) => ({ ...p, [k]: v }))

  useEffect(() => {
    fetch('/api/units', { credentials: 'include' }).then((r) => r.ok ? r.json() : null).then((j) => { const u = j?.data ?? j ?? []; setUnits(u); if (u.length === 1) setF((p) => ({ ...p, unitId: u[0].id })) }).catch(() => {})
    fetch('/api/sellers', { credentials: 'include' }).then((r) => r.ok ? r.json() : null).then((j) => setSellers(j?.data ?? [])).catch(() => {})
  }, [])

  const sellersOfUnit = f.unitId ? sellers.filter((s) => s.unit?.id === f.unitId) : sellers

  const submit = async () => {
    if (!f.customerName.trim()) { setError('Informe o nome do cliente/assunto.'); return }
    if (!f.unitId) { setError('Selecione a unidade.'); return }
    if (!f.responsibleId) { setError('Selecione o responsável.'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/pendencies', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          customerName: f.customerName.trim(), type: f.type.trim() || undefined, description: f.description.trim() || undefined,
          priority: f.priority, unitId: f.unitId, responsibleId: f.responsibleId, dueDate: f.dueDate || undefined,
          remind, remindFrequency: remind ? remindFrequency : undefined, remindMaxSends: remind ? remindMaxSends : undefined,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j?.error ?? 'Não foi possível criar a pendência.'); return }
      onCreated(); onClose()
    } catch { setError('Erro de rede.') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-base font-bold text-gray-800">Nova pendência</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Cliente / Assunto *</label><input className={inputCls} value={f.customerName} onChange={(e) => set('customerName', e.target.value)} placeholder="Ex.: João da Silva — documento do veículo" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1 block text-xs font-medium text-gray-700">Tipo</label><input className={inputCls} value={f.type} onChange={(e) => set('type', e.target.value)} placeholder="Documento, Financeira, Processo…" /></div>
            <div><label className="mb-1 block text-xs font-medium text-gray-700">Prioridade</label><select className={inputCls} value={f.priority} onChange={(e) => set('priority', e.target.value)}>{PRIORITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          </div>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Descrição</label><textarea rows={2} className={inputCls} value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="O que precisa ser resolvido" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1 block text-xs font-medium text-gray-700">Unidade *</label><select className={inputCls} value={f.unitId} onChange={(e) => { set('unitId', e.target.value); set('responsibleId', '') }}><option value="">— selecione —</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
            <div><label className="mb-1 block text-xs font-medium text-gray-700">Vencimento</label><input type="date" className={inputCls} value={f.dueDate} onChange={(e) => set('dueDate', e.target.value)} /></div>
          </div>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Responsável *</label><select className={inputCls} value={f.responsibleId} onChange={(e) => set('responsibleId', e.target.value)}><option value="">— selecione o colaborador —</option>{sellersOfUnit.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}</select></div>

          {/* Lembrete automático por push */}
          <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-800"><input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" /><BellRing size={15} className="text-brand-600" />Lembrar o responsável por push até resolver</label>
            {remind && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div><label className="mb-1 block text-xs font-medium text-gray-700">Frequência</label><select className={inputCls} value={remindFrequency} onChange={(e) => setRemindFrequency(e.target.value)}>{FREQS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                <div><label className="mb-1 block text-xs font-medium text-gray-700">Máx. de lembretes</label><input type="number" min={1} max={100} className={inputCls} value={remindMaxSends} onChange={(e) => setRemindMaxSends(Math.max(1, Number(e.target.value) || 1))} /></div>
                <p className="col-span-2 text-[11px] text-gray-500">O push vai pro celular (Android) e iPhone/PWA do responsável, na janela de horário configurada em Pendências → Configurações, até a pendência ser baixada.</p>
              </div>
            )}
          </div>

          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button onClick={submit} disabled={saving} className="btn-primary text-sm"><Save size={15} />{saving ? 'Salvando…' : 'Criar pendência'}</button>
        </div>
      </div>
    </div>
  )
}
