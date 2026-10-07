'use client'

// Formulário dos campos que FALTAM (ficha universal progressiva). Mostra só o
// necessário para a etapa / bancos escolhidos e grava campo a campo validado.

import { useEffect, useState } from 'react'
import { FieldLabel } from '@/components/ui/field'
import { MoneyInput } from '@/components/ui/money-input'
import { FIELD_INPUT, SELECT_OPTIONS } from '@/lib/finance/fi/field-input'
import { api, btnPrimary, inputClass } from './ui'

export interface MissingField { key: string; label: string; group?: string }

export function FieldsForm({ proponentId, fields, onSaved, submitLabel = 'Salvar' }: { proponentId: string; fields: MissingField[]; onSaved: () => void; submitLabel?: string }) {
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const keys = fields.map((f) => f.key).join(',')

  useEffect(() => {
    if (!keys) return
    let alive = true
    api<{ values: Record<string, unknown> }>(`/api/financing/proponents/${proponentId}/fields?keys=${keys}`).then((r) => {
      if (alive && r.ok && r.data) setValues(Object.fromEntries(Object.entries(r.data.values).filter(([, v]) => v != null && v !== '')))
    })
    return () => { alive = false }
  }, [proponentId, keys])

  if (!fields.length) return null
  const set = (k: string, v: unknown) => { setValues((s) => ({ ...s, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })) }

  const save = async () => {
    const missing = fields.filter((f) => values[f.key] == null || values[f.key] === '')
    if (missing.length) { setError('Preencha os campos marcados.'); setErrors(Object.fromEntries(missing.map((f) => [f.key, 'Obrigatório']))); return }
    setBusy(true); setError(null)
    const payload = Object.fromEntries(fields.map((f) => [f.key, values[f.key]]))
    const r = await api(`/api/financing/proponents/${proponentId}/fields`, { method: 'PATCH', body: { fields: payload } })
    setBusy(false)
    if (!r.ok) { setError(r.error); setErrors((r.json?.fieldErrors as Record<string, string>) ?? {}); return }
    onSaved()
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => {
          const kind = FIELD_INPUT[f.key] ?? 'text'
          const v = values[f.key]
          const cls = `${inputClass} ${errors[f.key] ? 'border-red-400' : ''}`
          return (
            <div key={f.key} className={kind === 'list' ? 'sm:col-span-2' : ''}>
              <FieldLabel required htmlFor={`fi-${f.key}`}>{f.label}</FieldLabel>
              {kind === 'money' ? <MoneyInput id={`fi-${f.key}`} className={cls} value={typeof v === 'number' ? v : null} onChange={(n) => set(f.key, n)} />
                : kind === 'select' ? (
                  <select id={`fi-${f.key}`} className={cls} value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value)}>
                    <option value="">Selecione</option>
                    {(SELECT_OPTIONS[f.key] ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : kind === 'date' ? <input id={`fi-${f.key}`} type="date" className={cls} value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value)} />
                : kind === 'months' ? <input id={`fi-${f.key}`} type="number" min={0} className={cls} value={v == null ? '' : String(v)} onChange={(e) => set(f.key, e.target.value === '' ? null : Number(e.target.value))} placeholder="Meses" />
                : kind === 'list' ? <ListInput value={Array.isArray(v) ? v as Record<string, string>[] : []} onChange={(l) => set(f.key, l)} field={f.key} />
                : <input id={`fi-${f.key}`} className={cls} inputMode={['cpf', 'cnpj', 'cep', 'phone'].includes(kind) ? 'numeric' : undefined} type={kind === 'email' ? 'email' : 'text'} maxLength={kind === 'uf' ? 2 : 160} value={String(v ?? '')} onChange={(e) => set(f.key, e.target.value)} />}
              {errors[f.key] && <p className="mt-0.5 text-xs text-red-600">{errors[f.key]}</p>}
            </div>
          )
        })}
      </div>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      <div className="flex justify-end"><button className={btnPrimary} onClick={save} disabled={busy}>{busy ? 'Salvando…' : submitLabel}</button></div>
    </div>
  )
}

const LIST_SHAPE: Record<string, { key: string; label: string }[]> = {
  socios: [{ key: 'nome', label: 'Nome' }, { key: 'cpf', label: 'CPF' }, { key: 'participacao', label: 'Participação %' }],
  referencias: [{ key: 'nome', label: 'Nome' }, { key: 'telefone', label: 'Telefone' }, { key: 'relacao', label: 'Relação' }],
  outrasRendas: [{ key: 'descricao', label: 'Descrição' }, { key: 'valor', label: 'Valor' }],
}

function ListInput({ value, onChange, field }: { value: Record<string, string>[]; onChange: (v: Record<string, string>[]) => void; field: string }) {
  const shape = LIST_SHAPE[field] ?? [{ key: 'descricao', label: 'Descrição' }]
  const rows = value.length ? value : [{}]
  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${shape.length}, minmax(0, 1fr))` }}>
          {shape.map((s) => <input key={s.key} className={inputClass} placeholder={s.label} aria-label={s.label} value={row[s.key] ?? ''} onChange={(e) => { const next = [...rows]; next[i] = { ...row, [s.key]: e.target.value }; onChange(next) }} />)}
        </div>
      ))}
      <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => onChange([...rows, {}])}>Adicionar linha</button>
    </div>
  )
}
