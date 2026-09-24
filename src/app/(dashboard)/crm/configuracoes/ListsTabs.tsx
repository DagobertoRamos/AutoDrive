'use client'

// =============================================================================
// Central de Configurações do CRM — abas de LISTAS (Fase A): Temperaturas,
// Tipos de lead, Origens e Motivos de encerramento. Cada aba salva só a sua
// seção em PUT /api/crm/settings (o servidor mescla com as demais).
// =============================================================================

import { useEffect, useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCrmSettings } from '@/hooks/useCrmSettings'
import type { CloseOutcome, CloseReasonCfg, CrmSettings, LeadTypeCfg, SourceCfg, TemperatureCfg } from '@/lib/crm/settings-core'

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const checkCls = 'rounded border-gray-300 text-brand-600 focus:ring-brand-500'

/** Estado de edição de uma seção + salvar. */
function useSection<K extends keyof CrmSettings>(section: K) {
  const { settings, reload } = useCrmSettings()
  const [items, setItems] = useState<CrmSettings[K]>(settings[section])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  // Sincroniza com o servidor enquanto não houver edição local.
  useEffect(() => { if (!dirty) setItems(settings[section]) }, [settings, section, dirty])

  const update = (next: CrmSettings[K]) => { setItems(next); setDirty(true); setMsg(null) }
  const save = async () => {
    setSaving(true); setMsg(null)
    try {
      const r = await fetch('/api/crm/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ [section]: items }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg({ ok: false, text: j?.error ?? 'Falha ao salvar.' }); return }
      setDirty(false); await reload(); setMsg({ ok: true, text: 'Salvo.' })
    } catch { setMsg({ ok: false, text: 'Erro de rede.' }) } finally { setSaving(false) }
  }
  return { items, update, save, saving, dirty, msg }
}

function Card({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
      <div className="mb-3"><h2 className="text-sm font-semibold text-gray-900">{title}</h2><p className="text-xs text-gray-500">{hint}</p></div>
      {children}
    </div>
  )
}

function SaveBar({ canManage, save, saving, dirty, msg }: { canManage: boolean; save: () => void; saving: boolean; dirty: boolean; msg: { ok: boolean; text: string } | null }) {
  if (!canManage) return null
  return (
    <div className="mt-4 flex items-center justify-end gap-3">
      {msg && <span className={cn('text-sm', msg.ok ? 'text-green-600' : 'text-red-600')}>{msg.text}</span>}
      <button onClick={save} disabled={saving || !dirty} className="btn-primary text-sm"><Save size={15} />{saving ? 'Salvando…' : 'Salvar'}</button>
    </div>
  )
}

// ── Temperaturas ──────────────────────────────────────────────────────────────
export function TemperaturesTab({ canManage }: { canManage: boolean }) {
  const s = useSection('temperatures')
  const set = (value: string, patch: Partial<TemperatureCfg>) => s.update(s.items.map((t) => t.value === value ? { ...t, ...patch } : t))
  return (
    <Card title="Temperaturas" hint="Nome e cor de cada nível. Temperatura desativada some dos botões do lead (leads que já a têm continuam mostrando).">
      <ul className="space-y-2">
        {s.items.map((t) => (
          <li key={t.value} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/60 p-2">
            <input type="color" disabled={!canManage} value={t.color} onChange={(e) => set(t.value, { color: e.target.value })} className="h-8 w-8 rounded border border-gray-200" aria-label="Cor" />
            <input disabled={!canManage} className={cn(inputCls, 'flex-1 min-w-[140px]')} value={t.label} onChange={(e) => set(t.value, { label: e.target.value })} />
            <span className="rounded bg-gray-200 px-1.5 py-0.5 font-mono text-[10px] text-gray-600">{t.value}</span>
            <label className="flex items-center gap-1 text-xs text-gray-600"><input type="checkbox" disabled={!canManage} checked={t.active} onChange={(e) => set(t.value, { active: e.target.checked })} className={checkCls} />Ativa</label>
          </li>
        ))}
      </ul>
      <SaveBar canManage={canManage} {...s} />
    </Card>
  )
}

// ── Tipos de lead ─────────────────────────────────────────────────────────────
export function LeadTypesTab({ canManage }: { canManage: boolean }) {
  const s = useSection('leadTypes')
  const set = (i: number, patch: Partial<LeadTypeCfg>) => s.update(s.items.map((t, idx) => idx === i ? { ...t, ...patch } : t))
  return (
    <Card title="Tipos de lead" hint="Classifica o interesse do cliente (compra, troca, consignação…). Escolhido no lead e usado como filtro na lista.">
      <ul className="space-y-2">
        {s.items.map((t, i) => (
          <li key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/60 p-2">
            <input type="color" disabled={!canManage} value={t.color} onChange={(e) => set(i, { color: e.target.value })} className="h-8 w-8 rounded border border-gray-200" aria-label="Cor" />
            <input disabled={!canManage} className={cn(inputCls, 'flex-1 min-w-[140px]')} placeholder="Nome do tipo" value={t.label} onChange={(e) => set(i, { label: e.target.value })} />
            <label className="flex items-center gap-1 text-xs text-gray-600"><input type="checkbox" disabled={!canManage} checked={t.active} onChange={(e) => set(i, { active: e.target.checked })} className={checkCls} />Ativo</label>
            {canManage && <button onClick={() => s.update(s.items.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-red-600" aria-label={`Remover ${t.label}`}><Trash2 size={14} /></button>}
          </li>
        ))}
      </ul>
      {canManage && (
        <button onClick={() => s.update([...s.items, { id: '', label: '', color: '#6b7280', active: true }])} className="mt-2 flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"><Plus size={13} />Adicionar tipo</button>
      )}
      <p className="mt-2 text-[11px] text-gray-400">Prefira desativar a remover: leads que já usam um tipo removido ficam sem tipo.</p>
      <SaveBar canManage={canManage} {...s} />
    </Card>
  )
}

// ── Origens ───────────────────────────────────────────────────────────────────
export function SourcesTab({ canManage }: { canManage: boolean }) {
  const s = useSection('sources')
  const set = (i: number, patch: Partial<SourceCfg>) => s.update(s.items.map((t, idx) => idx === i ? { ...t, ...patch } : t))
  return (
    <Card title="Origens" hint="De onde o lead veio. As origens do sistema (integrações) podem ser renomeadas, não removidas. Origens ativas aparecem ao cadastrar um lead.">
      <ul className="space-y-2">
        {s.items.map((t, i) => (
          <li key={t.code || `new-${i}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/60 p-2">
            <input disabled={!canManage} className={cn(inputCls, 'flex-1 min-w-[140px]')} placeholder="Nome da origem (ex.: Instagram, Indicação)" value={t.label} onChange={(e) => set(i, { label: e.target.value })} />
            {t.code && <span className="rounded bg-gray-200 px-1.5 py-0.5 font-mono text-[10px] text-gray-600">{t.code}</span>}
            {t.system && <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] text-sky-700">sistema</span>}
            <label className="flex items-center gap-1 text-xs text-gray-600"><input type="checkbox" disabled={!canManage} checked={t.active} onChange={(e) => set(i, { active: e.target.checked })} className={checkCls} />Ativa</label>
            {canManage && !t.system && <button onClick={() => s.update(s.items.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-red-600" aria-label={`Remover ${t.label}`}><Trash2 size={14} /></button>}
          </li>
        ))}
      </ul>
      {canManage && (
        <button onClick={() => s.update([...s.items, { code: '', label: '', active: true, system: false }])} className="mt-2 flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"><Plus size={13} />Adicionar origem</button>
      )}
      <SaveBar canManage={canManage} {...s} />
    </Card>
  )
}

// ── Motivos de encerramento ───────────────────────────────────────────────────
const OUTCOMES: { value: CloseOutcome; label: string; hint: string }[] = [
  { value: 'LOST', label: 'Perdido', hint: 'Oportunidade real que não fechou.' },
  { value: 'DISCARDED', label: 'Desqualificado', hint: 'Não era uma oportunidade (contato inválido, duplicado…).' },
  { value: 'RECYCLED', label: 'Reciclado', hint: 'Volta a ser trabalhado no futuro.' },
]

export function CloseReasonsTab({ canManage }: { canManage: boolean }) {
  const s = useSection('closeReasons')
  const set = (id: string, patch: Partial<CloseReasonCfg>) => s.update(s.items.map((r) => r.id === id ? { ...r, ...patch } : r))
  let newSeq = 0
  return (
    <Card title="Motivos de encerramento" hint="Lista oferecida ao marcar um lead como perdido, desqualificado ou reciclado — no detalhe do lead e ao mover no Kanban.">
      <div className="grid gap-4 lg:grid-cols-3">
        {OUTCOMES.map((o) => {
          const list = s.items.filter((r) => r.outcome === o.value)
          return (
            <div key={o.value} className="rounded-lg border border-gray-100 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-700">{o.label}</h3>
              <p className="mb-2 text-[11px] text-gray-400">{o.hint}</p>
              <ul className="space-y-1.5">
                {list.map((r) => (
                  <li key={r.id} className="flex items-center gap-1.5">
                    <input type="checkbox" disabled={!canManage} checked={r.active} onChange={(e) => set(r.id, { active: e.target.checked })} className={checkCls} aria-label="Ativo" />
                    <input disabled={!canManage} className={cn(inputCls, 'py-1 text-xs', !r.active && 'text-gray-400 line-through')} value={r.label} onChange={(e) => set(r.id, { label: e.target.value })} />
                    {canManage && <button onClick={() => s.update(s.items.filter((x) => x.id !== r.id))} className="text-gray-400 hover:text-red-600" aria-label={`Remover ${r.label}`}><Trash2 size={13} /></button>}
                  </li>
                ))}
              </ul>
              {canManage && (
                <button
                  onClick={() => s.update([...s.items, { id: `new-${o.value}-${Date.now()}-${newSeq++}`, label: '', outcome: o.value, active: true }])}
                  className="mt-2 flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
                ><Plus size={13} />Adicionar motivo</button>
              )}
            </div>
          )
        })}
      </div>
      <SaveBar canManage={canManage} {...s} />
    </Card>
  )
}
