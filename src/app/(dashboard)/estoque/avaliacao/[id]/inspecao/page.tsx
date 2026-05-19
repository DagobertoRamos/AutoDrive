'use client'

// =============================================================================
// /estoque/avaliacao/[id]/inspecao
//
// Tela principal de Inspeção da Avaliação no estilo Autoconf.
// - Tabs de seção (Interior, Frente, Direita, Traseira, Esquerda, Test-drive, Serviços, Documentos, Resumo)
// - Lista de itens por seção com status + botão Reavaliar/Editar
// - Drawer lateral para reavaliar item: status, serviço, gastos, fotos
// - Upload de anexos (imagem/PDF) com câmera nativa via input capture
// - Totalizador sticky no topo
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Loader2, Sofa, ArrowUp, ArrowRight, ArrowDown, ArrowLeftRight,
  Gauge, Wrench, FileText, CheckCircle2, AlertTriangle, Plus, X, Save,
  Camera, Upload, ImageIcon, FileIcon, Trash2, RefreshCcw, Lock,
  ChevronRight,
} from 'lucide-react'
import {
  SECTIONS, ITEMS, ITEM_STATUS, SERVICE_TYPES, SERVICE_TYPE_LABELS,
  PRIORITIES, ATTACHMENT_CATEGORIES,
  type SectionKey,
} from '@/lib/evaluation/catalog'

// ── Tipos ────────────────────────────────────────────────────────────────────

interface EvalItem {
  id:            string
  section:       string
  catalogKey:    string | null
  name:          string
  status:        string
  priority:      string | null
  notes:         string | null
  totalExpenses: number | string | null
}
interface EvalService {
  id:            string
  evaluationId:  string
  itemId:        string | null
  section:       string | null
  description:   string
  serviceType:   string
  estimatedCost: number | string | null
  priority:      string | null
  status:        string
  notes:         string | null
}
interface EvalAttachment {
  id:           string
  evaluationId: string
  itemId:       string | null
  section:      string | null
  category:     string | null
  fileName:     string
  fileType:     string
  publicUrl:    string | null
  uploadedByName: string | null
  createdAt:    string
}
interface Evaluation {
  id: string
  status?: string
  plate?: string | null; brand?: string | null; model?: string | null
  modelYear?: number | null; km?: number | null
  fipeValue?: number | string | null
  evaluatedValue?: number | string | null
  suggestedSalePrice?: number | string | null
  totalExpenses?: number | string | null
  evaluatorFeedback?: string | null
  estimatedDays?: number | null
  items?:       EvalItem[]
  services?:    EvalService[]
  attachments?: EvalAttachment[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const ICONS: Record<string, React.ElementType> = {
  Car: FileIcon, FileText, Sofa, ArrowUp, ArrowRight, ArrowDown, ArrowLeft: ArrowLeftRight,
  Gauge, Wrench, CheckCircle2,
}
function Icon({ name, size = 14 }: { name: string; size?: number }) {
  const Cmp = ICONS[name] ?? FileText
  return <Cmp size={size} />
}
const fmtBRL = (v: unknown): string => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return isNaN(n) ? 'R$ 0,00' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function maskBRLInput(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (!digits) return ''
  return (parseInt(digits, 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function parseBRL(value: string): number {
  const n = parseFloat(value.replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? 0 : n
}
const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

const statusBadge = (status: string) => {
  const s = ITEM_STATUS.find((s) => s.value === status) ?? ITEM_STATUS[ITEM_STATUS.length - 1]
  return s
}

// ── Página ───────────────────────────────────────────────────────────────────

export default function InspecaoPage() {
  const params  = useParams<{ id: string }>()
  const router  = useRouter()
  const evalId  = params.id

  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [tab, setTab]         = useState<SectionKey>('INTERIOR')
  const [data, setData]       = useState<Evaluation | null>(null)
  const [drawer, setDrawer]   = useState<{ open: boolean; item: EvalItem | null }>({ open: false, item: null })
  const [toast, setToast]     = useState<{ msg: string; ok: boolean } | null>(null)

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res  = await fetch(`/api/evaluations/${evalId}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Falha ao carregar avaliação')
      setData(json.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro')
    } finally {
      setLoading(false)
    }
  }, [evalId])

  useEffect(() => { load() }, [load])

  // ── Seed inicial se a avaliação ainda não tem itens ────────────────────────
  const seeded = useRef(false)
  useEffect(() => {
    if (!data || seeded.current) return
    if ((data.items?.length ?? 0) > 0) { seeded.current = true; return }
    seeded.current = true
    ;(async () => {
      // se não tem itens, pede para criar a partir do catálogo no servidor
      await fetch(`/api/evaluations/${evalId}/items/seed`, { method: 'POST' }).catch(() => {})
      load()
    })()
  }, [data, evalId, load])

  const status = data?.status ?? 'DRAFT'
  const isLocked = ['FINALIZED', 'APPROVED', 'REJECTED', 'CANCELED'].includes(status)
  const total    = data?.totalExpenses != null ? Number(data.totalExpenses) : 0

  // ── Agrupa itens/services por seção ────────────────────────────────────────
  const itemsBySection = useMemo(() => {
    const map: Record<string, EvalItem[]> = {}
    for (const i of data?.items ?? []) {
      (map[i.section] ??= []).push(i)
    }
    return map
  }, [data?.items])

  const servicesByItem = useMemo(() => {
    const map: Record<string, EvalService[]> = {}
    for (const s of data?.services ?? []) {
      if (s.itemId) (map[s.itemId] ??= []).push(s)
    }
    return map
  }, [data?.services])

  const generalServices = useMemo(
    () => (data?.services ?? []).filter((s) => !s.itemId),
    [data?.services],
  )

  const attachmentsBySection = useMemo(() => {
    const map: Record<string, EvalAttachment[]> = {}
    for (const a of data?.attachments ?? []) {
      const key = a.section ?? 'OUTRO'
      ;(map[key] ??= []).push(a)
    }
    return map
  }, [data?.attachments])

  // ── Ações ─────────────────────────────────────────────────────────────────

  async function handleFinish() {
    if (!confirm('Finalizar avaliação? Após finalizar somente gerência poderá reabrir.')) return
    setSaving(true)
    try {
      const res = await fetch(`/api/evaluations/${evalId}/finish`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Falha ao finalizar')
      showToast('Avaliação finalizada.', true)
      load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Erro', false)
    } finally {
      setSaving(false)
    }
  }

  async function handleReopen() {
    if (!confirm('Reabrir avaliação?')) return
    setSaving(true)
    try {
      const res = await fetch(`/api/evaluations/${evalId}/reopen`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Falha ao reabrir')
      showToast('Avaliação reaberta.', true)
      load()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Erro', false)
    } finally {
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-brand-600" />
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error || 'Avaliação não encontrada.'}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-32">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/estoque/avaliacao" className="rounded-lg border border-gray-300 bg-white p-2 text-gray-500 hover:bg-gray-50">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">Inspeção de Avaliação</h1>
            {data.plate && (
              <span className="inline-flex items-center rounded-full bg-brand-100 px-2 py-0.5 font-mono text-xs font-medium text-brand-800">
                {data.plate}
              </span>
            )}
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
              isLocked ? 'bg-gray-200 text-gray-700' : 'bg-blue-100 text-blue-800'
            }`}>
              {isLocked && <Lock size={10} />}
              {status}
            </span>
          </div>
          <p className="text-sm text-gray-500">
            {[data.brand, data.model, data.modelYear].filter(Boolean).join(' ')}
            {data.km != null && <span> · {Number(data.km).toLocaleString('pt-BR')} km</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isLocked && (
            <button
              onClick={handleFinish}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              Finalizar
            </button>
          )}
          {isLocked && (
            <button
              onClick={handleReopen}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60"
            >
              <RefreshCcw size={14} /> Reabrir
            </button>
          )}
        </div>
      </div>

      {/* Totalizador sticky */}
      <div className="sticky top-0 z-20 grid grid-cols-2 gap-2 rounded-xl border border-brand-200 bg-white/95 p-3 shadow-sm backdrop-blur sm:grid-cols-4">
        <Stat label="FIPE"       value={data.fipeValue != null ? fmtBRL(data.fipeValue) : '—'} />
        <Stat label="Avaliado"   value={data.evaluatedValue != null ? fmtBRL(data.evaluatedValue) : '—'} />
        <Stat label="Sugerido"   value={data.suggestedSalePrice != null ? fmtBRL(data.suggestedSalePrice) : '—'} />
        <Stat label="Gastos previstos" value={fmtBRL(total)} highlight />
      </div>

      {/* Tabs de seção */}
      <div className="flex flex-wrap items-center gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5">
        {SECTIONS.map((s) => {
          const active = tab === s.key
          const count  = (itemsBySection[s.key]?.length ?? 0)
          return (
            <button
              key={s.key}
              onClick={() => setTab(s.key)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                active ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Icon name={s.icon} size={12} />
              {s.label}
              {count > 0 && (
                <span className={`rounded-full px-1.5 text-[10px] ${active ? 'bg-white/30' : 'bg-gray-200 text-gray-700'}`}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Erro global / toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${
          toast.ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'
        }`}>
          {toast.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          {toast.msg}
        </div>
      )}

      {/* Conteúdo da aba */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        {/* DADOS / DOCUMENTOS / RESUMO / SERVIÇOS — abas especiais */}
        {tab === 'DADOS' && <DadosTab data={data} onSaved={load} disabled={isLocked} />}
        {tab === 'DOCUMENTOS' && (
          <DocumentosTab
            evalId={evalId}
            attachments={attachmentsBySection['DOCUMENTOS'] ?? []}
            onChanged={load}
            disabled={isLocked}
            showToast={showToast}
          />
        )}
        {tab === 'SERVICOS' && (
          <ServicosGeraisTab evalId={evalId} services={generalServices} onChanged={load} disabled={isLocked} showToast={showToast} />
        )}
        {tab === 'RESUMO' && <ResumoTab data={data} />}

        {/* Seções de inspeção */}
        {(['INTERIOR', 'FRENTE', 'DIREITA', 'TRASEIRA', 'ESQUERDA', 'TEST_DRIVE'] as const).includes(tab as never) && (
          <SectionItemsTab
            sectionKey={tab as SectionKey}
            items={itemsBySection[tab] ?? []}
            servicesByItem={servicesByItem}
            attachments={attachmentsBySection[tab] ?? []}
            disabled={isLocked}
            evalId={evalId}
            onOpenDrawer={(item) => setDrawer({ open: true, item })}
            onChanged={load}
            showToast={showToast}
          />
        )}
      </div>

      {/* Drawer de reavaliação */}
      {drawer.open && drawer.item && (
        <RevaluateDrawer
          evalId={evalId}
          item={drawer.item}
          services={servicesByItem[drawer.item.id] ?? []}
          attachments={(data.attachments ?? []).filter((a) => a.itemId === drawer.item!.id)}
          onClose={() => setDrawer({ open: false, item: null })}
          onSaved={() => { load(); setDrawer({ open: false, item: null }) }}
          onSavedAddAnother={() => load()}
          disabled={isLocked}
          showToast={showToast}
        />
      )}
    </div>
  )
}

// ── Subcomponentes ────────────────────────────────────────────────────────────

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-base font-bold ${highlight ? 'text-emerald-700' : 'text-gray-800'}`}>{value}</p>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const s = statusBadge(status)
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${s.color}`}>{s.label}</span>
}

// ── Tab: Dados ────────────────────────────────────────────────────────────────

function DadosTab({ data, onSaved, disabled }: { data: Evaluation; onSaved: () => void; disabled: boolean }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Dados do veículo</p>
      <p className="text-sm text-gray-700">
        Esses dados são gerenciados na tela de criação da avaliação. Use o módulo de Avaliação para alterar marca/modelo/FIPE.
      </p>
      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
        <Info label="Placa" value={data.plate ?? '—'} />
        <Info label="Marca" value={data.brand ?? '—'} />
        <Info label="Modelo" value={data.model ?? '—'} />
        <Info label="Ano/Modelo" value={String(data.modelYear ?? '—')} />
        <Info label="KM" value={data.km != null ? Number(data.km).toLocaleString('pt-BR') : '—'} />
        <Info label="FIPE" value={data.fipeValue != null ? fmtBRL(data.fipeValue) : '—'} />
        <Info label="Avaliado" value={data.evaluatedValue != null ? fmtBRL(data.evaluatedValue) : '—'} />
        <Info label="Sugerido venda" value={data.suggestedSalePrice != null ? fmtBRL(data.suggestedSalePrice) : '—'} />
        <Info label="Total previsto" value={fmtBRL(data.totalExpenses ?? 0)} />
      </div>
      {!disabled && (
        <Link href={`/estoque/avaliacao?id=${data.id}`} className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline">
          Editar dados cadastrais <ChevronRight size={12} />
        </Link>
      )}
      <button type="button" onClick={onSaved} className="hidden" aria-hidden />
    </div>
  )
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <p className="text-[10px] uppercase text-gray-500">{label}</p>
      <p className="font-medium text-gray-800">{value}</p>
    </div>
  )
}

// ── Tab: Itens de uma seção (Interior / Frente / etc) ────────────────────────

function SectionItemsTab({
  sectionKey, items, servicesByItem, attachments, evalId, onOpenDrawer, onChanged, disabled, showToast,
}: {
  sectionKey: SectionKey
  items: EvalItem[]
  servicesByItem: Record<string, EvalService[]>
  attachments: EvalAttachment[]
  evalId: string
  onOpenDrawer: (item: EvalItem) => void
  onChanged: () => void
  disabled: boolean
  showToast: (msg: string, ok?: boolean) => void
}) {
  const sectionDef = SECTIONS.find((s) => s.key === sectionKey)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-800">{sectionDef?.label}</p>
          <p className="text-xs text-gray-500">{sectionDef?.desc}</p>
        </div>
        {!disabled && (
          <AttachmentUploader evalId={evalId} section={sectionKey} category="FOTO" onUploaded={() => { onChanged(); showToast('Foto enviada.', true) }} />
        )}
      </div>

      {/* Fotos da seção */}
      {attachments.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {attachments.map((a) => (
            <AttachmentThumb key={a.id} a={a} evalId={evalId} onDeleted={onChanged} canDelete={!disabled} />
          ))}
        </div>
      )}

      {/* Lista de itens */}
      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
        {items.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-gray-400">
            Itens do checklist serão criados ao salvar.
          </div>
        )}
        {items.map((it) => {
          const its = servicesByItem[it.id] ?? []
          const has = its.length > 0
          return (
            <div key={it.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 hover:bg-gray-50">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{it.name}</p>
                {has && (
                  <ul className="mt-1 space-y-0.5">
                    {its.map((s) => (
                      <li key={s.id} className="text-[11px] text-gray-500">
                        <span className="font-medium text-gray-700">{SERVICE_TYPE_LABELS[s.serviceType] ?? s.serviceType}</span>
                        {s.description && <> — {s.description}</>}
                        <span className="ml-2 font-semibold text-emerald-700">{fmtBRL(s.estimatedCost ?? 0)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <StatusPill status={it.status} />
              {it.totalExpenses != null && Number(it.totalExpenses) > 0 && (
                <span className="text-sm font-semibold text-emerald-700">{fmtBRL(it.totalExpenses)}</span>
              )}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onOpenDrawer(it)}
                className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  disabled
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : has
                      ? 'border border-brand-300 text-brand-700 hover:bg-brand-50'
                      : 'bg-brand-600 text-white hover:bg-brand-700'
                }`}
              >
                {has ? 'Editar' : 'Reavaliar'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Tab: Documentos ──────────────────────────────────────────────────────────

function DocumentosTab({
  evalId, attachments, onChanged, disabled, showToast,
}: {
  evalId: string
  attachments: EvalAttachment[]
  onChanged: () => void
  disabled: boolean
  showToast: (msg: string, ok?: boolean) => void
}) {
  const [category, setCategory] = useState('CRLV')
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-gray-800">Documentos e anexos</p>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
          disabled={disabled}
        >
          {ATTACHMENT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        {!disabled && (
          <AttachmentUploader
            evalId={evalId}
            section="DOCUMENTOS"
            category={category}
            onUploaded={() => { onChanged(); showToast('Documento enviado.', true) }}
          />
        )}
      </div>

      {attachments.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-400">
          Nenhum documento anexado. Use o botão acima para enviar.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {attachments.map((a) => (
            <AttachmentCard key={a.id} a={a} evalId={evalId} onDeleted={onChanged} canDelete={!disabled} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tab: Serviços gerais ─────────────────────────────────────────────────────

function ServicosGeraisTab({
  evalId, services, onChanged, disabled, showToast,
}: {
  evalId: string
  services: EvalService[]
  onChanged: () => void
  disabled: boolean
  showToast: (msg: string, ok?: boolean) => void
}) {
  const [type, setType]   = useState<string>(SERVICE_TYPES[0])
  const [desc, setDesc]   = useState('')
  const [cost, setCost]   = useState('')
  const [busy, setBusy]   = useState(false)

  async function add() {
    if (!desc.trim()) { showToast('Informe a descrição.', false); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/evaluations/${evalId}/services`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ serviceType: type, description: desc, estimatedCost: parseBRL(cost) }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Falha')
      setDesc(''); setCost('')
      showToast('Serviço adicionado.', true)
      onChanged()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Erro', false)
    } finally { setBusy(false) }
  }

  async function remove(id: string) {
    if (!confirm('Remover este serviço?')) return
    const res = await fetch(`/api/evaluations/${evalId}/services/${id}`, { method: 'DELETE' })
    if (res.ok) { showToast('Serviço removido.', true); onChanged() }
    else { showToast('Falha ao remover.', false) }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-gray-800">Serviços gerais da avaliação</p>

      {!disabled && (
        <div className="grid grid-cols-1 gap-2 rounded-xl border border-brand-200 bg-brand-50/40 p-3 sm:grid-cols-[180px_1fr_140px_auto]">
          <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
            {SERVICE_TYPES.map((t) => <option key={t} value={t}>{SERVICE_TYPE_LABELS[t]}</option>)}
          </select>
          <input className={inputCls} placeholder="Descrição (ex: Higienização interna)" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <input className={inputCls} placeholder="0,00" value={cost} onChange={(e) => setCost(maskBRLInput(e.target.value))} />
          <button onClick={add} disabled={busy} className="flex items-center justify-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60">
            <Plus size={13} /> Adicionar
          </button>
        </div>
      )}

      <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
        {services.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-gray-400">Nenhum serviço geral cadastrado.</p>
        )}
        {services.map((s) => (
          <div key={s.id} className="flex items-center gap-3 px-3 py-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800">{SERVICE_TYPE_LABELS[s.serviceType] ?? s.serviceType}</p>
              <p className="text-xs text-gray-500">{s.description}</p>
            </div>
            <span className="text-sm font-semibold text-emerald-700">{fmtBRL(s.estimatedCost ?? 0)}</span>
            {!disabled && (
              <button onClick={() => remove(s.id)} className="text-gray-400 hover:text-red-600">
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Tab: Resumo ──────────────────────────────────────────────────────────────

function ResumoTab({ data }: { data: Evaluation }) {
  // Resumo agregado por seção (cliente)
  const grouped = useMemo(() => {
    const map: Record<string, Array<{ item: string | null; serviceType: string; description: string; cost: number }>> = {}
    for (const s of data.services ?? []) {
      const sec = s.section ?? 'GERAL'
      const itemName: string | null = data.items?.find((i) => i.id === s.itemId)?.name ?? null
      if (!map[sec]) map[sec] = []
      map[sec].push({
        item: itemName,
        serviceType: SERVICE_TYPE_LABELS[s.serviceType] ?? s.serviceType,
        description: s.description,
        cost: Number(s.estimatedCost ?? 0),
      })
    }
    return map
  }, [data])

  const totalGeral = Object.values(grouped).reduce((sum, arr) => sum + arr.reduce((a, b) => a + b.cost, 0), 0)

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-gray-800">Resumo da Avaliação</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Info label="Placa" value={data.plate ?? '—'} />
        <Info label="Marca/modelo" value={`${data.brand ?? '—'} ${data.model ?? ''}`.trim()} />
        <Info label="FIPE" value={data.fipeValue != null ? fmtBRL(data.fipeValue) : '—'} />
        <Info label="Avaliado" value={data.evaluatedValue != null ? fmtBRL(data.evaluatedValue) : '—'} />
      </div>

      {Object.entries(grouped).map(([sec, rows]) => {
        const secTotal = rows.reduce((a, b) => a + b.cost, 0)
        return (
          <div key={sec} className="rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">{sec}</p>
              <p className="text-sm font-semibold text-emerald-700">{fmtBRL(secTotal)}</p>
            </div>
            <ul className="divide-y divide-gray-50">
              {rows.map((r, i) => (
                <li key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="flex-1 min-w-0 text-gray-700">
                    {r.item && <span className="font-medium text-gray-800">{r.item}</span>}
                    {r.item && ' · '}{r.serviceType}{r.description && <span className="text-gray-500"> — {r.description}</span>}
                  </span>
                  <span className="text-sm font-semibold text-gray-800">{fmtBRL(r.cost)}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      })}

      <div className="flex items-center justify-between rounded-xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3">
        <p className="text-sm font-semibold text-emerald-800">Previsão total</p>
        <p className="text-lg font-bold text-emerald-700">{fmtBRL(totalGeral)}</p>
      </div>
    </div>
  )
}

// ── Drawer de Reavaliação ────────────────────────────────────────────────────

function RevaluateDrawer({
  evalId, item, services, attachments,
  onClose, onSaved, onSavedAddAnother, disabled, showToast,
}: {
  evalId: string
  item: EvalItem
  services: EvalService[]
  attachments: EvalAttachment[]
  onClose: () => void
  onSaved: () => void
  onSavedAddAnother: () => void
  disabled: boolean
  showToast: (msg: string, ok?: boolean) => void
}) {
  const [status,   setStatus]   = useState(item.status)
  const [priority, setPriority] = useState<string>(item.priority ?? 'MEDIA')
  const [itemNotes,setItemNotes]= useState(item.notes ?? '')
  const [stype,    setStype]    = useState<string>(SERVICE_TYPES[0])
  const [desc,     setDesc]     = useState('')
  const [cost,     setCost]     = useState('')
  const [snotes,   setSnotes]   = useState('')
  const [busy,     setBusy]     = useState(false)

  async function save(addAnother: boolean) {
    setBusy(true)
    try {
      const wantsService = desc.trim().length > 0
      const res = await fetch(`/api/evaluations/${evalId}/items/${item.id}/revaluate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          status, priority, itemNotes,
          service: wantsService ? {
            serviceType: stype,
            description: desc,
            estimatedCost: parseBRL(cost),
            priority,
            notes: snotes || undefined,
          } : null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Falha ao salvar')
      showToast('Reavaliação salva.', true)
      if (addAnother) {
        setDesc(''); setCost(''); setSnotes('')
        onSavedAddAnother()
      } else {
        onSaved()
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Erro', false)
    } finally { setBusy(false) }
  }

  async function removeService(id: string) {
    if (!confirm('Remover este serviço?')) return
    const res = await fetch(`/api/evaluations/${evalId}/services/${id}`, { method: 'DELETE' })
    if (res.ok) { showToast('Serviço removido.', true); onSavedAddAnother() }
    else showToast('Falha ao remover.', false)
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40">
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-5 py-4">
          <div>
            <h3 className="font-semibold text-gray-900">Reavaliar item</h3>
            <p className="text-xs text-gray-500">{item.name} · {item.section}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 px-5 py-4 text-sm">
          {/* Status + prioridade */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Status do item</label>
              <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)} disabled={disabled}>
                {ITEM_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Prioridade</label>
              <select className={inputCls} value={priority} onChange={(e) => setPriority(e.target.value)} disabled={disabled}>
                {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Descrição do problema</label>
            <textarea className={`${inputCls} min-h-16 resize-y`} value={itemNotes} onChange={(e) => setItemNotes(e.target.value)} disabled={disabled} />
          </div>

          {/* Serviços já lançados */}
          {services.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-gray-600">Serviços já cadastrados</p>
              <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                {services.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                    <span className="flex-1 min-w-0">
                      <span className="font-medium text-gray-800">{SERVICE_TYPE_LABELS[s.serviceType] ?? s.serviceType}</span>
                      {s.description && <span className="text-gray-500"> — {s.description}</span>}
                    </span>
                    <span className="font-semibold text-emerald-700">{fmtBRL(s.estimatedCost ?? 0)}</span>
                    {!disabled && (
                      <button onClick={() => removeService(s.id)} className="text-gray-400 hover:text-red-600">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Adicionar novo serviço */}
          {!disabled && (
            <div className="space-y-2 rounded-xl border border-dashed border-brand-300 bg-brand-50/30 p-3">
              <p className="text-xs font-semibold text-brand-800">Adicionar serviço</p>
              <select className={inputCls} value={stype} onChange={(e) => setStype(e.target.value)}>
                {SERVICE_TYPES.map((t) => <option key={t} value={t}>{SERVICE_TYPE_LABELS[t]}</option>)}
              </select>
              <input className={inputCls} placeholder="Ex: Pintura porta dianteira" value={desc} onChange={(e) => setDesc(e.target.value)} />
              <input className={inputCls} placeholder="0,00" value={cost} onChange={(e) => setCost(maskBRLInput(e.target.value))} />
              <textarea className={`${inputCls} min-h-12 resize-y text-xs`} placeholder="Observações" value={snotes} onChange={(e) => setSnotes(e.target.value)} />
            </div>
          )}

          {/* Fotos do item */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium text-gray-600">Fotos / anexos do item</p>
              {!disabled && (
                <AttachmentUploader evalId={evalId} itemId={item.id} section={item.section} category="FOTO" small onUploaded={onSavedAddAnother} />
              )}
            </div>
            {attachments.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {attachments.map((a) => (
                  <AttachmentThumb key={a.id} a={a} evalId={evalId} onDeleted={onSavedAddAnother} canDelete={!disabled} />
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-gray-400">Sem anexos vinculados.</p>
            )}
          </div>
        </div>

        {/* Ações */}
        <div className="border-t border-gray-200 bg-gray-50 px-5 py-3">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => save(false)}
              disabled={busy || disabled}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
            </button>
            <button
              onClick={() => save(true)}
              disabled={busy || disabled}
              className="flex items-center gap-1.5 rounded-lg border border-brand-300 bg-white px-3 py-2 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60"
            >
              <Plus size={12} /> Salvar e adicionar outro
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Componente: Upload de anexo ───────────────────────────────────────────────

function AttachmentUploader({
  evalId, itemId, section, category, small, onUploaded,
}: {
  evalId:   string
  itemId?:  string
  section?: string
  category: string
  small?:   boolean
  onUploaded: () => void
}) {
  const fileRef   = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return
    setBusy(true)
    for (let i = 0; i < files.length; i++) {
      const f  = files[i]
      const fd = new FormData()
      fd.append('file', f)
      fd.append('category', category)
      if (section) fd.append('section', section)
      if (itemId)  fd.append('itemId',  itemId)
      try {
        await fetch(`/api/evaluations/${evalId}/attachments`, { method: 'POST', body: fd })
      } catch { /* ignore */ }
    }
    setBusy(false)
    onUploaded()
    if (fileRef.current)   fileRef.current.value   = ''
    if (cameraRef.current) cameraRef.current.value = ''
  }

  const cls = small
    ? 'flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-50'
    : 'flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50'

  return (
    <div className="flex items-center gap-1.5">
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => upload(e.target.files)}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => upload(e.target.files)}
      />
      <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className={cls}>
        {busy ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />} Enviar
      </button>
      <button type="button" onClick={() => cameraRef.current?.click()} disabled={busy} className={cls}>
        <Camera size={11} /> Câmera
      </button>
    </div>
  )
}

// ── Componente: Thumb de imagem (com lightbox simples) ───────────────────────

function AttachmentThumb({ a, evalId, onDeleted, canDelete }: { a: EvalAttachment; evalId: string; onDeleted: () => void; canDelete: boolean }) {
  const [open, setOpen] = useState(false)

  async function remove() {
    if (!confirm(`Remover ${a.fileName}?`)) return
    const res = await fetch(`/api/evaluations/${evalId}/attachments/${a.id}`, { method: 'DELETE' })
    if (res.ok) onDeleted()
  }

  return (
    <>
      <div className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
        {a.fileType === 'image' && a.publicUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.publicUrl} alt={a.fileName} className="h-full w-full cursor-zoom-in object-cover" onClick={() => setOpen(true)} />
        ) : (
          <a href={a.publicUrl ?? '#'} target="_blank" rel="noopener" className="flex h-full w-full flex-col items-center justify-center text-gray-500">
            <FileIcon size={20} />
            <span className="mt-1 line-clamp-2 px-1 text-center text-[9px]">{a.fileName}</span>
          </a>
        )}
        {canDelete && (
          <button onClick={remove} className="absolute right-1 top-1 rounded bg-white/90 p-1 opacity-0 group-hover:opacity-100">
            <Trash2 size={11} className="text-red-600" />
          </button>
        )}
      </div>
      {open && a.publicUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setOpen(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={a.publicUrl} alt={a.fileName} className="max-h-full max-w-full" />
        </div>
      )}
    </>
  )
}

function AttachmentCard({ a, evalId, onDeleted, canDelete }: { a: EvalAttachment; evalId: string; onDeleted: () => void; canDelete: boolean }) {
  async function remove() {
    if (!confirm(`Remover ${a.fileName}?`)) return
    const res = await fetch(`/api/evaluations/${evalId}/attachments/${a.id}`, { method: 'DELETE' })
    if (res.ok) onDeleted()
  }
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="aspect-video bg-gray-100">
        {a.fileType === 'image' && a.publicUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.publicUrl} alt={a.fileName} className="h-full w-full object-cover" />
        ) : (
          <a href={a.publicUrl ?? '#'} target="_blank" rel="noopener" className="flex h-full w-full flex-col items-center justify-center gap-1 text-gray-500">
            <FileIcon size={22} />
            <span className="text-[10px]">PDF</span>
          </a>
        )}
      </div>
      <div className="p-2 text-xs">
        <p className="line-clamp-1 font-medium text-gray-800">{a.fileName}</p>
        <p className="line-clamp-1 text-[10px] text-gray-400">{a.category} · {a.uploadedByName ?? '—'}</p>
        {canDelete && (
          <button onClick={remove} className="mt-1 flex items-center gap-1 text-[10px] text-red-600 hover:underline">
            <Trash2 size={10} /> Remover
          </button>
        )}
      </div>
    </div>
  )
}

// Helpers de tipos não usados por enquanto, evitar warning
void ImageIcon
