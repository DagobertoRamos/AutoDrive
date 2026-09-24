'use client'

// =============================================================================
// Central de Configurações do CRM — GOVERNANÇA (Fase D): Permissões (matriz
// por perfil da loja) e Auditoria (trilha do AuditLog do CRM).
// =============================================================================

import { Fragment, useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Lock, RefreshCw, RotateCcw, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, inputCls } from './ListsTabs'

// ── Permissões ────────────────────────────────────────────────────────────────
interface PermRow { key: string; label: string; group: string; defaults: Record<string, boolean>; locked: string[] }
interface PermData { roles: { value: string; label: string }[]; permissions: PermRow[]; overrides: Record<string, Record<string, boolean>>; canManage: boolean }

export function PermissionsTab() {
  const [data, setData] = useState<PermData | null>(null)
  const [overrides, setOverrides] = useState<Record<string, Record<string, boolean>>>({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const j = await fetch('/api/crm/permissions', { credentials: 'include' }).then((r) => r.json()).catch(() => null)
    if (j?.data) { setData(j.data); setOverrides(j.data.overrides ?? {}); setDirty(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  if (!data) return <Card title="Permissões" hint="Carregando…"><div className="h-40 animate-pulse rounded-lg bg-gray-100" /></Card>
  const canManage = data.canManage

  const value = (p: PermRow, role: string) => p.locked.includes(role) ? true : overrides[p.key]?.[role] ?? p.defaults[role]
  const changed = (p: PermRow, role: string) => typeof overrides[p.key]?.[role] === 'boolean' && overrides[p.key][role] !== p.defaults[role]
  const toggle = (p: PermRow, role: string) => {
    const next = !value(p, role)
    setOverrides((o) => {
      const row = { ...(o[p.key] ?? {}) }
      if (next === p.defaults[role]) delete row[role]; else row[role] = next
      const copy = { ...o, [p.key]: row }
      if (!Object.keys(row).length) delete copy[p.key]
      return copy
    })
    setDirty(true); setMsg(null)
  }
  const save = async () => {
    setSaving(true); setMsg(null)
    try {
      const r = await fetch('/api/crm/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ rolePermissions: overrides }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg({ ok: false, text: j?.error ?? 'Falha ao salvar.' }); return }
      await load(); setMsg({ ok: true, text: 'Permissões salvas. Valem para novos acessos em até 30 segundos.' })
    } catch { setMsg({ ok: false, text: 'Erro de rede.' }) } finally { setSaving(false) }
  }
  const groups = [...new Set(data.permissions.map((p) => p.group))]
  const nChanged = Object.values(overrides).reduce((n, r) => n + Object.keys(r).length, 0)

  return (
    <Card title="Permissões" hint="O que cada perfil pode fazer no CRM desta loja. Células com ponto laranja foram alteradas em relação ao padrão do sistema. Exceções por colaborador (tela de Colaboradores) continuam valendo por cima disto.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-left text-[10px] uppercase tracking-wider text-gray-500">
              <th className="py-2 pr-2 font-semibold">Permissão</th>
              {data.roles.map((r) => <th key={r.value} className="px-1 py-2 text-center font-semibold">{r.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g}>
                <tr><td colSpan={data.roles.length + 1} className="pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">{g}</td></tr>
                {data.permissions.filter((p) => p.group === g).map((p) => (
                  <tr key={p.key} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="py-1.5 pr-2 text-gray-700" title={p.key}>{p.label}</td>
                    {data.roles.map((r) => (
                      <td key={r.value} className="px-1 py-1.5 text-center">
                        {p.locked.includes(r.value) ? (
                          <Lock size={12} className="mx-auto text-gray-300" aria-label="Sempre permitido" />
                        ) : (
                          <span className="relative inline-flex">
                            <input type="checkbox" disabled={!canManage} checked={value(p, r.value)} onChange={() => toggle(p, r.value)}
                              aria-label={`${p.label} — ${r.label}`} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                            {changed(p, r.value) && <span className="absolute -right-1.5 -top-1 h-1.5 w-1.5 rounded-full bg-orange-500" />}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 flex items-center gap-1 text-[11px] text-gray-400"><Lock size={11} />O administrador sempre pode acessar e configurar o CRM (evita a loja ficar sem acesso). O MASTER não é afetado.</p>
      {canManage && (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
          {msg && <span className={cn('text-sm', msg.ok ? 'text-green-600' : 'text-red-600')}>{msg.text}</span>}
          {nChanged > 0 && <button onClick={() => { setOverrides({}); setDirty(true) }} className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"><RotateCcw size={14} />Restaurar padrão</button>}
          <button onClick={save} disabled={saving || !dirty} className="btn-primary text-sm"><Save size={15} />{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      )}
    </Card>
  )
}

// ── Auditoria ─────────────────────────────────────────────────────────────────
interface AuditRow {
  id: string; createdAt: string; action: string; entity: string; entityId: string | null
  userId: string | null; userName: string | null; userRole: string | null; status: string | null
  beforeData: unknown; afterData: unknown; leadName: string | null
}
interface AuditMeta { total: number; page: number; totalPages: number; entities: string[]; actors: { userId: string; name: string }[] }
const ENTITY_LABEL: Record<string, string> = {
  MarketingLead: 'Lead', MarketingLeadTask: 'Tarefa', CrmLeadVisit: 'Visita', CrmPipeline: 'Funil',
  CrmSettings: 'Configurações', CrmAutomation: 'Automação', CrmTag: 'Etiqueta', CrmStage: 'Etapa',
}
const ACTION_LABEL: Record<string, string> = {
  CREATE: 'Criou', UPDATE: 'Alterou', DELETE: 'Excluiu', CONVERT: 'Converteu', LOST: 'Perdeu', DISCARDED: 'Desqualificou',
  RECYCLED: 'Reciclou', CRM_LEAD_DEDUP: 'Unificou duplicado', AUTOMATION_LEAD_CREATED: 'Automação (lead criado)',
  AUTOMATION_STAGE_ENTERED: 'Automação (entrou em etapa)', AUTOMATION_NO_CONTACT: 'Automação (lead parado)',
}

/** Campos que mudaram entre antes/depois (1º nível). */
function diffKeys(before: unknown, after: unknown): string[] {
  const b = before && typeof before === 'object' ? before as Record<string, unknown> : {}
  const a = after && typeof after === 'object' ? after as Record<string, unknown> : {}
  return [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]))
}

export function AuditTab() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [meta, setMeta] = useState<AuditMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<string | null>(null)
  const [f, setF] = useState({ entity: '', userId: '', from: '', to: '', page: 1 })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ page: String(f.page) })
      if (f.entity) p.set('entity', f.entity)
      if (f.userId) p.set('userId', f.userId)
      if (f.from) p.set('from', f.from)
      if (f.to) p.set('to', f.to)
      const j = await fetch(`/api/crm/audit?${p}`, { credentials: 'include' }).then((r) => r.json())
      setRows(j?.data ?? []); setMeta(j?.meta ?? null)
    } catch { /* noop */ } finally { setLoading(false) }
  }, [f])
  useEffect(() => { void load() }, [load])

  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, page: 1, ...patch }))
  const selCls = cn(inputCls, 'w-auto py-1.5 text-xs')

  return (
    <Card title="Auditoria" hint="Quem fez o quê no CRM: leads, tarefas, funis, configurações e o que as automações executaram.">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={f.entity} onChange={(e) => set({ entity: e.target.value })} className={selCls} aria-label="Tipo">
          <option value="">Tudo</option>
          {(meta?.entities ?? []).map((e) => <option key={e} value={e}>{ENTITY_LABEL[e] ?? e}</option>)}
        </select>
        <select value={f.userId} onChange={(e) => set({ userId: e.target.value })} className={selCls} aria-label="Quem">
          <option value="">Todos</option>
          {(meta?.actors ?? []).map((a) => <option key={a.userId} value={a.userId}>{a.name}</option>)}
        </select>
        <input type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} className={selCls} aria-label="De" />
        <input type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} className={selCls} aria-label="Até" />
        <button onClick={() => void load()} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
        {meta && <span className="ml-auto text-xs text-gray-400">{meta.total} registro(s)</span>}
      </div>

      {loading && !rows.length ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-100" />)}</div>
        : rows.length === 0 ? <p className="py-8 text-center text-sm text-gray-400">Nenhum registro no período.</p> : (
        <ul className="divide-y divide-gray-100">
          {rows.map((r) => {
            const changedKeys = diffKeys(r.beforeData, r.afterData)
            const results = (r.afterData as { results?: string[] } | null)?.results
            const isOpen = open === r.id
            return (
              <li key={r.id} className="py-2">
                <button onClick={() => setOpen(isOpen ? null : r.id)} className="flex w-full items-start gap-2 text-left">
                  {isOpen ? <ChevronDown size={14} className="mt-0.5 shrink-0 text-gray-400" /> : <ChevronRight size={14} className="mt-0.5 shrink-0 text-gray-400" />}
                  <span className="w-28 shrink-0 text-[11px] tabular-nums text-gray-400">{new Date(r.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="min-w-0 flex-1 text-sm text-gray-700">
                    <b>{r.userName ?? 'Sistema'}</b> · {ACTION_LABEL[r.action] ?? r.action} · <span className="text-gray-500">{ENTITY_LABEL[r.entity] ?? r.entity}{r.leadName ? `: ${r.leadName}` : ''}</span>
                    {r.status && r.status !== 'SUCCESS' && <span className="ml-1 rounded bg-amber-50 px-1 text-[10px] text-amber-700">{r.status}</span>}
                    {results && <span className="block text-[11px] text-gray-500">{results.join(' · ')}</span>}
                    {!results && changedKeys.length > 0 && <span className="block text-[11px] text-gray-400">Campos: {changedKeys.slice(0, 6).join(', ')}{changedKeys.length > 6 ? '…' : ''}</span>}
                  </span>
                </button>
                {isOpen && (
                  <div className="mt-2 grid gap-2 pl-6 md:grid-cols-2">
                    {[['Antes', r.beforeData], ['Depois', r.afterData]].map(([label, v]) => (
                      <div key={label as string}>
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label as string}</p>
                        <pre className="max-h-64 overflow-auto rounded-lg bg-gray-50 p-2 text-[10px] text-gray-600">{v ? JSON.stringify(v, null, 2) : '—'}</pre>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {meta && meta.totalPages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-xs">
          <button disabled={f.page <= 1} onClick={() => setF((x) => ({ ...x, page: x.page - 1 }))} className="btn-secondary text-xs disabled:opacity-40">Anterior</button>
          <span className="text-gray-500">{meta.page} / {meta.totalPages}</span>
          <button disabled={f.page >= meta.totalPages} onClick={() => setF((x) => ({ ...x, page: x.page + 1 }))} className="btn-secondary text-xs disabled:opacity-40">Próxima</button>
        </div>
      )}
    </Card>
  )
}
