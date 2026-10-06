'use client'

// =============================================================================
// Aba Recebimento — checklist com fotos: manual, revisões, chave reserva,
// macaco, chave de roda, triângulo e estepe. Cada item: foto OU "não possui"
// com justificativa. Confirmar resolve a pendência "Recebimento do veículo".
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Loader2, PackageCheck, RotateCcw, Save } from 'lucide-react'
import { VehicleFilesField, type VFile } from './VehicleFilesField'
import { RequiredMark } from '@/components/ui/field'
import { HelpHint } from '@/components/ui/help-hint'
import { opsHint } from '@/lib/glossary-ops'

interface Item { key: string; status: 'OK' | 'NAO_POSSUI' | 'PENDENTE'; note: string | null }
interface State {
  catalog: Array<{ key: string; label: string }>; items: Item[]; photos: VFile[]
  km: number | null; receivedAt: string | null; notes: string | null
  confirmedAt: string | null; confirmedByName: string | null; missing: string[]
}

export function ReceptionPanel({ vehicleId, canEdit, onChanged }: { vehicleId: string; canEdit: boolean; onChanged: () => void | Promise<void> }) {
  const [s, setS] = useState<State | null>(null)
  const [items, setItems] = useState<Record<string, Item>>({})
  const [km, setKm] = useState('')
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)

  const apply = (d: State) => {
    setS(d)
    setItems(Object.fromEntries(d.catalog.map((c) => [c.key, d.items.find((i) => i.key === c.key) ?? { key: c.key, status: 'PENDENTE', note: null }])))
    setKm(d.km != null ? String(d.km) : '')
    setDate(d.receivedAt ? String(d.receivedAt).slice(0, 10) : new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }))
    setNotes(d.notes ?? '')
  }
  const load = useCallback(async () => {
    const j = await fetch(`/api/vehicles/${vehicleId}/reception`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null)
    if (j?.success) apply(j.data)
  }, [vehicleId])
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t) }, [load])

  const body = () => ({ items: Object.values(items), km: km ? Number(km) : null, receivedAt: date ? `${date}T12:00:00` : null, notes })
  async function save(quiet = false) {
    setBusy('save'); if (!quiet) setMsg(null)
    try {
      const r = await fetch(`/api/vehicles/${vehicleId}/reception`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body()) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Falha ao salvar.')
      apply(j.data); if (!quiet) setMsg({ ok: true, t: 'Checklist salvo.' })
      return true
    } catch (e) { setMsg({ ok: false, t: (e as Error).message }); return false } finally { setBusy(null) }
  }
  async function act(action: 'confirm' | 'reopen') {
    if (action === 'confirm' && !date) { setMsg({ ok: false, t: 'Informe a data da chegada.' }); return }
    if (action === 'confirm' && !km) { setMsg({ ok: false, t: 'Informe o km na chegada.' }); return }
    if (action === 'confirm' && !(await save(true))) return
    setBusy(action); setMsg(null)
    try {
      const r = await fetch(`/api/vehicles/${vehicleId}/reception`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'Não foi possível concluir.')
      apply(j.data); setMsg({ ok: true, t: action === 'confirm' ? 'Recebimento confirmado.' : 'Recebimento reaberto.' })
      await onChanged()
    } catch (e) { setMsg({ ok: false, t: (e as Error).message }) } finally { setBusy(null) }
  }

  if (!s) return <Loader2 className="animate-spin text-gray-400" />
  const locked = !!s.confirmedAt || !canEdit
  const setItem = (key: string, p: Partial<Item>) => setItems((x) => ({ ...x, [key]: { ...x[key], ...p } }))

  return (
    <div className="space-y-4">
      {s.confirmedAt ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <span className="flex items-center gap-2"><CheckCircle2 size={16} />Recebido em {new Date(s.receivedAt ?? s.confirmedAt).toLocaleDateString('pt-BR')}{s.confirmedByName ? ` por ${s.confirmedByName}` : ''} · km {s.km?.toLocaleString('pt-BR') ?? '—'}</span>
          {canEdit && <button type="button" onClick={() => void act('reopen')} disabled={!!busy} className="inline-flex items-center gap-1 text-xs font-medium underline"><RotateCcw size={12} />Reabrir</button>}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-medium text-gray-600">Data da chegada <RequiredMark />
          <input type="date" value={date} disabled={locked} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="block text-xs font-medium text-gray-600">Km na chegada <RequiredMark />
          <input inputMode="numeric" value={km} disabled={locked} onChange={(e) => setKm(e.target.value.replace(/\D/g, ''))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="block text-xs font-medium text-gray-600">Observações
          <input value={notes} disabled={locked} onChange={(e) => setNotes(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Ex.: 2 chaves" />
        </label>
      </div>

      <p className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Checklist de recebimento <HelpHint {...opsHint('RECEBIMENTO')} /></p>
      <ul className="grid gap-3 md:grid-cols-2">
        {s.catalog.map((c) => {
          const it = items[c.key]
          const photos = s.photos.filter((p) => p.refKey === c.key)
          const ok = it?.status === 'NAO_POSSUI' ? !!it.note?.trim() : photos.length > 0
          return (
            <li key={c.key} className={`rounded-xl border p-3 ${ok ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200 bg-white'}`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">{ok ? <CheckCircle2 size={14} className="text-emerald-600" /> : <PackageCheck size={14} className="text-gray-400" />}{c.label}</p>
                <label className="flex items-center gap-1 text-[11px] text-gray-600">
                  <input type="checkbox" disabled={locked} checked={it?.status === 'NAO_POSSUI'} onChange={(e) => setItem(c.key, { status: e.target.checked ? 'NAO_POSSUI' : 'PENDENTE' })} className="rounded border-gray-300" />
                  Não possui
                </label>
              </div>
              {it?.status === 'NAO_POSSUI'
                ? <input value={it.note ?? ''} disabled={locked} onChange={(e) => setItem(c.key, { note: e.target.value })} placeholder="Justificativa (obrigatória)" className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs" />
                : <VehicleFilesField vehicleId={vehicleId} kind="RECEBIMENTO" refKey={c.key} files={photos} canEdit={!locked} compact onChange={load} accept="image/*" />}
            </li>
          )
        })}
      </ul>

      {!s.confirmedAt && s.missing.length > 0 && (
        <p className="text-xs text-amber-800">Falta: {s.missing.join(' · ')}</p>
      )}
      {canEdit && !s.confirmedAt && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void save()} disabled={!!busy} className="btn-secondary px-3 py-1.5 text-xs">{busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Salvar checklist</button>
          <button type="button" onClick={() => void act('confirm')} disabled={!!busy} className="btn-primary px-3 py-1.5 text-xs">{busy === 'confirm' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}Confirmar recebimento</button>
        </div>
      )}
      {msg && <p className={`text-xs ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.t}</p>}
    </div>
  )
}
