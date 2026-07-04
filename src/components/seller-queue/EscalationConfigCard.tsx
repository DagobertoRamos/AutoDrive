'use client'

// =============================================================================
// EscalationConfigCard — configura o ESCALONAMENTO da chamada por unidade.
// Níveis (vez → líder → gerente → GG → colaboradores/cargo/admin), com tempo,
// tentativas, vários colaboradores por nível e "primeiro que aceita assume".
// Reusa /api/seller-queue/escalation-config. Só gestão (backend valida).
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { GitBranch, Save, RefreshCw, Plus, Trash2, AlertCircle, CheckCircle2, ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Level { id: string; name: string; targetType: string; role: string | null; targetUserIds: string[]; timeoutSeconds: number; maxAttempts: number; notifyAll: boolean; active: boolean }
interface Config { active: boolean; firstAcceptWins: boolean; onNoResponse: string; onDecline: string; levels: Level[] }
interface Person { userId: string; nome: string }

const TARGETS: { v: string; label: string }[] = [
  { v: 'VENDEDOR_DA_VEZ', label: 'Vendedor da vez (rotação)' },
  { v: 'VENDEDOR_LIDER', label: 'Vendedor líder' },
  { v: 'GERENTE', label: 'Gerente da unidade' },
  { v: 'GERENTE_GERAL', label: 'Gerente geral' },
  { v: 'ADMIN', label: 'Admin / Master' },
  { v: 'CARGO', label: 'Cargo/perfil específico' },
  { v: 'COLABORADORES', label: 'Colaboradores específicos' },
]
const ROLES = ['VENDEDOR', 'VENDEDOR_LIDER', 'GERENTE', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'ADM', 'FINANCEIRO']
const NO_RESP = [{ v: 'NOTIFY_MANAGER', l: 'Avisar a gestão' }, { v: 'HOLD', l: 'Deixar aguardando' }, { v: 'SKIP', l: 'Pular' }, { v: 'ESCALATE', l: 'Continuar tentando' }]
const ON_DECLINE = [{ v: 'ESCALATE', l: 'Escalar ao próximo nível' }, { v: 'MOVE_TO_END', l: 'Mandar ao fim da fila' }, { v: 'PAUSE', l: 'Pausar o colaborador' }, { v: 'NOTIFY_MANAGER', l: 'Avisar a gestão' }]

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

export default function EscalationConfigCard({ unitId }: { unitId?: string | null }) {
  const [cfg, setCfg] = useState<Config | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const qs = unitId ? `?unitId=${encodeURIComponent(unitId)}` : ''

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/seller-queue/escalation-config${qs}`, { credentials: 'include' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? 'Erro ao carregar')
      setCfg(j.data)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erro ao carregar') } finally { setLoading(false) }
  }, [qs])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch('/api/sellers', { credentials: 'include' }).then((r) => r.json())
      .then((j) => setPeople((j?.data ?? []).map((s: { userId?: string; id: string; fullName?: string; name?: string }) => ({ userId: s.userId ?? s.id, nome: s.fullName || s.name || 'Colaborador' })).filter((p: Person) => p.userId)))
      .catch(() => setPeople([]))
  }, [])

  const dirty = () => setSaved(false)
  const setLevel = (i: number, patch: Partial<Level>) => { if (!cfg) return; dirty(); setCfg({ ...cfg, levels: cfg.levels.map((l, j) => j === i ? { ...l, ...patch } : l) }) }
  const move = (i: number, dir: -1 | 1) => { if (!cfg) return; const j = i + dir; if (j < 0 || j >= cfg.levels.length) return; dirty(); const ls = [...cfg.levels];[ls[i], ls[j]] = [ls[j], ls[i]]; setCfg({ ...cfg, levels: ls }) }
  const addLevel = () => { if (!cfg) return; dirty(); setCfg({ ...cfg, levels: [...cfg.levels, { id: `lvl${Date.now()}`, name: `Nível ${cfg.levels.length + 1}`, targetType: 'GERENTE', role: null, targetUserIds: [], timeoutSeconds: 30, maxAttempts: 1, notifyAll: true, active: true }] }) }
  const delLevel = (i: number) => { if (!cfg) return; dirty(); setCfg({ ...cfg, levels: cfg.levels.filter((_, j) => j !== i) }) }
  const toggleUser = (i: number, uid: string) => { if (!cfg) return; const l = cfg.levels[i]; const has = l.targetUserIds.includes(uid); setLevel(i, { targetUserIds: has ? l.targetUserIds.filter((x) => x !== uid) : [...l.targetUserIds, uid] }) }

  const save = async () => {
    if (!cfg) return
    setSaving(true); setError(''); setSaved(false)
    try {
      const res = await fetch(`/api/seller-queue/escalation-config${qs}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(cfg) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? 'Erro ao salvar')
      setSaved(true); await load()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erro ao salvar') } finally { setSaving(false) }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900"><GitBranch size={17} className="text-brand-600" />Escalonamento da chamada</h2>
          <p className="mt-0.5 text-xs text-gray-500">Se o vendedor da vez não aceita no tempo, sobe os níveis. Vários por nível: o 1º que aceita assume.</p>
        </div>
        <button onClick={load} disabled={loading} className="rounded p-1.5 text-gray-400 hover:bg-gray-100"><RefreshCw size={14} className={cn(loading && 'animate-spin')} /></button>
      </div>

      {loading ? <div className="mt-4 h-48 animate-pulse rounded-lg bg-gray-100" /> : cfg ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
              <input type="checkbox" checked={cfg.active} onChange={(e) => { dirty(); setCfg({ ...cfg, active: e.target.checked }) }} className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
              <span className="text-sm font-medium text-gray-800">Ativar escalonamento automático</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
              <input type="checkbox" checked={cfg.firstAcceptWins} onChange={(e) => { dirty(); setCfg({ ...cfg, firstAcceptWins: e.target.checked }) }} className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
              <span className="text-sm font-medium text-gray-800">O primeiro que aceitar assume</span>
            </label>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Ao esgotar sem resposta</label>
              <select value={cfg.onNoResponse} onChange={(e) => { dirty(); setCfg({ ...cfg, onNoResponse: e.target.value }) }} className={inputCls}>{NO_RESP.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Ao recusar</label>
              <select value={cfg.onDecline} onChange={(e) => { dirty(); setCfg({ ...cfg, onDecline: e.target.value }) }} className={inputCls}>{ON_DECLINE.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
            </div>
          </div>

          <div className="space-y-3">
            {cfg.levels.map((l, i) => (
              <div key={l.id} className={cn('rounded-lg border p-3', l.active ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-70')}>
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{i + 1}</span>
                  <input value={l.name} onChange={(e) => setLevel(i, { name: e.target.value })} className={cn(inputCls, 'font-medium')} placeholder="Nome do nível" />
                  <div className="flex shrink-0 items-center">
                    <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30"><ChevronUp size={14} /></button>
                    <button onClick={() => move(i, 1)} disabled={i === cfg.levels.length - 1} className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30"><ChevronDown size={14} /></button>
                    <button onClick={() => delLevel(i)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-4">
                  <div>
                    <label className="mb-0.5 block text-[11px] text-gray-500">Destino</label>
                    <select value={l.targetType} onChange={(e) => setLevel(i, { targetType: e.target.value })} className={inputCls}>{TARGETS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}</select>
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[11px] text-gray-500">Tempo (s)</label>
                    <input inputMode="numeric" value={l.timeoutSeconds} onChange={(e) => setLevel(i, { timeoutSeconds: Number(e.target.value) || 0 })} className={cn(inputCls, 'text-right')} />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[11px] text-gray-500">Tentativas</label>
                    <input inputMode="numeric" value={l.maxAttempts} onChange={(e) => setLevel(i, { maxAttempts: Number(e.target.value) || 1 })} className={cn(inputCls, 'text-right')} />
                  </div>
                  <div className="flex items-end gap-3 pb-1">
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-700"><input type="checkbox" checked={l.notifyAll} onChange={(e) => setLevel(i, { notifyAll: e.target.checked })} className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600" />notificar todos</label>
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-700"><input type="checkbox" checked={l.active} onChange={(e) => setLevel(i, { active: e.target.checked })} className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600" />ativo</label>
                  </div>
                </div>
                {l.targetType === 'CARGO' && (
                  <div className="mt-2"><label className="mb-0.5 block text-[11px] text-gray-500">Cargo/perfil</label>
                    <select value={l.role ?? ''} onChange={(e) => setLevel(i, { role: e.target.value || null })} className={cn(inputCls, 'max-w-xs')}><option value="">Selecione…</option>{ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select>
                  </div>
                )}
                {l.targetType === 'COLABORADORES' && (
                  <div className="mt-2">
                    <label className="mb-1 block text-[11px] text-gray-500">Colaboradores ({l.targetUserIds.length})</label>
                    <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
                      {people.map((p) => {
                        const on = l.targetUserIds.includes(p.userId)
                        return <button key={p.userId} onClick={() => toggleUser(i, p.userId)} className={cn('rounded-full border px-2 py-0.5 text-xs', on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50')}>{p.nome}</button>
                      })}
                      {people.length === 0 && <span className="text-xs text-gray-400">Sem colaboradores para listar.</span>}
                    </div>
                  </div>
                )}
              </div>
            ))}
            <button onClick={addLevel} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 py-2 text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600"><Plus size={15} />Adicionar nível</button>
          </div>

          {error && <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle size={14} />{error}</div>}
          {saved && <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700"><CheckCircle2 size={14} />Salvo.</div>}
          <div className="flex justify-end"><button onClick={save} disabled={saving} className="btn-primary text-sm">{saving ? <><RefreshCw size={13} className="animate-spin" />Salvando...</> : <><Save size={13} />Salvar</>}</button></div>
        </div>
      ) : <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error || 'Não foi possível carregar.'}</div>}
    </div>
  )
}
