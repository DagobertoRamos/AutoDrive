'use client'

// Financeiro › Aprovações — pedidos de pagamento acima da alçada e configuração
// das faixas (ADM/MASTER). /api/finance/center/approvals

import { useCallback, useEffect, useState } from 'react'
import { Check, Loader2, Plus, Settings2, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MoneyInput } from '@/components/ui/money-input'
import { APPROVER_ROLES, ROLE_LABEL, type ApprovalConfig } from '@/lib/finance/approvals-core'
import { PageHeader, Toggle, api, brl } from './ui'
import { HelpHint } from '@/components/ui/help-hint'

interface Item {
  id: string; entryId: string; amount: number; roles: string[]; status: 'PENDENTE' | 'APROVADO' | 'RECUSADO'; reason: string | null
  requestedById: string | null; requestedBy: string | null; createdAt: string; decidedBy: string | null; decidedAt: string | null
  entry: { description: string; dueDate: string | null; counterparty: string | null; status: string } | null
}
interface Data { config: ApprovalConfig; commissionRelease: 'APROVACAO' | 'RECEBIMENTO'; items: Item[]; ready: boolean; canConfigure: boolean; role: string; userId: string }

const ST: Record<Item['status'], [string, string]> = { PENDENTE: ['Pendente', 'bg-amber-100 text-amber-800'], APROVADO: ['Aprovado', 'bg-green-100 text-green-700'], RECUSADO: ['Recusado', 'bg-red-100 text-red-700'] }
const dt = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—')

export default function PaymentApprovals() {
  const [d, setD] = useState<Data | null>(null)
  const [cfg, setCfg] = useState<ApprovalConfig | null>(null)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const r = await api<Data>('/api/finance/center/approvals')
    setD(r.data); setCfg(r.data?.config ?? null)
  }, [])
  useEffect(() => { void load() }, [load])

  const decide = async (it: Item, approve: boolean) => {
    const reason = approve ? null : window.prompt('Motivo da recusa:')?.trim()
    if (!approve && !reason) return
    setBusy(it.id)
    const r = await api('/api/finance/center/approvals', { method: 'POST', body: { action: approve ? 'APPROVE' : 'REJECT', id: it.id, reason } })
    setBusy(null)
    setMsg(r.ok ? { ok: true, text: approve ? 'Aprovado.' : 'Recusado.' } : { ok: false, text: r.error ?? 'Erro.' })
    if (r.ok) void load()
  }

  const saveCfg = async () => {
    setBusy('cfg')
    const r = await api('/api/finance/center/approvals', { method: 'POST', body: { action: 'CONFIG', config: cfg } })
    setBusy(null)
    setMsg(r.ok ? { ok: true, text: 'Alçadas salvas.' } : { ok: false, text: r.error ?? 'Erro.' })
    if (r.ok) { setEditing(false); void load() }
  }

  const saveRelease = async (mode: string) => {
    const r = await api('/api/finance/center/approvals', { method: 'POST', body: { action: 'COMMISSION_RELEASE', mode } })
    setMsg(r.ok ? { ok: true, text: 'Liberação de comissão salva.' } : { ok: false, text: r.error ?? 'Erro.' })
    if (r.ok) void load()
  }

  const canDecide = (it: Item) => !!d && it.status === 'PENDENTE' && (['ADM', 'MASTER'].includes(d.role) || (it.roles.includes(d.role) && it.requestedById !== d.userId))
  const pending = d?.items.filter((i) => i.status === 'PENDENTE') ?? []
  const done = d?.items.filter((i) => i.status !== 'PENDENTE') ?? []

  return (
    <div className="space-y-5">
      <PageHeader title="Aprovações" helpText="Pagamento acima do valor isento só pode ser baixado depois de aprovado por quem tem alçada para a faixa. Quem pediu não aprova o próprio pedido."
        actions={d?.canConfigure && !editing ? <button type="button" onClick={() => setEditing(true)} className="btn-secondary text-sm"><Settings2 size={15} />Alçadas</button> : null} />

      {msg && <p className={cn('rounded-lg px-3 py-2 text-sm', msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700')}>{msg.text}</p>}
      {d && !d.ready && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Aprovações ainda não ativadas: aplique a migration do banco.</p>}

      {editing && cfg && (
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-card">
          <Toggle checked={cfg.enabled} onChange={(v) => setCfg({ ...cfg, enabled: v })} label="Exigir aprovação de pagamentos" />
          <label className="block max-w-xs text-xs font-medium text-gray-600">Isento até
            <MoneyInput value={cfg.exemptUpTo} onChange={(v) => setCfg({ ...cfg, exemptUpTo: v ?? 0 })} />
          </label>
          <div className="space-y-2">
            {cfg.bands.map((b, i) => (
              <div key={i} className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-100 p-3">
                <div className="w-44 text-xs font-medium text-gray-600">
                  {b.upTo == null && i === cfg.bands.length - 1 ? 'Acima disso' : 'Até'}
                  {!(b.upTo == null && i === cfg.bands.length - 1) && <MoneyInput value={b.upTo} onChange={(v) => setCfg({ ...cfg, bands: cfg.bands.map((x, k) => (k === i ? { ...x, upTo: v } : x)) })} />}
                </div>
                <div className="flex flex-1 flex-wrap gap-2">
                  {APPROVER_ROLES.map((r) => (
                    <label key={r} className={cn('inline-flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-xs', b.roles.includes(r) ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600')}>
                      <input type="checkbox" className="hidden" checked={b.roles.includes(r)} onChange={(e) => setCfg({ ...cfg, bands: cfg.bands.map((x, k) => (k === i ? { ...x, roles: e.target.checked ? [...x.roles, r] : x.roles.filter((y) => y !== r) } : x)) })} />
                      {ROLE_LABEL[r]}
                    </label>
                  ))}
                </div>
                {cfg.bands.length > 1 && <button type="button" onClick={() => setCfg({ ...cfg, bands: cfg.bands.filter((_, k) => k !== i) })} className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label="Remover faixa"><Trash2 size={14} /></button>}
              </div>
            ))}
            <button type="button" onClick={() => setCfg({ ...cfg, bands: [...cfg.bands.slice(0, -1), { upTo: null, roles: ['FINANCEIRO'] }, cfg.bands[cfg.bands.length - 1]].map((x, k, all) => (k === all.length - 2 ? { ...x, upTo: (all[k - 1]?.upTo ?? cfg.exemptUpTo) * 2 || 1000 } : x)) })} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"><Plus size={14} />Faixa</button>
          </div>
          <label className="flex items-center justify-between gap-3 border-t border-gray-100 pt-4 text-sm text-gray-700">
            <span className="inline-flex items-center gap-1">Pagar comissão<HelpHint size={13} text="Na aprovação: a comissão pode ser paga assim que a venda é aprovada. Após o recebimento: só depois que o financeiro conciliou todo o valor da venda (bônus e descontos não dependem disso)." /></span>
            <select className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" value={d?.commissionRelease ?? 'APROVACAO'} onChange={(e) => void saveRelease(e.target.value)}>
              <option value="APROVACAO">Na aprovação da venda</option>
              <option value="RECEBIMENTO">Após o recebimento</option>
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setEditing(false); setCfg(d?.config ?? null) }} className="btn-secondary text-sm">Voltar</button>
            <button type="button" disabled={busy === 'cfg'} onClick={() => void saveCfg()} className="btn-primary text-sm">{busy === 'cfg' && <Loader2 size={14} className="animate-spin" />}Salvar</button>
          </div>
        </div>
      )}

      <Table title="Pendentes" items={pending} empty="Nenhum pagamento aguardando aprovação." render={(it) => canDecide(it) ? (
        <div className="flex justify-end gap-1.5">
          <button type="button" disabled={busy === it.id} onClick={() => void decide(it, false)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"><X size={13} />Recusar</button>
          <button type="button" disabled={busy === it.id} onClick={() => void decide(it, true)} className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-700"><Check size={13} />Aprovar</button>
        </div>
      ) : <span className="text-xs text-gray-400">{it.roles.filter((r) => r !== 'MASTER').map((r) => ROLE_LABEL[r] ?? r).join(', ')}</span>} />

      {done.length > 0 && <Table title="Decididos" items={done} render={(it) => <span className="text-xs text-gray-500">{it.decidedBy ?? '—'} · {dt(it.decidedAt)}{it.reason ? ` · ${it.reason}` : ''}</span>} />}
    </div>
  )
}

function Table({ title, items, empty, render }: { title: string; items: Item[]; empty?: string; render: (it: Item) => React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
      <h2 className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-800">{title}</h2>
      {!items.length ? <p className="p-8 text-center text-sm text-gray-400">{empty}</p> : (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            {items.map((it) => (
              <tr key={it.id}>
                <td className="px-4 py-2.5">
                  <p className="font-medium text-gray-900">{it.entry?.description ?? 'Lançamento'}</p>
                  <p className="text-xs text-gray-500">{[it.entry?.counterparty, it.entry?.dueDate && `vence ${dt(it.entry.dueDate)}`, it.requestedBy && `pedido por ${it.requestedBy}`].filter(Boolean).join(' · ')}</p>
                </td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{brl(it.amount)}</td>
                <td className="px-4 py-2.5"><span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', ST[it.status][1])}>{ST[it.status][0]}</span></td>
                <td className="px-4 py-2.5 text-right">{render(it)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
