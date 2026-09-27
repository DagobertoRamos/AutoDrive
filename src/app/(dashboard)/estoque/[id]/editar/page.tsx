'use client'

// =============================================================================
// /estoque/[id]/editar — Corrigir a ficha do veículo (identificação e dados
// técnicos). Preço tem painel próprio na ficha; fotos, no painel de fotos.
// Salvar usa PATCH /api/vehicles/[id]; anúncios publicados acompanham.
// =============================================================================

import { use, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import { canAccessModule } from '@/lib/permissions'

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'
const labelCls = 'block text-xs font-medium text-gray-600'

const FUELS = [['FLEX', 'Flex'], ['GASOLINA', 'Gasolina'], ['ETANOL', 'Etanol'], ['DIESEL', 'Diesel'], ['HIBRIDO', 'Híbrido'], ['ELETRICO', 'Elétrico'], ['GNV', 'GNV']]
const GEARS = [['AUTOMATICO', 'Automático'], ['MANUAL', 'Manual'], ['CVT', 'CVT'], ['AUTOMATIZADO', 'Automatizado'], ['SEMI_AUTOMATICO', 'Semiautomático']]

type Form = Record<'plate' | 'chassi' | 'renavam' | 'brand' | 'model' | 'version' | 'year' | 'modelYear' | 'km' | 'color' | 'fuel' | 'transmission' | 'doors' | 'notes', string>
const FIELDS: Array<keyof Form> = ['plate', 'chassi', 'renavam', 'brand', 'model', 'version', 'year', 'modelYear', 'km', 'color', 'fuel', 'transmission', 'doors', 'notes']
const NUMERIC = new Set<keyof Form>(['year', 'modelYear', 'km', 'doors'])

export default function EditarVeiculoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role ?? ''
  const [form, setForm] = useState<Form | null>(null)
  const [initial, setInitial] = useState<Form | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch(`/api/vehicles/${id}`, { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      if (!d?.success) { setError(d?.error ?? 'Veículo não encontrado.'); return }
      const f = Object.fromEntries(FIELDS.map((k) => [k, d.data[k] == null ? '' : String(d.data[k])])) as Form
      setForm(f); setInitial(f)
    }).catch(() => setError('Não foi possível carregar o veículo.'))
  }, [id])

  const set = (k: keyof Form, v: string) => setForm((f) => (f ? { ...f, [k]: v } : f))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form || !initial) return
    if (!form.brand.trim() || !form.model.trim()) { setError('Marca e modelo são obrigatórios.'); return }
    // Envia só o que mudou; número vazio não é enviado (não zera o campo).
    const body: Record<string, string | number> = {}
    for (const k of FIELDS) {
      if (form[k] === initial[k]) continue
      if (NUMERIC.has(k)) { const n = Number(form[k].replace(/\D/g, '')); if (form[k].trim() && Number.isFinite(n)) body[k] = n }
      else body[k] = form[k]
    }
    if (!Object.keys(body).length) { router.push(`/estoque/${id}`); return }
    setSaving(true); setError('')
    try {
      const r = await fetch(`/api/vehicles/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.success) throw new Error(d?.error ?? 'Não foi possível salvar.')
      router.push(`/estoque/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar.')
    } finally {
      setSaving(false)
    }
  }

  if (role && !canAccessModule(role, 'stock.manage')) {
    return <p className="p-6 text-sm text-gray-600">Sem permissão para editar veículos.</p>
  }

  const text = (k: keyof Form, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className={labelCls}>{label}<input className={inputCls} value={form?.[k] ?? ''} onChange={(e) => set(k, e.target.value)} autoComplete="off" {...extra} /></label>
  )
  const select = (k: keyof Form, label: string, opts: string[][]) => (
    <label className={labelCls}>{label}
      <select className={inputCls} value={form?.[k] ?? ''} onChange={(e) => set(k, e.target.value)}>
        <option value="">—</option>
        {form?.[k] && !opts.some(([v]) => v === form[k]) && <option value={form[k]}>{form[k]}</option>}
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )

  return (
    <div className="max-w-3xl space-y-5">
      <Link href={`/estoque/${id}`} className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"><ArrowLeft className="h-4 w-4" />Voltar à ficha</Link>
      <div>
        <h1 className="text-xl font-bold text-gray-900">Editar veículo</h1>
        <p className="text-sm text-gray-500">Corrija a identificação e os dados técnicos. Preço e fotos ficam na ficha do veículo.</p>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {!form ? (!error && <Loader2 className="animate-spin text-gray-400" />) : (
        <form onSubmit={save} className="space-y-5">
          <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-800">Modelo</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {text('brand', 'Marca *')}
              {text('model', 'Modelo *')}
              <div className="sm:col-span-2">{text('version', 'Versão', { placeholder: 'Ex.: 2.0 TSI 16V Turbo Automático' })}</div>
              {text('year', 'Ano de fabricação', { inputMode: 'numeric', maxLength: 4 })}
              {text('modelYear', 'Ano do modelo', { inputMode: 'numeric', maxLength: 4 })}
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-800">Dados técnicos</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {text('km', 'Quilometragem', { inputMode: 'numeric' })}
              {text('color', 'Cor')}
              {text('doors', 'Portas', { inputMode: 'numeric', maxLength: 1 })}
              {select('fuel', 'Combustível', FUELS)}
              {select('transmission', 'Câmbio', GEARS)}
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-800">Documentação</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {text('plate', 'Placa', { maxLength: 8, style: { textTransform: 'uppercase' } })}
              {text('chassi', 'Chassi', { maxLength: 17, style: { textTransform: 'uppercase' } })}
              {text('renavam', 'Renavam', { inputMode: 'numeric', maxLength: 11 })}
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <label className={labelCls}>Observações internas<textarea rows={3} className={inputCls} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></label>
          </section>

          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="btn-primary px-5 py-2 text-sm">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Salvar</button>
            <Link href={`/estoque/${id}`} className="btn-secondary px-4 py-2 text-sm">Cancelar</Link>
          </div>
        </form>
      )}
    </div>
  )
}
