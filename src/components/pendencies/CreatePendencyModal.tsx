'use client'

// =============================================================================
// CreatePendencyModal — gerente+ cadastra uma pendência manual e, se quiser,
// liga o LEMBRETE AUTOMÁTICO por push (Android + iPhone/PWA) que cobra o
// colaborador responsável na cadência escolhida (hora/dia/semana) até ele
// baixar a pendência. POST /api/pendencies.
// =============================================================================

import { useState, useEffect } from 'react'
import { X, BellRing, Save, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Seller { id: string; fullName: string; unit?: { id: string; name: string } | null }
interface Unit { id: string; name: string }

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const FREQS = [['HOURLY', 'A cada hora'], ['DAILY', 'Diário'], ['WEEKLY', 'Semanal']] as const
const PRIORITIES = [['BAIXA', 'Baixa'], ['MEDIA', 'Média'], ['ALTA', 'Alta'], ['URGENTE', 'Urgente']] as const

export function CreatePendencyModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [sellers, setSellers] = useState<Seller[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [types, setTypes] = useState<{ id: string; label: string }[]>([])
  const [f, setF] = useState({ plate: '', negotiation: '', customerName: '', type: '', description: '', priority: 'MEDIA', unitId: '', responsibleId: '', dueDate: '' })
  const [lookupMsg, setLookupMsg] = useState('')

  // Busca por placa/negociação → pré-preenche cliente, unidade e responsável.
  const doLookup = async (by: 'plate' | 'negotiation') => {
    const val = by === 'plate' ? f.plate.trim() : f.negotiation.trim()
    if (val.length < 3) return
    setLookupMsg('Buscando…')
    try {
      const qs = by === 'plate' ? `plate=${encodeURIComponent(val)}` : `negotiation=${encodeURIComponent(val)}`
      const r = await fetch(`/api/pendencies/lookup?${qs}`, { credentials: 'include' })
      const j = await r.json().catch(() => ({}))
      const d = j?.data
      if (!d) { setLookupMsg('Nada encontrado — preencha manualmente.'); return }
      setF((p) => ({
        ...p,
        customerName: d.customerName || p.customerName,
        unitId: d.unitId || p.unitId,
        responsibleId: d.responsibleId || p.responsibleId,
        plate: d.plate || p.plate,
        negotiation: d.negotiation || p.negotiation,
      }))
      const base = `✓ ${d.source === 'deal' ? `Negociação ${d.negotiation ?? ''}` : `Veículo ${d.vehicle ?? ''}`}${d.customerName ? ` — ${d.customerName}` : ''} carregado.`
      setLookupMsg(d.otherUnitName ? `${base} ⚠️ Está em outra unidade: ${d.otherUnitName}.` : base)
    } catch { setLookupMsg('') }
  }
  const [remind, setRemind] = useState(true)
  const [remindFrequency, setRemindFrequency] = useState('DAILY')
  const [remindMaxSends, setRemindMaxSends] = useState(10)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = <K extends keyof typeof f>(k: K, v: string) => setF((p) => ({ ...p, [k]: v }))

  useEffect(() => {
    fetch('/api/units', { credentials: 'include' }).then((r) => r.ok ? r.json() : null).then((j) => { const u = j?.data ?? j ?? []; setUnits(u); if (u.length === 1) setF((p) => ({ ...p, unitId: u[0].id })) }).catch(() => {})
    fetch('/api/sellers', { credentials: 'include' }).then((r) => r.ok ? r.json() : null).then((j) => setSellers(j?.data ?? [])).catch(() => {})
    // Tipos de pendência cadastrados (Configurações). Se não houver, o campo vira texto livre.
    fetch('/api/stock/pendency-options', { credentials: 'include' }).then((r) => r.ok ? r.json() : null).then((j) => setTypes(j?.data ?? [])).catch(() => {})
  }, [])

  const sellersOfUnit = f.unitId ? sellers.filter((s) => s.unit?.id === f.unitId) : sellers

  const submit = async () => {
    const plate = f.plate.trim().toUpperCase().replace(/\s+/g, '')
    if (!plate) { setError('Informe a placa.'); return }
    if (!f.customerName.trim()) { setError('Informe o cliente/assunto.'); return }
    if (!f.type.trim()) { setError('Selecione o tipo da pendência.'); return }
    if (!f.dueDate) { setError('Informe a data de vencimento.'); return }
    if (!f.unitId) { setError('Selecione a unidade.'); return }
    if (!f.responsibleId) { setError('Selecione o responsável.'); return }
    if (!f.description.trim()) { setError('Descreva o que precisa ser resolvido.'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/pendencies', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          plate, customerName: f.customerName.trim(), type: f.type.trim(), description: f.description.trim(),
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
          <div className="rounded-lg border border-brand-100 bg-brand-50/40 p-2.5">
            <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-brand-600"><Search size={11} />Buscar por placa ou negociação (preenche automático)</p>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="mb-0.5 block text-[10px] text-gray-500">Placa *</label><input className={cn(inputCls, 'uppercase')} value={f.plate} onChange={(e) => set('plate', e.target.value.toUpperCase())} onBlur={() => doLookup('plate')} placeholder="ABC1D23" maxLength={8} /></div>
              <div><label className="mb-0.5 block text-[10px] text-gray-500">Negociação</label><input className={inputCls} value={f.negotiation} onChange={(e) => set('negotiation', e.target.value)} onBlur={() => doLookup('negotiation')} placeholder="NEG-2026-001" /></div>
            </div>
            {lookupMsg && <p className="mt-1 text-[11px] font-medium text-brand-700">{lookupMsg}</p>}
          </div>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Prioridade</label><select className={inputCls} value={f.priority} onChange={(e) => set('priority', e.target.value)}>{PRIORITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Cliente / Assunto *</label><input className={inputCls} value={f.customerName} onChange={(e) => set('customerName', e.target.value)} placeholder="Ex.: João da Silva — documento do veículo" /></div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Tipo *</label>
            {types.length > 0 ? (
              <select className={inputCls} value={f.type} onChange={(e) => set('type', e.target.value)}><option value="">— selecione —</option>{types.map((t) => <option key={t.id} value={t.label}>{t.label}</option>)}</select>
            ) : (
              <input className={inputCls} value={f.type} onChange={(e) => set('type', e.target.value)} placeholder="Documento, Financeira, Processo… (cadastre em Configurações)" />
            )}
          </div>
          <div><label className="mb-1 block text-xs font-medium text-gray-700">Descrição *</label><textarea rows={2} className={inputCls} value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="O que precisa ser resolvido" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="mb-1 block text-xs font-medium text-gray-700">Unidade *</label><select className={inputCls} value={f.unitId} onChange={(e) => { set('unitId', e.target.value); set('responsibleId', '') }}><option value="">— selecione —</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
            <div><label className="mb-1 block text-xs font-medium text-gray-700">Vencimento *</label><input type="date" className={inputCls} value={f.dueDate} onChange={(e) => set('dueDate', e.target.value)} /></div>
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
