'use client'

import Link from 'next/link'
import { use, useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, Clock3, History, RefreshCw, Save, UserCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LeadDetail {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  source: string | null
  status: string
  notes: string | null
  lostReason: string | null
  assignedToUserName: string | null
  unitName: string | null
  convertedDealId: string | null
  lastContactAt: string | null
  createdAt: string
}

interface LeadTask {
  id: string
  type: string
  title: string
  status: string
  dueAt: string | null
  completedAt: string | null
  notes: string | null
  assignedToUserName: string | null
}

interface TimelineItem {
  id: string
  at: string
  type: string
  title: string
  detail: string | null
  actorName: string | null
  ownerName: string | null
}

interface LeadPayload {
  lead: LeadDetail
  relations: {
    customer: { id: string; name: string | null; phone: string | null; email: string | null } | null
    vehicle: { id: string; plate: string | null; brand: string | null; model: string | null; modelYear: number | null } | null
    deal: { id: string; dealNumber: string | null; status: string; type: string; createdAt: string } | null
    attendance: { id: string; status: string; result: string | null; calledAt: string; finishedAt: string | null } | null
  }
  attendances: Array<{
    id: string
    sellerId: string
    sellerName: string
    status: string
    result: string | null
    type: string | null
    visitType: string | null
    calledAt: string
    acceptedAt: string | null
    finishedAt: string | null
    dealId: string | null
  }>
  calls: Array<{
    id: string
    direction: string
    status: string
    fromNumber: string | null
    toNumber: string | null
    agentUserId: string | null
    agentUserName: string | null
    source: string | null
    startedAt: string | null
    answeredAt: string | null
    endedAt: string | null
    durationSec: number | null
    hasRecording: boolean
    recordingStatus: string | null
  }>
  tasks: LeadTask[]
  timeline: TimelineItem[]
}

const panelCls = 'rounded-2xl border border-gray-200 bg-white p-4 shadow-card'
const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

export default function CrmLeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: leadId } = use(params)
  const [payload, setPayload] = useState<LeadPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingTask, setSavingTask] = useState(false)
  const [form, setForm] = useState({ title: '', type: 'FOLLOW_UP', dueAt: '', notes: '' })

  const load = useCallback(async () => {
    if (!leadId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/crm/leads/${leadId}`, { credentials: 'include' })
      const json = await res.json().catch(() => null) as { data?: LeadPayload } | null
      setPayload(json?.data ?? null)
    } finally {
      setLoading(false)
    }
  }, [leadId])

  useEffect(() => {
    void load()
  }, [load])

  const pendingTasks = useMemo(() => payload?.tasks.filter((item) => item.status !== 'DONE') ?? [], [payload])

  const createTask = async () => {
    if (!leadId) return
    setSavingTask(true)
    try {
      await fetch(`/api/crm/leads/${leadId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: form.title,
          type: form.type,
          dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
          notes: form.notes,
        }),
      })
      setForm({ title: '', type: 'FOLLOW_UP', dueAt: '', notes: '' })
      await load()
    } finally {
      setSavingTask(false)
    }
  }

  const updateTask = async (taskId: string, body: Record<string, unknown>) => {
    await fetch(`/api/crm/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
    await load()
  }

  const lead = payload?.lead

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Link href="/crm/leads" className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition hover:text-gray-700">
            <ArrowLeft size={16} />
            Voltar para leads
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{lead?.name ?? 'Detalhe do lead'}</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {loading ? 'Carregando histórico do lead...' : `${pendingTasks.length} tarefa(s) aberta(s) e ${payload?.timeline.length ?? 0} evento(s) no histórico`}
            </p>
          </div>
        </div>
        <button onClick={() => void load()} disabled={loading || !leadId} className="btn-secondary text-xs">
          <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
          Atualizar
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className={panelCls}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Resumo</p>
              <h2 className="mt-1 text-lg font-semibold text-gray-900">{lead?.status ?? 'Sem etapa'}</h2>
            </div>
            <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">{lead?.source ?? 'MANUAL'}</span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Info label="Responsável" value={lead?.assignedToUserName ?? 'Sem responsável'} />
            <Info label="Unidade" value={lead?.unitName ?? 'Sem unidade'} />
            <Info label="Telefone" value={lead?.phone ?? 'Não informado'} />
            <Info label="E-mail" value={lead?.email ?? 'Não informado'} />
            <Info label="Último contato" value={lead?.lastContactAt ? new Date(lead.lastContactAt).toLocaleString('pt-BR') : 'Sem contato'} />
            <Info label="Criado em" value={lead?.createdAt ? new Date(lead.createdAt).toLocaleString('pt-BR') : '-'} />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Info label="Cliente vinculado" value={payload?.relations.customer?.name ?? 'Ainda não vinculado'} />
            <Info
              label="Veículo"
              value={payload?.relations.vehicle ? `${payload.relations.vehicle.brand ?? ''} ${payload.relations.vehicle.model ?? ''} ${payload.relations.vehicle.plate ? `• ${payload.relations.vehicle.plate}` : ''}`.trim() : 'Sem veículo'}
            />
            <Info label="Negociação" value={payload?.relations.deal?.dealNumber ?? lead?.convertedDealId ?? 'Ainda não convertida'} />
          </div>

          {(lead?.notes || lead?.lostReason) && (
            <div className="mt-4 space-y-3">
              {lead.notes && <Info label="Observações" value={lead.notes} multiline />}
              {lead.lostReason && <Info label="Motivo da perda" value={lead.lostReason} multiline />}
            </div>
          )}
        </section>

        <section className={panelCls}>
          <div className="flex items-center gap-2">
            <Clock3 size={18} className="text-amber-500" />
            <h2 className="text-lg font-semibold text-gray-900">Follow-up</h2>
          </div>
          <div className="mt-4 grid gap-3">
            <input value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} className={inputCls} placeholder="Ex.: retornar ligação e validar proposta" />
            <div className="grid gap-3 md:grid-cols-2">
              <select value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))} className={inputCls}>
                {['FOLLOW_UP', 'CALL', 'WHATSAPP', 'EMAIL', 'OTHER'].map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <input value={form.dueAt} onChange={(e) => setForm((prev) => ({ ...prev, dueAt: e.target.value }))} type="datetime-local" className={inputCls} />
            </div>
            <textarea value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} className={`${inputCls} min-h-24`} placeholder="Contexto do próximo passo" />
            <button onClick={() => void createTask()} disabled={savingTask} className="btn-primary text-sm">
              <Save size={15} />
              {savingTask ? 'Salvando tarefa...' : 'Adicionar tarefa'}
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {payload?.tasks.map((task) => (
              <div key={task.id} className="rounded-xl border border-gray-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">{task.title}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {task.type} • {task.assignedToUserName ?? 'Sem responsável'} • {task.dueAt ? new Date(task.dueAt).toLocaleString('pt-BR') : 'Sem prazo'}
                    </p>
                  </div>
                  <span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', task.status === 'DONE' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700')}>
                    {task.status}
                  </span>
                </div>
                {task.notes && <p className="mt-2 text-sm text-gray-600">{task.notes}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {task.status !== 'DONE' && (
                    <button onClick={() => void updateTask(task.id, { status: 'DONE' })} className="rounded-lg border border-green-200 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50">
                      <CheckCircle2 size={13} className="mr-1 inline" />
                      Concluir
                    </button>
                  )}
                  <button onClick={() => void updateTask(task.id, { status: 'PENDING' })} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                    <UserCheck size={13} className="mr-1 inline" />
                    Reabrir
                  </button>
                </div>
              </div>
            ))}
            {!loading && !payload?.tasks.length && (
              <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">Nenhum follow-up registrado para este lead.</div>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className={panelCls}>
          <h2 className="text-lg font-semibold text-gray-900">Atendimentos ligados ao lead</h2>
          <div className="mt-4 space-y-3">
            {payload?.attendances.map((item) => (
              <div key={item.id} className="rounded-xl border border-gray-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-gray-900">{item.sellerName}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {new Date(item.calledAt).toLocaleString('pt-BR')}
                      {item.result ? ` • ${item.result}` : ''}
                    </p>
                  </div>
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">{item.status}</span>
                </div>
                <p className="mt-2 text-sm text-gray-600">{[item.type, item.visitType].filter(Boolean).join(' • ') || 'Sem tipo detalhado'}</p>
              </div>
            ))}
            {!loading && !payload?.attendances.length && (
              <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">Nenhum atendimento encontrado para este lead.</div>
            )}
          </div>
        </section>

        <section className={panelCls}>
          <h2 className="text-lg font-semibold text-gray-900">Chamadas de telefonia</h2>
          <div className="mt-4 space-y-3">
            {payload?.calls.map((item) => (
              <div key={item.id} className="rounded-xl border border-gray-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-gray-900">{item.agentUserName ?? 'Sem agente'} • {item.direction}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {item.startedAt ? new Date(item.startedAt).toLocaleString('pt-BR') : 'Sem início'}
                      {item.durationSec ? ` • ${item.durationSec}s` : ''}
                    </p>
                  </div>
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">{item.status}</span>
                </div>
                <p className="mt-2 text-sm text-gray-600">{`${item.fromNumber ?? 'origem indefinida'} -> ${item.toNumber ?? 'destino indefinido'}`}</p>
                <p className="mt-1 text-xs text-gray-500">{item.hasRecording ? `Gravação ${item.recordingStatus ?? 'disponível'}` : 'Sem gravação vinculada'}</p>
              </div>
            ))}
            {!loading && !payload?.calls.length && (
              <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">Nenhuma chamada encontrada para este lead.</div>
            )}
          </div>
        </section>
      </div>

      <section className={panelCls}>
        <div className="flex items-center gap-2">
          <History size={18} className="text-sky-500" />
          <h2 className="text-lg font-semibold text-gray-900">Linha do tempo</h2>
        </div>
        <div className="mt-4 space-y-3">
          {payload?.timeline.map((item) => (
            <div key={item.id} className="rounded-xl border border-gray-200 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-gray-900">{item.title}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {new Date(item.at).toLocaleString('pt-BR')}
                    {item.actorName ? ` • por ${item.actorName}` : ''}
                    {item.ownerName ? ` • responsável ${item.ownerName}` : ''}
                  </p>
                </div>
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">{item.type}</span>
              </div>
              {item.detail && <p className="mt-2 text-sm text-gray-600">{item.detail}</p>}
            </div>
          ))}
          {!loading && !payload?.timeline.length && (
            <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">Ainda não há eventos registrados para este lead.</div>
          )}
        </div>
      </section>
    </div>
  )
}

function Info({ label, value, multiline = false }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={cn('mt-1 text-sm text-gray-800', multiline && 'whitespace-pre-wrap')}>{value}</p>
    </div>
  )
}
