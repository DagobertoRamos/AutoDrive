'use client'

// Financeiro › Contas bancárias — lista com saldo atual + cadastro/edição.
// /api/finance/accounts (GET/POST) e /[id] (PATCH/DELETE = inativar).

import { useCallback, useEffect, useState } from 'react'
import { Landmark, Pencil, Plus, Power, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FieldLabel } from '@/components/ui/field'
import { WithHint } from '@/components/ui/help-hint'
import { MoneyInput } from '@/components/ui/money-input'
import { Badge, ColorPicker, EmptyState, Modal, PageHeader, Toggle, api, brl, dateBR, iconBtn, inputClass } from './ui'

interface Account {
  id: string; name: string; type: 'CAIXA' | 'BANCO' | 'CARTAO' | 'OUTRO'; openingBalance: number | string | null; openingDate: string | null
  bankName: string | null; agency: string | null; accountNumber: string | null; unitId: string | null; unitName: string | null
  color: string | null; includeInTotal: boolean; active: boolean; currentBalance: number | null; movement: number | null
}
interface Unit { id: string; name: string }
interface Form {
  name: string; type: Account['type']; bankName: string; agency: string; accountNumber: string; unitId: string
  color: string | null; openingBalance: number | null; openingDate: string; includeInTotal: boolean; active: boolean
}
const emptyForm: Form = { name: '', type: 'BANCO', bankName: '', agency: '', accountNumber: '', unitId: '', color: null, openingBalance: 0, openingDate: '', includeInTotal: true, active: true }
const TYPE_LABEL: Record<string, string> = { CAIXA: 'Caixa', BANCO: 'Banco', CARTAO: 'Cartão', OUTRO: 'Outro' }

export default function AccountsManager() {
  const [items, setItems] = useState<Account[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [consolidated, setConsolidated] = useState<number | null>(0)
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState<Form>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await api<Account[]>('/api/finance/accounts')
    setItems(r.data ?? [])
    setUnits((r.json?.units as Unit[]) ?? [])
    const tc = (r.json?.totals as { consolidated?: number | null } | undefined)?.consolidated
    setConsolidated(tc === null ? null : Number(tc ?? 0))
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const open = (a?: Account) => {
    setEditing(a ?? null)
    setForm(a ? {
      name: a.name, type: a.type, bankName: a.bankName ?? '', agency: a.agency ?? '', accountNumber: a.accountNumber ?? '',
      unitId: a.unitId ?? '', color: a.color, openingBalance: Number(a.openingBalance) || 0,
      openingDate: a.openingDate ? a.openingDate.slice(0, 10) : '', includeInTotal: a.includeInTotal, active: a.active,
    } : emptyForm)
    setError(null)
    setModal(true)
  }

  const save = async () => {
    if (form.name.trim().length < 2) { setError('Informe o nome da conta.'); return }
    setSaving(true); setError(null)
    const body = { ...form, name: form.name.trim(), openingBalance: form.openingBalance ?? 0, openingDate: form.openingDate || null, unitId: form.unitId || null }
    const r = await api(editing ? `/api/finance/accounts/${editing.id}` : '/api/finance/accounts', { method: editing ? 'PATCH' : 'POST', body })
    setSaving(false)
    if (!r.ok) { setError(r.error); return }
    setModal(false); load()
  }

  const toggle = async (a: Account) => {
    if (!confirm(`${a.active ? 'Inativar' : 'Reativar'} a conta "${a.name}"?`)) return
    if (a.active) await api(`/api/finance/accounts/${a.id}`, { method: 'DELETE' })
    else await api(`/api/finance/accounts/${a.id}`, { method: 'PATCH', body: { active: true } })
    load()
  }

  const visible = items.filter((a) => showInactive || a.active)
  const isBank = form.type === 'BANCO' || form.type === 'CARTAO'

  return (
    <div className="space-y-5">
      <PageHeader
        title="Contas bancárias"
        subtitle={loading ? 'Carregando...' : <span className="inline-flex flex-wrap items-center gap-1"><WithHint term="SALDO_CONSOLIDADO">Saldo consolidado</WithHint> <span className={cn('font-semibold', (consolidated ?? 0) < 0 ? 'text-red-600' : 'text-gray-900')}>{consolidated == null ? '—' : brl(consolidated)}</span></span>}
        actions={<>
          <Toggle checked={showInactive} onChange={setShowInactive} label="Mostrar inativas" />
          <button onClick={() => open()} className="btn-primary text-sm"><Plus size={15} />Nova conta</button>
        </>}
      />

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-36 animate-pulse rounded-xl bg-gray-100" />)}</div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white"><EmptyState icon={<Landmark size={32} strokeWidth={1} />} text="Nenhuma conta cadastrada." /></div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((a) => (
            <div key={a.id} className={cn('relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-card', !a.active && 'opacity-60')}>
              <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: a.color ?? '#e5e7eb' }} />
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-900">{a.name}</p>
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {[TYPE_LABEL[a.type], a.bankName, a.agency && `Ag. ${a.agency}`, a.accountNumber && `C/C ${a.accountNumber}`].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex shrink-0">
                  <button onClick={() => open(a)} className={iconBtn} title="Editar"><Pencil size={15} /></button>
                  <button onClick={() => toggle(a)} className={iconBtn} title={a.active ? 'Inativar' : 'Reativar'}><Power size={15} /></button>
                </div>
              </div>
              <p className={cn('mt-3 text-2xl font-bold tabular-nums', (a.currentBalance ?? 0) < 0 ? 'text-red-600' : 'text-gray-900')}>{a.currentBalance == null ? '—' : brl(a.currentBalance)}</p>
              {a.currentBalance != null && <p className="mt-1 text-xs text-gray-500">
                Saldo inicial {brl(Number(a.openingBalance))}{a.openingDate ? ` em ${dateBR(a.openingDate)}` : ''} · movimento {brl(a.movement)}
              </p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {a.unitName && <Badge>{a.unitName}</Badge>}
                {!a.includeInTotal && <Badge tone="amber">Fora do consolidado</Badge>}
                {!a.active && <Badge tone="red">Inativa</Badge>}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal
          title={editing ? 'Editar conta' : 'Nova conta'}
          onClose={() => setModal(false)}
          wide
          footer={<>
            <button onClick={() => setModal(false)} className="btn-secondary text-sm">Cancelar</button>
            <button onClick={save} disabled={saving} className="btn-primary text-sm"><Save size={15} />{saving ? 'Salvando...' : 'Salvar'}</button>
          </>}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><FieldLabel required>Nome</FieldLabel><input className={cn(inputClass, 'mt-1')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></div>
            <div><FieldLabel required>Tipo</FieldLabel>
              <select className={cn(inputClass, 'mt-1')} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Form['type'] })}>
                {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div><FieldLabel>Unidade</FieldLabel>
              <select className={cn(inputClass, 'mt-1')} value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })}>
                <option value="">Todas</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            {isBank && <>
              <div className="sm:col-span-2"><FieldLabel>Banco</FieldLabel><input className={cn(inputClass, 'mt-1')} value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} /></div>
              <div><FieldLabel>Agência</FieldLabel><input className={cn(inputClass, 'mt-1')} value={form.agency} onChange={(e) => setForm({ ...form, agency: e.target.value })} /></div>
              <div><FieldLabel>Conta</FieldLabel><input className={cn(inputClass, 'mt-1')} value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} /></div>
            </>}
            {consolidated != null && <><div><FieldLabel helpTerm="SALDO_INICIAL">Saldo inicial</FieldLabel><div className="mt-1"><MoneyInput className={inputClass} value={form.openingBalance} onChange={(v) => setForm({ ...form, openingBalance: v })} /></div></div>
            <div><FieldLabel helpText="Dia em que o saldo inicial foi conferido (ex.: extrato do banco). Movimentos anteriores a essa data não alteram o saldo.">Data do saldo inicial</FieldLabel><input type="date" className={cn(inputClass, 'mt-1')} value={form.openingDate} onChange={(e) => setForm({ ...form, openingDate: e.target.value })} /></div></>}
            <div className="sm:col-span-2"><FieldLabel>Cor</FieldLabel><div className="mt-1"><ColorPicker value={form.color} onChange={(c) => setForm({ ...form, color: c })} /></div></div>
            <div className="flex flex-wrap gap-5 sm:col-span-2">
              <Toggle checked={form.includeInTotal} onChange={(v) => setForm({ ...form, includeInTotal: v })} label="Incluir no consolidado" helpText="Marcada: o saldo desta conta entra no saldo consolidado do painel. Desmarque para contas que não são da operação (ex.: conta pessoal, aplicação)." />
              <Toggle checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label="Ativa" />
            </div>
            {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
          </div>
        </Modal>
      )}
    </div>
  )
}
