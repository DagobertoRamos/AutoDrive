'use client'

// =============================================================================
// CRM Pipelines — aba "Funis e etapas" da Central de Configurações.
// Cada funil tem etapas livres; cada etapa diz qual STATUS o lead assume ao
// entrar nela (é o status que integrações/relatórios enxergam).
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, GripVertical, Plus, RefreshCw, Save, Star, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CRM_REQUIRABLE_FIELDS, CRM_STAGE_OPTIONS } from '@/lib/crm/shared'
import type { Pipeline, PipelineStage } from '@/lib/crm/pipelines-core'

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const NEW_ID = '__new__'

type DraftStage = Pick<PipelineStage, 'name' | 'color' | 'active' | 'statusCode' | 'requiredFields' | 'allowSkip' | 'allowBack'> & { id?: string; key: string }
interface Draft { id: string; name: string; description: string; color: string; active: boolean; isDefault: boolean; stages: DraftStage[] }

let keySeq = 0
const nextKey = () => `k${++keySeq}`

function toDraft(p: Pipeline): Draft {
  return {
    id: p.id, name: p.name, description: p.description ?? '', color: p.color ?? '#6366f1', active: p.active, isDefault: p.isDefault,
    stages: p.stages.map((s) => ({
      id: s.id, key: nextKey(), name: s.name, color: s.color, active: s.active, statusCode: s.statusCode,
      requiredFields: s.requiredFields, allowSkip: s.allowSkip, allowBack: s.allowBack,
    })),
  }
}

function blankStage(name: string, statusCode: string, color: string): DraftStage {
  return { key: nextKey(), name, color, active: true, statusCode, requiredFields: [], allowSkip: true, allowBack: true }
}

function newPipelineDraft(): Draft {
  return {
    id: NEW_ID, name: '', description: '', color: '#0ea5e9', active: true, isDefault: false,
    stages: [
      blankStage('Novo', 'NEW', '#6366f1'),
      blankStage('Em contato', 'WORKING', '#f59e0b'),
      blankStage('Proposta', 'QUALIFIED', '#10b981'),
      blankStage('Ganho', 'CONVERTED', '#22c55e'),
      blankStage('Perdido', 'LOST', '#ef4444'),
    ],
  }
}

export default function PipelinesTab({ canManage }: { canManage: boolean }) {
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async (selectId?: string) => {
    setLoading(true)
    try {
      const r = await fetch('/api/crm/pipelines?includeInactive=1', { credentials: 'include' }).then((x) => x.json())
      const list: Pipeline[] = r?.data ?? []
      setPipelines(list)
      const pick = list.find((p) => p.id === selectId) ?? list[0]
      setDraft(pick ? toDraft(pick) : null)
      setDirty(false)
    } catch { /* noop */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const select = (d: Draft) => {
    if (dirty && !confirm('Descartar as alterações não salvas deste funil?')) return
    setDraft(d); setDirty(false); setMsg(null)
  }
  const edit = (patch: Partial<Draft>) => { setDraft((d) => d && { ...d, ...patch }); setDirty(true) }
  const editStage = (key: string, patch: Partial<DraftStage>) => {
    setDraft((d) => d && { ...d, stages: d.stages.map((s) => s.key === key ? { ...s, ...patch } : s) }); setDirty(true)
  }
  const moveStage = (i: number, dir: -1 | 1) => {
    setDraft((d) => {
      if (!d) return d
      const j = i + dir; if (j < 0 || j >= d.stages.length) return d
      const stages = [...d.stages];[stages[i], stages[j]] = [stages[j], stages[i]]
      return { ...d, stages }
    }); setDirty(true)
  }
  const removeStage = (key: string) => {
    if (!confirm('Remover esta etapa? Leads que estão nela passam a aparecer na etapa do mesmo status (ou em "Sem etapa").')) return
    setDraft((d) => d && { ...d, stages: d.stages.filter((s) => s.key !== key) }); setDirty(true)
  }
  const addStage = () => { setDraft((d) => d && { ...d, stages: [...d.stages, blankStage('', 'WORKING', '#6b7280')] }); setDirty(true) }

  const save = async () => {
    if (!draft) return
    setSaving(true); setMsg(null)
    try {
      const isNew = draft.id === NEW_ID
      const body = {
        name: draft.name, description: draft.description, color: draft.color, active: draft.active,
        stages: draft.stages.map(({ key: _key, ...s }) => s),
      }
      const r = await fetch(isNew ? '/api/crm/pipelines' : `/api/crm/pipelines/${draft.id}`, {
        method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg({ ok: false, text: j?.error ?? 'Falha ao salvar.' }); return }
      await load(j?.data?.id)
      setMsg({ ok: true, text: 'Funil salvo.' })
    } catch { setMsg({ ok: false, text: 'Erro de rede.' }) } finally { setSaving(false) }
  }

  const remove = async () => {
    if (!draft || draft.id === NEW_ID || draft.isDefault) return
    if (!confirm(`Excluir o funil "${draft.name}"? Os leads dele voltam para o funil principal.`)) return
    const r = await fetch(`/api/crm/pipelines/${draft.id}`, { method: 'DELETE', credentials: 'include' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setMsg({ ok: false, text: j?.error ?? 'Falha ao excluir.' }); return }
    await load()
    setMsg({ ok: true, text: `Funil excluído. ${j?.data?.movedLeads ?? 0} lead(s) voltaram ao funil principal.` })
  }

  // Status sem etapa alguma → coluna "Sem etapa"; só com etapa desativada → oculto.
  const withoutActive = draft ? CRM_STAGE_OPTIONS.filter((o) => !draft.stages.some((s) => s.active && s.statusCode === o.value)) : []
  const unmappedStatuses = withoutActive.filter((o) => !draft?.stages.some((s) => s.statusCode === o.value)).map((o) => o.label)
  const hiddenStatuses = withoutActive.filter((o) => draft?.stages.some((s) => s.statusCode === o.value)).map((o) => o.label)

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      {/* Lista de funis */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-card">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Funis</h2>
          <button onClick={() => void load(draft?.id)} className="text-gray-400 hover:text-gray-700" title="Atualizar"><RefreshCw size={13} className={cn(loading && 'animate-spin')} /></button>
        </div>
        {loading && !pipelines.length ? (
          <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-gray-100" />)}</div>
        ) : (
          <ul className="space-y-1">
            {pipelines.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => select(toDraft(p))}
                  className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm',
                    draft?.id === p.id ? 'bg-brand-50 font-semibold text-brand-700' : 'text-gray-700 hover:bg-gray-50',
                    !p.active && 'opacity-60')}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color ?? '#6366f1' }} />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {p.isDefault && <Star size={12} className="shrink-0 text-amber-500" aria-label="Funil principal" />}
                  {!p.active && <span className="text-[10px] text-gray-400">inativo</span>}
                </button>
              </li>
            ))}
            {draft?.id === NEW_ID && (
              <li><span className="flex items-center gap-2 rounded-lg bg-brand-50 px-2.5 py-2 text-sm font-semibold text-brand-700">Novo funil (não salvo)</span></li>
            )}
          </ul>
        )}
        {canManage && (
          <button onClick={() => select(newPipelineDraft())} className="btn-secondary mt-3 w-full justify-center text-xs"><Plus size={13} />Novo funil</button>
        )}
      </div>

      {/* Editor */}
      {draft && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
          <div className="grid gap-3 sm:grid-cols-[auto_1fr_1fr]">
            <input type="color" disabled={!canManage} value={draft.color} onChange={(e) => edit({ color: e.target.value })} className="h-10 w-10 rounded border border-gray-200" aria-label="Cor do funil" />
            <input disabled={!canManage} className={inputCls} placeholder="Nome do funil (ex.: Repasse, Consórcio, Pós-venda)" value={draft.name} onChange={(e) => edit({ name: e.target.value })} />
            <input disabled={!canManage} className={inputCls} placeholder="Descrição (opcional)" value={draft.description} onChange={(e) => edit({ description: e.target.value })} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-gray-600">
            {draft.isDefault ? (
              <span className="flex items-center gap-1 text-amber-700"><Star size={12} />Funil principal — recebe todo lead que chega sem funil definido (integrações, fila, SDR).</span>
            ) : (
              <label className="flex items-center gap-1"><input type="checkbox" disabled={!canManage} checked={draft.active} onChange={(e) => edit({ active: e.target.checked })} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Funil ativo</label>
            )}
          </div>

          <h3 className="mt-5 text-sm font-semibold text-gray-900">Etapas</h3>
          <p className="text-xs text-gray-500">A ordem aqui é a ordem das colunas no Kanban. O <b>status</b> é o que o lead passa a ter ao entrar na etapa — é ele que integrações, relatórios e conversão enxergam.</p>

          <ul className="mt-3 space-y-2">
            {draft.stages.map((s, i) => (
              <li key={s.key} className="rounded-lg border border-gray-100 bg-gray-50/60 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex flex-col leading-none">
                    <button disabled={!canManage || i === 0} onClick={() => moveStage(i, -1)} className="text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Subir etapa">▲</button>
                    <button disabled={!canManage || i === draft.stages.length - 1} onClick={() => moveStage(i, 1)} className="text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Descer etapa">▼</button>
                  </div>
                  <GripVertical size={14} className="text-gray-300" />
                  <input type="color" disabled={!canManage} value={s.color} onChange={(e) => editStage(s.key, { color: e.target.value })} className="h-8 w-8 shrink-0 rounded border border-gray-200" aria-label="Cor da etapa" />
                  <input disabled={!canManage} className={cn(inputCls, 'flex-1 min-w-[140px]')} placeholder="Nome da etapa" value={s.name} onChange={(e) => editStage(s.key, { name: e.target.value })} />
                  <label className="flex items-center gap-1 text-xs text-gray-500">
                    Status
                    <select disabled={!canManage} value={s.statusCode} onChange={(e) => editStage(s.key, { statusCode: e.target.value })} className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs">
                      {CRM_STAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-1 text-xs text-gray-600"><input type="checkbox" disabled={!canManage} checked={s.active} onChange={(e) => editStage(s.key, { active: e.target.checked })} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Ativa</label>
                  {canManage && (
                    <button onClick={() => removeStage(s.key)} className="ml-auto text-gray-400 hover:text-red-600" aria-label={`Remover etapa ${s.name}`}><Trash2 size={14} /></button>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-2 pl-6 text-xs text-gray-600">
                  <label className="flex items-center gap-1"><input type="checkbox" disabled={!canManage} checked={s.allowSkip} onChange={(e) => editStage(s.key, { allowSkip: e.target.checked })} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Permite pular etapas</label>
                  <label className="flex items-center gap-1"><input type="checkbox" disabled={!canManage} checked={s.allowBack} onChange={(e) => editStage(s.key, { allowBack: e.target.checked })} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />Permite retroceder</label>
                  <span className="text-gray-400">·</span>
                  <span className="text-gray-500">Exigir p/ entrar:</span>
                  {CRM_REQUIRABLE_FIELDS.map((f) => (
                    <label key={f.key} className="flex items-center gap-1">
                      <input
                        type="checkbox" disabled={!canManage}
                        checked={s.requiredFields.includes(f.key)}
                        onChange={(e) => editStage(s.key, { requiredFields: e.target.checked ? [...s.requiredFields, f.key] : s.requiredFields.filter((x) => x !== f.key) })}
                        className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />{f.label}
                    </label>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          {canManage && (
            <button onClick={addStage} className="mt-2 flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"><Plus size={13} />Adicionar etapa</button>
          )}

          {unmappedStatuses.length > 0 && (
            <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>Nenhuma etapa para: <b>{unmappedStatuses.join(', ')}</b>. Leads deste funil com esses status aparecem na coluna “Sem etapa” do Kanban.</span>
            </p>
          )}
          {hiddenStatuses.length > 0 && (
            <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
              Etapa desativada para: <b>{hiddenStatuses.join(', ')}</b>. Leads com esses status ficam ocultos do Kanban (continuam na lista de leads).
            </p>
          )}

          {canManage && (
            <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
              {msg && <span className={cn('text-sm', msg.ok ? 'text-green-600' : 'text-red-600')}>{msg.text}</span>}
              {!draft.isDefault && draft.id !== NEW_ID && (
                <button onClick={remove} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"><Trash2 size={14} className="mr-1 inline" />Excluir funil</button>
              )}
              <button onClick={save} disabled={saving || (!dirty && draft.id !== NEW_ID)} className="btn-primary text-sm"><Save size={15} />{saving ? 'Salvando…' : 'Salvar funil'}</button>
            </div>
          )}
          {!canManage && msg && <p className={cn('mt-3 text-sm', msg.ok ? 'text-green-600' : 'text-red-600')}>{msg.text}</p>}
        </div>
      )}
    </div>
  )
}
