'use client'

// =============================================================================
// Central de Configurações do CRM — Automações (Fase C).
// Regra = QUANDO (gatilho) + SE (condições) + ENTÃO (ações). Salva a seção
// `automations` em PUT /api/crm/settings.
// =============================================================================

import { useEffect, useState } from 'react'
import { Pencil, Plus, Trash2, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CRM_STAGE_OPTIONS } from '@/lib/crm/shared'
import { useCrmSettings } from '@/hooks/useCrmSettings'
import { describeAction, MAX_ACTIONS_PER_RULE, type AutomationAction, type AutomationRule, type AutomationTrigger } from '@/lib/crm/automations-core'
import type { Pipeline } from '@/lib/crm/pipelines-core'
import { Card, SaveBar, checkCls, inputCls, useSection } from './ListsTabs'

const TRIGGERS: { value: AutomationTrigger; label: string; hint: string }[] = [
  { value: 'LEAD_CREATED', label: 'Lead criado', hint: 'Qualquer origem (CRM, AutoConf, fila…). Leads que chegam pelas integrações são processados em até 1 minuto.' },
  { value: 'STAGE_ENTERED', label: 'Lead entrou em uma etapa', hint: 'Ao mover no Kanban/detalhe ou ao marcar como convertido/perdido.' },
  { value: 'NO_CONTACT', label: 'Lead parado sem contato', hint: 'Uma vez por período parado; registrar contato reinicia.' },
]
const ACTION_LABEL: Record<AutomationAction['type'], string> = {
  CREATE_TASK: 'Criar tarefa', NOTIFY: 'Enviar aviso', ADD_TAG: 'Aplicar etiqueta', SET_TEMPERATURE: 'Definir temperatura', ASSIGN_USER: 'Atribuir responsável',
}
const TASK_TYPES = [['FOLLOW_UP', 'Follow-up'], ['CALL', 'Ligação'], ['WHATSAPP', 'WhatsApp'], ['EMAIL', 'E-mail'], ['OTHER', 'Outro']]

function blankAction(type: AutomationAction['type']): AutomationAction {
  switch (type) {
    case 'CREATE_TASK': return { type, title: 'Retornar para {lead}', taskType: 'FOLLOW_UP', dueInHours: 24 }
    case 'NOTIFY': return { type, target: 'ASSIGNEE', message: '{lead} precisa de atenção.' }
    case 'ADD_TAG': return { type, tagId: '' }
    case 'SET_TEMPERATURE': return { type, value: 'HOT' }
    case 'ASSIGN_USER': return { type, userId: '' }
  }
}
function blankRule(): AutomationRule {
  return { id: `new-${Date.now()}`, name: '', active: true, trigger: 'STAGE_ENTERED', hours: 24, conditions: {}, actions: [blankAction('CREATE_TASK')], createdAt: '' }
}

function Chips({ options, value, onChange, disabled }: { options: { value: string; label: string; color?: string }[]; value: string[] | undefined; onChange: (v: string[]) => void; disabled: boolean }) {
  const sel = value ?? []
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => {
        const on = sel.includes(o.value)
        return (
          <button key={o.value} type="button" disabled={disabled} onClick={() => onChange(on ? sel.filter((x) => x !== o.value) : [...sel, o.value])}
            className={cn('rounded-md border px-2 py-0.5 text-[11px] font-medium', on ? 'border-transparent text-white' : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100')}
            style={on ? { background: o.color ?? '#4f46e5' } : {}}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export default function AutomationsTab({ canManage }: { canManage: boolean }) {
  const s = useSection('automations')
  const { settings } = useCrmSettings()
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [tags, setTags] = useState<{ id: string; name: string; color: string | null }[]>([])
  const [users, setUsers] = useState<{ id: string; name: string | null }[]>([])
  const [editing, setEditing] = useState<AutomationRule | null>(null)

  useEffect(() => {
    fetch('/api/crm/pipelines', { credentials: 'include' }).then((r) => r.json()).then((j) => setPipelines(j?.data ?? [])).catch(() => {})
    fetch('/api/crm/config/tags', { credentials: 'include' }).then((r) => r.json()).then((j) => setTags(j?.data ?? [])).catch(() => {})
    fetch('/api/crm/context', { credentials: 'include' }).then((r) => r.json()).then((j) => setUsers(j?.data?.sellers ?? [])).catch(() => {})
  }, [])

  const upsert = (rule: AutomationRule) => {
    const exists = s.items.some((r) => r.id === rule.id)
    s.update(exists ? s.items.map((r) => r.id === rule.id ? rule : r) : [...s.items, rule])
    setEditing(null)
  }
  const pipelineName = (id?: string) => pipelines.find((p) => p.id === id)?.name
  const stageName = (id?: string) => pipelines.flatMap((p) => p.stages).find((st) => st.id === id)?.name

  const summary = (r: AutomationRule) => {
    const t = TRIGGERS.find((x) => x.value === r.trigger)?.label ?? r.trigger
    const when = r.trigger === 'NO_CONTACT' ? `${t} há ${r.hours}h` : r.trigger === 'STAGE_ENTERED' && (r.conditions.stageId || r.conditions.statusCode)
      ? `Entrou em "${stageName(r.conditions.stageId) ?? CRM_STAGE_OPTIONS.find((o) => o.value === r.conditions.statusCode)?.label ?? '?'}"` : t
    const where = [pipelineName(r.conditions.pipelineId), r.conditions.sources?.length ? `${r.conditions.sources.length} origem(ns)` : '', r.conditions.leadTypes?.length ? `${r.conditions.leadTypes.length} tipo(s)` : '', r.conditions.temperatures?.length ? `${r.conditions.temperatures.length} temperatura(s)` : ''].filter(Boolean).join(' · ')
    return { when, where }
  }

  return (
    <Card title="Automações" hint="QUANDO algo acontece com o lead, SE ele atender às condições, ENTÃO o sistema executa as ações. Use {lead} nos textos para o nome do cliente.">
      {s.items.length === 0 && !editing && <p className="py-6 text-center text-sm text-gray-400">Nenhuma automação. Exemplo: “Entrou em Proposta → criar tarefa de retorno em 24h e avisar o gerente”.</p>}
      <ul className="space-y-2">
        {s.items.map((r) => {
          const { when, where } = summary(r)
          return (
            <li key={r.id} className={cn('rounded-lg border border-gray-100 p-3', !r.active && 'opacity-60')}>
              <div className="flex flex-wrap items-center gap-2">
                <Zap size={14} className="text-amber-500" />
                <span className="font-medium text-gray-900">{r.name}</span>
                {!r.active && <span className="text-[11px] text-gray-400">desativada</span>}
                {canManage && (
                  <div className="ml-auto flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs text-gray-600"><input type="checkbox" checked={r.active} onChange={(e) => s.update(s.items.map((x) => x.id === r.id ? { ...x, active: e.target.checked } : x))} className={checkCls} />Ativa</label>
                    <button onClick={() => setEditing(r)} className="text-gray-400 hover:text-gray-700" aria-label={`Editar ${r.name}`}><Pencil size={14} /></button>
                    <button onClick={() => { if (confirm(`Excluir a automação "${r.name}"?`)) s.update(s.items.filter((x) => x.id !== r.id)) }} className="text-gray-400 hover:text-red-600" aria-label={`Excluir ${r.name}`}><Trash2 size={14} /></button>
                  </div>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-600"><b>Quando:</b> {when}{where && <> · <b>Se:</b> {where}</>}</p>
              <p className="text-xs text-gray-600"><b>Então:</b> {r.actions.map(describeAction).join(' · ')}</p>
            </li>
          )
        })}
      </ul>

      {editing && (
        <RuleEditor
          rule={editing} pipelines={pipelines} tags={tags} users={users}
          sources={settings.sources.filter((x) => x.active).map((x) => ({ value: x.code, label: x.label }))}
          leadTypes={settings.leadTypes.filter((x) => x.active).map((x) => ({ value: x.id, label: x.label, color: x.color }))}
          temperatures={settings.temperatures.filter((x) => x.active).map((x) => ({ value: x.value, label: x.label, color: x.color }))}
          onCancel={() => setEditing(null)} onDone={upsert}
        />
      )}

      {canManage && !editing && (
        <button onClick={() => setEditing(blankRule())} className="mt-3 flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"><Plus size={13} />Nova automação</button>
      )}
      <SaveBar canManage={canManage} {...s} />
    </Card>
  )
}

function RuleEditor({ rule, pipelines, tags, users, sources, leadTypes, temperatures, onCancel, onDone }: {
  rule: AutomationRule; pipelines: Pipeline[]
  tags: { id: string; name: string; color: string | null }[]; users: { id: string; name: string | null }[]
  sources: { value: string; label: string }[]; leadTypes: { value: string; label: string; color?: string }[]; temperatures: { value: string; label: string; color?: string }[]
  onCancel: () => void; onDone: (r: AutomationRule) => void
}) {
  const [r, setR] = useState<AutomationRule>(rule)
  const [err, setErr] = useState('')
  const set = (patch: Partial<AutomationRule>) => setR((x) => ({ ...x, ...patch }))
  const setCond = (patch: Partial<AutomationRule['conditions']>) => setR((x) => ({ ...x, conditions: { ...x.conditions, ...patch } }))
  const setAction = (i: number, a: AutomationAction) => setR((x) => ({ ...x, actions: x.actions.map((y, idx) => idx === i ? a : y) }))
  const pipeline = pipelines.find((p) => p.id === r.conditions.pipelineId)
  const stageOptions = (pipeline ? [pipeline] : pipelines).flatMap((p) => p.stages.filter((st) => st.active).map((st) => ({ id: st.id, label: pipeline ? st.name : `${p.name} › ${st.name}` })))
  // Etapa: id exato; "status:X" = qualquer etapa daquele status.
  const stageValue = r.conditions.stageId ?? (r.conditions.statusCode ? `status:${r.conditions.statusCode}` : '')

  const done = () => {
    if (!r.name.trim()) { setErr('Dê um nome à automação.'); return }
    if (r.actions.length === 0) { setErr('Adicione pelo menos uma ação.'); return }
    const bad = r.actions.find((a) => (a.type === 'ADD_TAG' && !a.tagId) || (a.type === 'ASSIGN_USER' && !a.userId) || (a.type === 'CREATE_TASK' && !a.title.trim()) || (a.type === 'NOTIFY' && !a.message.trim()))
    if (bad) { setErr(`Complete a ação "${ACTION_LABEL[bad.type]}".`); return }
    onDone(r)
  }

  return (
    <div className="mt-3 space-y-4 rounded-xl border border-brand-200 bg-brand-50/40 p-4">
      <input className={inputCls} placeholder="Nome da automação (ex.: Proposta enviada → retorno em 24h)" value={r.name} onChange={(e) => set({ name: e.target.value })} />

      <section>
        <h4 className="mb-1 text-xs font-bold uppercase tracking-wider text-gray-500">Quando</h4>
        <div className="flex flex-wrap items-center gap-2">
          <select value={r.trigger} onChange={(e) => set({ trigger: e.target.value as AutomationTrigger, conditions: { ...r.conditions, stageId: undefined, statusCode: undefined } })} className={cn(inputCls, 'w-auto')}>
            {TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          {r.trigger === 'NO_CONTACT' && (
            <label className="flex items-center gap-2 text-sm text-gray-600">há mais de <input type="number" min={1} value={r.hours} onChange={(e) => set({ hours: Number(e.target.value) })} className={cn(inputCls, 'w-20')} /> horas</label>
          )}
          {r.trigger === 'STAGE_ENTERED' && (
            <select value={stageValue} onChange={(e) => {
              const v = e.target.value
              setCond(v.startsWith('status:') ? { statusCode: v.slice(7), stageId: undefined } : { stageId: v || undefined, statusCode: undefined })
            }} className={cn(inputCls, 'w-auto')} aria-label="Etapa">
              <option value="">Qualquer etapa</option>
              <optgroup label="Etapa do funil">{stageOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</optgroup>
              <optgroup label="Qualquer etapa com o status">{CRM_STAGE_OPTIONS.map((o) => <option key={o.value} value={`status:${o.value}`}>{o.label}</option>)}</optgroup>
            </select>
          )}
        </div>
        <p className="mt-1 text-[11px] text-gray-400">{TRIGGERS.find((t) => t.value === r.trigger)?.hint}</p>
      </section>

      <section className="space-y-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">Se (opcional)</h4>
        {pipelines.length > 1 && (
          <label className="flex flex-wrap items-center gap-2 text-sm text-gray-600">Funil
            <select value={r.conditions.pipelineId ?? ''} onChange={(e) => setCond({ pipelineId: e.target.value || undefined, stageId: undefined })} className={cn(inputCls, 'w-auto')}>
              <option value="">Qualquer funil</option>
              {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        <div><p className="mb-1 text-xs text-gray-500">Origem</p><Chips options={sources} value={r.conditions.sources} onChange={(v) => setCond({ sources: v.length ? v : undefined })} disabled={false} /></div>
        {leadTypes.length > 0 && <div><p className="mb-1 text-xs text-gray-500">Tipo de lead</p><Chips options={leadTypes} value={r.conditions.leadTypes} onChange={(v) => setCond({ leadTypes: v.length ? v : undefined })} disabled={false} /></div>}
        <div><p className="mb-1 text-xs text-gray-500">Temperatura</p><Chips options={temperatures} value={r.conditions.temperatures} onChange={(v) => setCond({ temperatures: v.length ? v : undefined })} disabled={false} /></div>
      </section>

      <section className="space-y-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">Então</h4>
        {r.actions.map((a, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white p-2">
            <select value={a.type} onChange={(e) => setAction(i, blankAction(e.target.value as AutomationAction['type']))} className={cn(inputCls, 'w-auto')} aria-label="Ação">
              {Object.entries(ACTION_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            {a.type === 'CREATE_TASK' && (<>
              <input className={cn(inputCls, 'min-w-[180px] flex-1')} value={a.title} onChange={(e) => setAction(i, { ...a, title: e.target.value })} placeholder="Título da tarefa" />
              <select value={a.taskType} onChange={(e) => setAction(i, { ...a, taskType: e.target.value })} className={cn(inputCls, 'w-auto')}>{TASK_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <label className="flex items-center gap-1 text-xs text-gray-600">vence em <input type="number" min={0} value={a.dueInHours} onChange={(e) => setAction(i, { ...a, dueInHours: Number(e.target.value) })} className={cn(inputCls, 'w-16')} />h</label>
            </>)}
            {a.type === 'NOTIFY' && (<>
              <select value={a.target} onChange={(e) => setAction(i, { ...a, target: e.target.value as 'ASSIGNEE' | 'MANAGERS' })} className={cn(inputCls, 'w-auto')}>
                <option value="ASSIGNEE">para o responsável</option><option value="MANAGERS">para os gestores</option>
              </select>
              <input className={cn(inputCls, 'min-w-[200px] flex-1')} value={a.message} onChange={(e) => setAction(i, { ...a, message: e.target.value })} placeholder="Mensagem" />
            </>)}
            {a.type === 'ADD_TAG' && (
              <select value={a.tagId} onChange={(e) => setAction(i, { ...a, tagId: e.target.value })} className={cn(inputCls, 'w-auto')}>
                <option value="">Escolha a etiqueta…</option>{tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            {a.type === 'SET_TEMPERATURE' && (
              <select value={a.value} onChange={(e) => setAction(i, { ...a, value: e.target.value })} className={cn(inputCls, 'w-auto')}>
                {temperatures.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            )}
            {a.type === 'ASSIGN_USER' && (
              <select value={a.userId} onChange={(e) => setAction(i, { ...a, userId: e.target.value })} className={cn(inputCls, 'w-auto')}>
                <option value="">Escolha o usuário…</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.id}</option>)}
              </select>
            )}
            <button onClick={() => setR((x) => ({ ...x, actions: x.actions.filter((_, idx) => idx !== i) }))} className="ml-auto text-gray-400 hover:text-red-600" aria-label="Remover ação"><Trash2 size={14} /></button>
          </div>
        ))}
        {r.actions.length < MAX_ACTIONS_PER_RULE && (
          <button onClick={() => setR((x) => ({ ...x, actions: [...x.actions, blankAction('NOTIFY')] }))} className="flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"><Plus size={13} />Adicionar ação</button>
        )}
      </section>

      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
        <button onClick={done} className="btn-primary text-sm">OK</button>
      </div>
      <p className="text-right text-[11px] text-gray-400">Depois de OK, clique em Salvar para gravar.</p>
    </div>
  )
}
