'use client'

// =============================================================================
// Pendências > Configurações.
// (A) Tipos/opções de pendência — CRUD via /api/stock/pendency-options
//     (opções globais do MASTER são somente-leitura para a loja).
// (B) Padrões automáticos — SLA por prioridade + janela de envio automático,
//     persistidos via /api/settings/pendencies.
// Gate: stock.pendencies.configure (MASTER/ADM). Tenant-scoped.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Settings, Plus, Pencil, Trash2, X, Save, Lock, Power, Clock, Send, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'

const CONFIG_ROLES = ['MASTER', 'ADM']

const CATEGORIES = ['DOCUMENTACAO', 'PREPARACAO', 'AVALIACAO', 'FINANCEIRO', 'OUTROS'] as const
const CAT_LABEL: Record<string, string> = { DOCUMENTACAO: 'Documentação', PREPARACAO: 'Preparação', AVALIACAO: 'Avaliação', FINANCEIRO: 'Financeiro', OUTROS: 'Outros' }

const PRIORITIES = ['URGENTE', 'ALTA', 'MEDIA', 'BAIXA'] as const
type Priority = (typeof PRIORITIES)[number]
const PRIO_LABEL: Record<Priority, string> = { URGENTE: 'Urgente', ALTA: 'Alta', MEDIA: 'Média', BAIXA: 'Baixa' }
const PRIO_CLS: Record<Priority, string> = { URGENTE: 'text-red-600', ALTA: 'text-orange-600', MEDIA: 'text-amber-600', BAIXA: 'text-gray-600' }

const WEEKDAYS = [['MON', 'Seg'], ['TUE', 'Ter'], ['WED', 'Qua'], ['THU', 'Qui'], ['FRI', 'Sex'], ['SAT', 'Sáb'], ['SUN', 'Dom']] as const
const FREQS = [['DAILY', 'Diário'], ['HOURLY', 'A cada hora'], ['WEEKLY', 'Semanal']] as const

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

interface Option { id: string; label: string; category: string | null; order: number; active: boolean; createdByMaster: boolean; tenantId: string | null }
interface OptForm { label: string; category: string; order: number; active: boolean }
const emptyOpt: OptForm = { label: '', category: 'DOCUMENTACAO', order: 0, active: true }

interface AutoSend { enabled: boolean; allowedDays: string[]; startTime: string; endTime: string; frequency: string; maxSends: number; sendsPerDay: number }
interface PendSettings { slaByPriority: Record<Priority, number>; autoSend: AutoSend }

// minutos → texto legível
const slaText = (min: number) => {
  if (min % 1440 === 0) return `${min / 1440} dia(s)`
  if (min % 60 === 0) return `${min / 60} h`
  return `${min} min`
}

export default function PendencyConfigPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role
  const allowed = !role || CONFIG_ROLES.includes(role)
  const isMaster = role === 'MASTER'

  // ── Tipos/opções ──
  const [options, setOptions] = useState<Option[]>([])
  const [loadingOpt, setLoadingOpt] = useState(true)
  const [modal, setModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<OptForm>(emptyOpt)
  const [saving, setSaving] = useState(false)
  const [optError, setOptError] = useState<string | null>(null)
  const setF = <K extends keyof OptForm>(k: K, v: OptForm[K]) => setForm((f) => ({ ...f, [k]: v }))

  // ── Padrões ──
  const [settings, setSettings] = useState<PendSettings | null>(null)
  const [loadingSet, setLoadingSet] = useState(true)
  const [savingSet, setSavingSet] = useState(false)
  const [setMsg, setSetMsg] = useState<string | null>(null)

  const loadOptions = useCallback(async () => {
    setLoadingOpt(true)
    try { const r = await fetch('/api/stock/pendency-options?includeInactive=true', { credentials: 'include' }).then((x) => x.json()); setOptions(r?.data ?? []) }
    catch { setOptions([]) } finally { setLoadingOpt(false) }
  }, [])

  const loadSettings = useCallback(async () => {
    setLoadingSet(true)
    try { const r = await fetch('/api/settings/pendencies', { credentials: 'include' }).then((x) => x.json()); setSettings(r?.data ?? null) }
    catch { setSettings(null) } finally { setLoadingSet(false) }
  }, [])

  useEffect(() => { if (allowed) { loadOptions(); loadSettings() } }, [allowed, loadOptions, loadSettings])

  const openNew = () => { setEditingId(null); setForm(emptyOpt); setOptError(null); setModal(true) }
  const openEdit = (o: Option) => { setEditingId(o.id); setForm({ label: o.label, category: o.category ?? 'OUTROS', order: o.order, active: o.active }); setOptError(null); setModal(true) }

  const saveOption = async () => {
    if (!form.label.trim()) { setOptError('Informe o nome do tipo.'); return }
    setSaving(true); setOptError(null)
    try {
      const payload = { ...(editingId ? { id: editingId } : {}), label: form.label, category: form.category, order: form.order, active: form.active }
      const res = await fetch('/api/stock/pendency-options', { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) })
      const json = await res.json()
      if (!res.ok) { setOptError(json?.error ?? 'Erro ao salvar.'); return }
      setModal(false); await loadOptions()
    } catch { setOptError('Erro de rede.') } finally { setSaving(false) }
  }
  const toggleOption = async (o: Option) => { await fetch('/api/stock/pendency-options', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ id: o.id, active: !o.active }) }); await loadOptions() }
  const removeOption = async (o: Option) => { if (!confirm(`Excluir o tipo "${o.label}"?`)) return; await fetch(`/api/stock/pendency-options?id=${o.id}`, { method: 'DELETE', credentials: 'include' }); await loadOptions() }

  const setSla = (p: Priority, minutes: number) => setSettings((s) => (s ? { ...s, slaByPriority: { ...s.slaByPriority, [p]: minutes } } : s))
  const setAuto = <K extends keyof AutoSend>(k: K, v: AutoSend[K]) => setSettings((s) => (s ? { ...s, autoSend: { ...s.autoSend, [k]: v } } : s))
  const toggleDay = (d: string) => setSettings((s) => (s ? { ...s, autoSend: { ...s.autoSend, allowedDays: s.autoSend.allowedDays.includes(d) ? s.autoSend.allowedDays.filter((x) => x !== d) : [...s.autoSend.allowedDays, d] } } : s))

  const saveSettings = async () => {
    if (!settings) return
    setSavingSet(true); setSetMsg(null)
    try {
      const res = await fetch('/api/settings/pendencies', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(settings) })
      const json = await res.json()
      if (!res.ok) { setSetMsg(json?.error ?? 'Erro ao salvar.'); return }
      setSettings(json.data ?? settings); setSetMsg('Padrões salvos com sucesso.')
      setTimeout(() => setSetMsg(null), 3000)
    } catch { setSetMsg('Erro de rede.') } finally { setSavingSet(false) }
  }

  if (session && !allowed) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Lock size={24} /></div>
        <div><p className="text-lg font-semibold text-gray-800">Configuração restrita</p><p className="mt-1 max-w-md text-sm text-gray-500">As configurações de pendências são definidas pela administração da loja.</p></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Settings size={20} className="text-brand-600" />Configurações de Pendências</h1>
        <p className="mt-0.5 text-sm text-gray-500">Defina os tipos de pendência, os SLAs padrão por prioridade e a janela de envio automático.</p>
      </div>

      {/* ── Seção A: Tipos/opções de pendência ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-700"><ListChecks size={16} className="text-brand-600" />Tipos de pendência</h2>
          <button onClick={openNew} className="btn-primary text-sm"><Plus size={15} />Novo tipo</button>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50"><tr>{['Tipo', 'Categoria', 'Ordem', 'Origem', 'Status', ''].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
              <tbody className="divide-y divide-gray-100">
                {loadingOpt ? (
                  Array.from({ length: 4 }).map((_, i) => (<tr key={i}>{Array.from({ length: 6 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
                ) : options.length === 0 ? (
                  <tr><td colSpan={6} className="py-12 text-center"><ListChecks size={28} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhum tipo cadastrado.</p></td></tr>
                ) : options.map((o) => {
                  const locked = !isMaster && o.createdByMaster
                  return (
                    <tr key={o.id} className={cn('hover:bg-gray-50', !o.active && 'opacity-50')}>
                      <td className="px-4 py-3 font-medium text-gray-900">{o.label}</td>
                      <td className="px-4 py-3"><span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{o.category ? (CAT_LABEL[o.category] ?? o.category) : '—'}</span></td>
                      <td className="px-4 py-3 tabular-nums text-gray-500">{o.order}</td>
                      <td className="px-4 py-3 text-xs">{o.createdByMaster ? <span className="inline-flex items-center gap-1 text-brand-700"><Lock size={12} />Global</span> : <span className="text-gray-500">Loja</span>}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{o.active ? 'Ativo' : 'Inativo'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {locked ? (
                          <span className="text-xs text-gray-400">somente leitura</span>
                        ) : (
                          <>
                            <button onClick={() => toggleOption(o)} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title={o.active ? 'Inativar' : 'Ativar'}><Power size={15} /></button>
                            <button onClick={() => openEdit(o)} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Editar"><Pencil size={15} /></button>
                            <button onClick={() => removeOption(o)} className="inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Excluir"><Trash2 size={15} /></button>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Seção B: SLA por prioridade ── */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-700"><Clock size={16} className="text-brand-600" />SLA padrão por prioridade</h2>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
          {loadingSet || !settings ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => (<div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />))}</div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PRIORITIES.map((p) => (
                <div key={p}>
                  <label className={cn('mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide', PRIO_CLS[p])}><span className="h-2 w-2 rounded-full bg-current" />{PRIO_LABEL[p]}</label>
                  <div className="flex items-center gap-2">
                    <input type="number" min={1} className={inputCls} value={settings.slaByPriority[p]} onChange={(e) => setSla(p, Math.max(1, Number(e.target.value) || 1))} />
                    <span className="whitespace-nowrap text-xs text-gray-400">min</span>
                  </div>
                  <p className="mt-1 text-[11px] text-gray-400">≈ {slaText(settings.slaByPriority[p])}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Seção C: Envio automático ── */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-700"><Send size={16} className="text-brand-600" />Envio automático (padrão)</h2>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
          {loadingSet || !settings ? (
            <div className="h-40 animate-pulse rounded-lg bg-gray-100" />
          ) : (
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
                <input type="checkbox" checked={settings.autoSend.enabled} onChange={(e) => setAuto('enabled', e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                Habilitar envio automático de avisos por padrão
              </label>

              <div className={cn('space-y-4 transition-opacity', !settings.autoSend.enabled && 'pointer-events-none opacity-50')}>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">Dias permitidos</label>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAYS.map(([val, lbl]) => (
                      <button key={val} type="button" onClick={() => toggleDay(val)} className={cn('rounded-lg border px-3 py-1.5 text-xs font-medium', settings.autoSend.allowedDays.includes(val) ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50')}>{lbl}</button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <div><label className="mb-1 block text-xs font-medium text-gray-700">Início</label><input type="time" className={inputCls} value={settings.autoSend.startTime} onChange={(e) => setAuto('startTime', e.target.value)} /></div>
                  <div><label className="mb-1 block text-xs font-medium text-gray-700">Fim</label><input type="time" className={inputCls} value={settings.autoSend.endTime} onChange={(e) => setAuto('endTime', e.target.value)} /></div>
                  <div><label className="mb-1 block text-xs font-medium text-gray-700">Frequência</label><select className={inputCls} value={settings.autoSend.frequency} onChange={(e) => setAuto('frequency', e.target.value)}>{FREQS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                  <div><label className="mb-1 block text-xs font-medium text-gray-700">Máx. de envios</label><input type="number" min={1} max={100} className={inputCls} value={settings.autoSend.maxSends} onChange={(e) => setAuto('maxSends', Math.max(1, Number(e.target.value) || 1))} /></div>
                  <div><label className="mb-1 block text-xs font-medium text-gray-700">Envios por dia</label><input type="number" min={1} max={24} className={inputCls} value={settings.autoSend.sendsPerDay} onChange={(e) => setAuto('sendsPerDay', Math.max(1, Number(e.target.value) || 1))} /></div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3">
          {setMsg && <span className={cn('text-sm', /sucesso/.test(setMsg) ? 'text-green-600' : 'text-red-600')}>{setMsg}</span>}
          <button onClick={saveSettings} disabled={savingSet || loadingSet || !settings} className="btn-primary text-sm"><Save size={15} />{savingSet ? 'Salvando...' : 'Salvar padrões'}</button>
        </div>
      </section>

      {/* Modal tipo de pendência */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={() => setModal(false)}>
          <div className="my-8 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-gray-900">{editingId ? 'Editar tipo' : 'Novo tipo'}</h2><button onClick={() => setModal(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="mb-1 block text-xs font-medium text-gray-700">Nome <span className="text-red-500">*</span></label><input className={inputCls} value={form.label} onChange={(e) => setF('label', e.target.value)} placeholder="Ex: Falta laudo de vistoria" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="mb-1 block text-xs font-medium text-gray-700">Categoria</label><select className={inputCls} value={form.category} onChange={(e) => setF('category', e.target.value)}>{CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}</select></div>
                <div><label className="mb-1 block text-xs font-medium text-gray-700">Ordem</label><input type="number" className={inputCls} value={form.order} onChange={(e) => setF('order', Number(e.target.value) || 0)} /></div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.active} onChange={(e) => setF('active', e.target.checked)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Ativo</label>
              {optError && <p className="text-sm text-red-600">{optError}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2"><button onClick={() => setModal(false)} className="btn-secondary text-sm">Cancelar</button><button onClick={saveOption} disabled={saving} className="btn-primary text-sm"><Save size={15} />{saving ? 'Salvando...' : 'Salvar'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
