'use client'

// =============================================================================
// Plano de Comissão — HUB unificado e profissional. Uma tela para gerir todo o
// comissionamento por cargo e por vendedor:
//   • Visão geral — resumo do plano (vendedor/gerente), lido das regras + configs.
//   • Regras por cargo — edição inline do valor + ativa/desativa + excluir.
//   • Documento / Garantia / Retorno / Bônus de período — cards dedicados.
// Reaproveita as APIs e cards existentes. Cadastro completo de regra: /comissoes/regras.
// =============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { SlidersHorizontal, RefreshCw, Save, Trash2, ExternalLink, CheckCircle2, AlertCircle, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import DocumentoConfigCard from '@/components/comissoes/DocumentoConfigCard'
import GarantiaConfigCard from '@/components/comissoes/GarantiaConfigCard'
import BonusPeriodoCard from '@/components/comissoes/BonusPeriodoCard'
import RetornoPercentuais from '@/components/comissoes/RetornoPercentuais'

interface Rule {
  id: string
  name: string
  ruleType: string
  commissionType: string
  role: string | null
  positionId: string | null
  sellerId: string | null
  managerId: string | null
  fromQuantity: number | null
  toQuantity: number | null
  fromValue: number | null
  toValue: number | null
  fixedValue: number | null
  percentage: number | null
  priority: number
  active: boolean
  notes: string | null
  position?: { name: string; slug: string; baseRole: string | null } | null
  seller?: { user?: { name: string | null } | null } | null
  manager?: { fullName: string | null; user?: { name: string | null } | null } | null
}

const TABS = ['Visão geral', 'Regras por cargo', 'Documento', 'Garantia', 'Retorno', 'Bônus de período'] as const
const TYPE_LABEL: Record<string, string> = { VENDA: 'Venda / Troca', COMPRA: 'Compra', GARANTIA: 'Garantia', RETORNO: 'Retorno', SERVICO: 'Serviço', DOCUMENTO: 'Documento', BONUS_META: 'Meta', BONUS_DEZENA: 'Dezena', EXCECAO: 'Exceção' }
const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

function cargoOf(r: Rule): string {
  if (r.sellerId) return `Vendedor: ${r.seller?.user?.name ?? '—'}`
  if (r.managerId) return `Gerente: ${r.manager?.fullName ?? r.manager?.user?.name ?? '—'}`
  if (r.position) return r.position.name
  if (r.role) return r.role
  return 'Geral (todos)'
}
function ruleValueLabel(r: Rule): string {
  if (r.commissionType === 'PERCENTUAL' || (r.commissionType === 'ESCALONADA' && r.percentage)) return `${num(r.percentage)}%`
  return fmtBRL(num(r.fixedValue))
}
function faixaLabel(r: Rule): string {
  const q = (r.fromQuantity != null || r.toQuantity != null) ? `${r.fromQuantity ?? 0}${r.toQuantity != null ? `–${r.toQuantity}` : '+'} carros` : ''
  const isBonus = r.commissionType === 'BONUS_QTD'
  return isBonus ? `bônus a partir de ${r.fromQuantity ?? '?'}` : q
}

export default function PlanoComissaoPage() {
  const [tab, setTab] = useState(0)
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadRules = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/commissions/rules', { credentials: 'include' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? 'Erro ao carregar regras')
      setRules(j.data ?? [])
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erro ao carregar') } finally { setLoading(false) }
  }, [])
  useEffect(() => { loadRules() }, [loadRules])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><SlidersHorizontal size={20} className="text-brand-600" />Plano de Comissão</h1>
          <p className="mt-0.5 text-sm text-gray-500">Gestão profissional do comissionamento por cargo e por vendedor.</p>
        </div>
        <Link href="/comissoes/regras" className="btn-secondary text-xs"><ExternalLink size={13} />Cadastro completo de regras</Link>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-card">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            className={cn('rounded-lg px-3 py-1.5 text-sm font-medium transition', tab === i ? 'bg-brand-600 text-white shadow' : 'text-gray-600 hover:bg-gray-100')}>
            {t}
          </button>
        ))}
      </div>

      {tab === 0 && <OverviewTab rules={rules} loading={loading} error={error} onReload={loadRules} />}
      {tab === 1 && <RulesTab rules={rules} loading={loading} onReload={loadRules} />}
      {tab === 2 && <DocumentoConfigCard />}
      {tab === 3 && <GarantiaConfigCard />}
      {tab === 4 && <div className="space-y-5"><RetornoPercentuais /><p className="text-xs text-gray-400">ILA / IOF e faixa de retorno ficam em <Link href="/comissoes/retornos" className="text-brand-600 underline">Retorno (ILA/IOF)</Link>.</p></div>}
      {tab === 5 && <BonusPeriodoCard />}
    </div>
  )
}

// ── Visão geral: resumo do plano por cargo ────────────────────────────────────
function OverviewTab({ rules, loading, error, onReload }: { rules: Rule[]; loading: boolean; error: string; onReload: () => void }) {
  const grouped = useMemo(() => {
    const byCargo = new Map<string, Rule[]>()
    for (const r of rules) {
      const k = r.position?.name ?? (r.role ?? (r.sellerId ? 'Vendedor específico' : r.managerId ? 'Gerente específico' : 'Geral'))
      if (!byCargo.has(k)) byCargo.set(k, [])
      byCargo.get(k)!.push(r)
    }
    return [...byCargo.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [rules])

  if (loading) return <div className="h-56 animate-pulse rounded-xl bg-gray-100" />
  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle size={14} className="mr-1 inline" />{error} <button onClick={onReload} className="underline">tentar de novo</button></div>

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs text-blue-700">
        Resumo do plano lido das regras cadastradas. Documento, garantia e bônus de período têm cards próprios nas outras abas.
        Regras a partir de valores/faixas — edite na aba <strong>Regras por cargo</strong>.
      </div>
      {grouped.map(([cargo, rs]) => (
        <div key={cargo} className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900"><Layers size={15} className="text-brand-600" />{cargo}</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50"><tr>{['Tipo', 'Faixa / condição', 'Valor', 'Status'].map((h) => <th key={h} className="px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-100">
                {rs.sort((a, b) => (a.ruleType.localeCompare(b.ruleType)) || (a.fromQuantity ?? 0) - (b.fromQuantity ?? 0)).map((r) => (
                  <tr key={r.id} className={cn(!r.active && 'opacity-40')}>
                    <td className="px-3 py-1.5 text-gray-700">{TYPE_LABEL[r.ruleType] ?? r.ruleType}{r.commissionType === 'BONUS_QTD' && ' (bônus)'}</td>
                    <td className="px-3 py-1.5 text-gray-500">{faixaLabel(r) || '—'}</td>
                    <td className="px-3 py-1.5 font-semibold tabular-nums text-brand-700">{ruleValueLabel(r)}</td>
                    <td className="px-3 py-1.5">{r.active ? <span className="text-xs text-green-600">ativa</span> : <span className="text-xs text-gray-400">inativa</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {grouped.length === 0 && <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">Nenhuma regra cadastrada.</div>}
    </div>
  )
}

// ── Regras por cargo: edição inline (valor + ativa) + excluir ─────────────────
function RulesTab({ rules, loading, onReload }: { rules: Rule[]; loading: boolean; onReload: () => void }) {
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const groups = useMemo(() => {
    const m = new Map<string, Rule[]>()
    for (const r of rules) { const k = cargoOf(r); if (!m.has(k)) m.set(k, []); m.get(k)!.push(r) }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [rules])

  const payloadFor = (r: Rule, over: Partial<Rule>): Record<string, unknown> => ({
    name: r.name, ruleType: r.ruleType, commissionType: r.commissionType, role: r.role, positionId: r.positionId,
    sellerId: r.sellerId, managerId: r.managerId, fromQuantity: r.fromQuantity, toQuantity: r.toQuantity,
    fromValue: r.fromValue, toValue: r.toValue, fixedValue: r.fixedValue, percentage: r.percentage,
    priority: r.priority, active: r.active, notes: r.notes, ...over,
  })

  const put = async (r: Rule, over: Partial<Rule>) => {
    setBusy(r.id); setErr(''); setMsg('')
    try {
      const res = await fetch(`/api/commissions/rules/${r.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payloadFor(r, over)) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? 'Erro ao salvar')
      setMsg('Salvo.'); await onReload()
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Erro ao salvar') } finally { setBusy(null) }
  }

  const saveValue = async (r: Rule) => {
    const raw = edits[r.id]; if (raw == null) return
    const v = Number(String(raw).replace(',', '.'))
    if (!Number.isFinite(v) || v <= 0) { setErr('Informe um valor maior que zero.'); return }
    const isPct = r.commissionType === 'PERCENTUAL' || (r.commissionType === 'ESCALONADA' && !!r.percentage)
    await put(r, isPct ? { percentage: v } : { fixedValue: v })
    setEdits((e) => { const n = { ...e }; delete n[r.id]; return n })
  }

  const del = async (r: Rule) => {
    if (!confirm(`Excluir a regra "${r.name}"?`)) return
    setBusy(r.id); setErr(''); setMsg('')
    try {
      const res = await fetch(`/api/commissions/rules/${r.id}`, { method: 'DELETE', credentials: 'include' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? 'Erro ao excluir')
      setMsg('Excluída.'); await onReload()
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Erro ao excluir') } finally { setBusy(null) }
  }

  if (loading) return <div className="h-56 animate-pulse rounded-xl bg-gray-100" />

  return (
    <div className="space-y-4">
      {(msg || err) && (
        <div className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm', err ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700')}>
          {err ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}{err || msg}
        </div>
      )}
      <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-700">
        Edite aqui o <strong>valor</strong> de cada regra e ligue/desligue. Para criar regra nova, faixas ou vínculos, use o <Link href="/comissoes/regras" className="underline">cadastro completo</Link>.
      </div>

      {groups.map(([cargo, rs]) => (
        <div key={cargo} className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
          <h3 className="text-sm font-semibold text-gray-900">{cargo}</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50"><tr>{['Regra', 'Tipo', 'Faixa', 'Valor', 'Ativa', ''].map((h) => <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-100">
                {rs.map((r) => {
                  const isPct = r.commissionType === 'PERCENTUAL' || (r.commissionType === 'ESCALONADA' && !!r.percentage)
                  const cur = isPct ? num(r.percentage) : num(r.fixedValue)
                  const editing = edits[r.id]
                  return (
                    <tr key={r.id} className={cn(busy === r.id && 'opacity-50')}>
                      <td className="px-3 py-1.5 text-gray-800">{r.name}</td>
                      <td className="px-3 py-1.5 text-gray-500">{TYPE_LABEL[r.ruleType] ?? r.ruleType}{r.commissionType === 'BONUS_QTD' && ' (bônus)'}</td>
                      <td className="px-3 py-1.5 text-gray-500">{faixaLabel(r) || '—'}</td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-400">{isPct ? '%' : 'R$'}</span>
                          <input inputMode="decimal" value={editing ?? String(cur)} onChange={(e) => setEdits((x) => ({ ...x, [r.id]: e.target.value }))}
                            className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-right text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
                          {editing != null && editing !== String(cur) && (
                            <button onClick={() => saveValue(r)} disabled={busy === r.id} className="rounded p-1 text-brand-600 hover:bg-brand-50" title="Salvar"><Save size={14} /></button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="checkbox" checked={r.active} disabled={busy === r.id} onChange={(e) => put(r, { active: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                      </td>
                      <td className="px-2 py-1.5 text-center"><button onClick={() => del(r)} disabled={busy === r.id} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Excluir"><Trash2 size={14} /></button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {groups.length === 0 && <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">Nenhuma regra cadastrada.</div>}
    </div>
  )
}
