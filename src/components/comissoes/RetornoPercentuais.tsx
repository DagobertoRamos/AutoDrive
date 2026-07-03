'use client'

// =============================================================================
// RetornoPercentuais — edita os PERCENTUAIS de comissão do retorno (o "× 5%").
// Cada linha é uma regra de comissão do tipo RETORNO: por CARGO (perfil) ou por
// VENDEDOR ESPECÍFICO (que tem prioridade sobre o cargo — "vendedor que recebe
// diferente"). Reusa /api/commissions/rules[/:id] e /api/sellers.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Percent, Save, Trash2, Plus, RefreshCw, X, Check, User, Briefcase } from 'lucide-react'
import { cn } from '@/lib/utils'

const ROLE_LABELS: Record<string, string> = {
  VENDEDOR: 'Vendedor', VENDEDOR_LIDER: 'Vendedor líder', GERENTE: 'Gerente',
  GERENTE_GERAL: 'Gerente geral', GERENTE_ADMINISTRATIVO: 'Gerente administrativo', FINANCEIRO: 'Financeiro',
}

interface Rule { id: string; name: string; ruleType: string; commissionType: string; percentage: number | null; role: string | null; sellerId: string | null; seller?: { user?: { name: string | null } | null } | null; active: boolean }
interface Seller { id: string; fullName: string; shortName?: string | null }

export default function RetornoPercentuais() {
  const [rules, setRules] = useState<Rule[]>([])
  const [sellers, setSellers] = useState<Seller[]>([])
  const [edit, setEdit] = useState<Record<string, string>>({})
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ mode: 'cargo' as 'cargo' | 'vendedor', role: 'GERENTE', sellerId: '', pct: '' })
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const [rRes, sRes] = await Promise.all([
        fetch('/api/commissions/rules', { credentials: 'include' }),
        fetch('/api/sellers?active=true', { credentials: 'include' }),
      ])
      const rj = await rRes.json().catch(() => ({}))
      const sj = await sRes.json().catch(() => ({}))
      if (rRes.ok) setRules((rj.data ?? []).filter((x: Rule) => x.ruleType === 'RETORNO'))
      if (sRes.ok) setSellers((sj.data ?? []).map((s: Seller) => ({ id: s.id, fullName: s.fullName, shortName: s.shortName })))
    } catch { setError('Erro ao carregar.') }
  }, [])
  useEffect(() => { load() }, [load])

  const flash = (m: string) => { setOk(m); setTimeout(() => setOk(''), 2500) }
  const targetLabel = (r: Rule) => r.seller?.user?.name ? `Vendedor: ${r.seller.user.name}` : (r.role ? ROLE_LABELS[r.role] ?? r.role : 'Todos os colaboradores')

  const saveRule = async (r: Rule) => {
    const pct = Number(String(edit[r.id] ?? r.percentage ?? '').replace(',', '.'))
    if (!Number.isFinite(pct) || pct < 0) { setError('Percentual inválido.'); return }
    setBusy(r.id); setError('')
    try {
      const res = await fetch(`/api/commissions/rules/${r.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ name: r.name, ruleType: 'RETORNO', commissionType: 'PERCENTUAL', percentage: pct, role: r.role, sellerId: r.sellerId, active: true, fromQuantity: null, toQuantity: null, fromValue: null, toValue: null }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) setError(j?.error ?? 'Falha ao salvar.')
      else { flash('Percentual atualizado.'); setEdit((e) => { const n = { ...e }; delete n[r.id]; return n }); await load() }
    } finally { setBusy(null) }
  }

  const del = async (r: Rule) => {
    if (!window.confirm(`Excluir a regra de retorno "${targetLabel(r)}"?`)) return
    setBusy(r.id); setError('')
    try {
      const res = await fetch(`/api/commissions/rules/${r.id}`, { method: 'DELETE', credentials: 'include' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) setError(j?.error ?? 'Falha ao excluir.')
      else { flash('Regra removida.'); await load() }
    } finally { setBusy(null) }
  }

  const add = async () => {
    const pct = Number(String(form.pct).replace(',', '.'))
    if (!Number.isFinite(pct) || pct <= 0) { setError('Informe o percentual.'); return }
    if (form.mode === 'vendedor' && !form.sellerId) { setError('Escolha o vendedor.'); return }
    setBusy('add'); setError('')
    const isSeller = form.mode === 'vendedor'
    const name = isSeller ? `Retorno — ${sellers.find((s) => s.id === form.sellerId)?.fullName ?? 'vendedor'}` : `Retorno ${ROLE_LABELS[form.role] ?? form.role}`
    try {
      const res = await fetch('/api/commissions/rules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ name, ruleType: 'RETORNO', commissionType: 'PERCENTUAL', percentage: pct, role: isSeller ? null : form.role, sellerId: isSeller ? form.sellerId : null, active: true }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j?.error ?? 'Falha ao adicionar.'); return }
      setAdding(false); setForm({ mode: 'cargo', role: 'GERENTE', sellerId: '', pct: '' }); flash('Regra adicionada.'); await load()
    } finally { setBusy(null) }
  }

  const inputCls = 'rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900"><Percent size={17} className="text-brand-600" />Percentual de comissão do retorno</h2>
          <p className="mt-0.5 text-xs text-gray-500">% do colaborador sobre o retorno líquido. Vendedor específico tem prioridade sobre o cargo.</p>
        </div>
        <button onClick={load} className="rounded p-1.5 text-gray-400 hover:bg-gray-100" title="Atualizar"><RefreshCw size={14} /></button>
      </div>

      {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {ok && <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{ok}</div>}

      <ul className="mt-4 divide-y divide-gray-100">
        {rules.length === 0 && <li className="py-4 text-center text-sm text-gray-400">Nenhum percentual de retorno configurado.</li>}
        {rules.map((r) => (
          <li key={r.id} className="flex items-center gap-2 py-2.5">
            <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-gray-800">
              {r.sellerId ? <User size={13} className="shrink-0 text-brand-500" /> : <Briefcase size={13} className="shrink-0 text-gray-400" />}
              <span className="truncate">{targetLabel(r)}</span>
            </span>
            <div className="flex items-center gap-1">
              <input inputMode="decimal" value={edit[r.id] ?? String(r.percentage ?? '')} onChange={(e) => setEdit((x) => ({ ...x, [r.id]: e.target.value }))} className={cn(inputCls, 'w-20 text-right')} />
              <span className="text-sm text-gray-500">%</span>
            </div>
            <button onClick={() => saveRule(r)} disabled={busy === r.id} className="rounded-lg p-1.5 text-brand-600 hover:bg-brand-50" title="Salvar">{busy === r.id ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}</button>
            <button onClick={() => del(r)} disabled={busy === r.id} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Excluir"><Trash2 size={15} /></button>
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="mt-3 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="flex gap-2">
            <button onClick={() => setForm((f) => ({ ...f, mode: 'cargo' }))} className={cn('flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold', form.mode === 'cargo' ? 'bg-brand-600 text-white' : 'border border-gray-300 text-gray-600')}>Por cargo</button>
            <button onClick={() => setForm((f) => ({ ...f, mode: 'vendedor' }))} className={cn('flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold', form.mode === 'vendedor' ? 'bg-brand-600 text-white' : 'border border-gray-300 text-gray-600')}>Vendedor específico</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {form.mode === 'cargo' ? (
              <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className={inputCls}>
                {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ) : (
              <select value={form.sellerId} onChange={(e) => setForm((f) => ({ ...f, sellerId: e.target.value }))} className={inputCls}>
                <option value="">Escolha o vendedor…</option>
                {sellers.map((s) => <option key={s.id} value={s.id}>{s.shortName || s.fullName}</option>)}
              </select>
            )}
            <div className="flex items-center gap-1">
              <input inputMode="decimal" value={form.pct} onChange={(e) => setForm((f) => ({ ...f, pct: e.target.value }))} placeholder="Ex: 5" className={cn(inputCls, 'w-full text-right')} />
              <span className="text-sm text-gray-500">%</span>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setAdding(false)} disabled={busy === 'add'} className="btn-secondary text-xs"><X size={13} />Cancelar</button>
            <button onClick={add} disabled={busy === 'add'} className="btn-primary text-xs">{busy === 'add' ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}Adicionar</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 py-2 text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600"><Plus size={15} />Adicionar percentual (cargo ou vendedor)</button>
      )}
    </div>
  )
}
