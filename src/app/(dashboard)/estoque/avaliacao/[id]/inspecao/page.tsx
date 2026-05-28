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
import { useParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { AwaitingReleaseBanner } from '../../_components/AwaitingReleaseBanner'
import { EvaluationSections } from '../../_components/EvaluationSections'
import { CautelarUploader, type AttachmentLite } from '../../_components/CautelarUploader'
import {
  ArrowLeft, Loader2, Sofa, ArrowUp, ArrowRight, ArrowDown, ArrowLeftRight,
  Gauge, Wrench, FileText, CheckCircle2, AlertTriangle, Plus,
  Camera, Upload, ImageIcon, FileIcon, Trash2, RefreshCcw, Lock,
  ChevronRight,
} from 'lucide-react'
import {
  SECTIONS, ITEM_STATUS, SERVICE_TYPES, SERVICE_TYPE_LABELS,
  ATTACHMENT_CATEGORIES,
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
  mimeType:     string | null
  fileSize:     number | null
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
  releasedAt?:   string | null
  reopenCount?:  number | null
  _pricingHidden?: boolean | null
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
  // Anti-NaN: aceita number, string mascarada e Decimal-string. Sempre coerce
  // via Number() final e cai em "R$ 0,00" quando inválido.
  if (v == null || v === '') return 'R$ 0,00'
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.'))
  if (!Number.isFinite(n)) return 'R$ 0,00'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function maskBRLInput(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (!digits) return ''
  const cents = parseInt(digits, 10)
  if (!Number.isFinite(cents)) return ''
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function parseBRL(value: string): number {
  // Usa convenção dígitos-como-centavos (consistente com maskBRLInput) para
  // evitar o bug clássico "3,00" → 3 → "0,03".
  if (!value) return 0
  const digits = String(value).replace(/\D/g, '')
  if (!digits) return 0
  const cents = parseInt(digits, 10)
  return Number.isFinite(cents) ? cents / 100 : 0
}
const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

const statusBadge = (status: string) => {
  const s = ITEM_STATUS.find((s) => s.value === status) ?? ITEM_STATUS[ITEM_STATUS.length - 1]
  return s
}

// ── Página ───────────────────────────────────────────────────────────────────

export default function InspecaoPage() {
  const params  = useParams<{ id: string }>()
  const evalId  = params.id

  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [tab, setTab]         = useState<SectionKey>('INTERIOR')
  const [data, setData]       = useState<Evaluation | null>(null)
  const [toast, setToast]     = useState<{ msg: string; ok: boolean } | null>(null)
  const { data: session }     = useSession()
  const role                  = (session?.user as { role?: string })?.role ?? null

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
  const isLocked = ['FINALIZED', 'APPROVED', 'REJECTED', 'CANCELED', 'CANCELADA', 'LIBERADA'].includes(status)
  const total    = data?.totalExpenses != null ? Number(data.totalExpenses) : 0
  const isManagerPlus = role ? ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE'].includes(role) : false
  const isAwaitingApproval = status === 'AGUARDANDO_APROVACAO'

  // ── Agrupa itens/services por seção ────────────────────────────────────────
  const itemsBySection = useMemo(() => {
    const map: Record<string, EvalItem[]> = {}
    for (const i of data?.items ?? []) {
      (map[i.section] ??= []).push(i)
    }
    return map
  }, [data?.items])

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
        <div className="flex flex-wrap items-center gap-2">
          {!isLocked && !isAwaitingApproval && (
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
          {/* Cancelar avaliação — gerente+ apenas, status não-finais */}
          {isManagerPlus && !['CANCELADA', 'CANCELED', 'LIBERADA', 'APPROVED', 'REJECTED'].includes(status) && (
            <button
              onClick={async () => {
                const motivo = prompt('Informe o motivo do cancelamento:')
                if (!motivo || !motivo.trim()) return
                setSaving(true)
                try {
                  const r = await fetch(`/api/evaluations/${evalId}/cancel`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reason: motivo.trim() }),
                  })
                  const d = await r.json()
                  if (!r.ok) { showToast(d?.error ?? 'Falha ao cancelar', false); return }
                  showToast('Avaliação cancelada.', true)
                  load()
                } catch { showToast('Erro de conexão.', false) }
                finally { setSaving(false) }
              }}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              <AlertTriangle size={14} /> Cancelar avaliação
            </button>
          )}
        </div>
      </div>

      {/* Banner para VENDEDOR: aguardando liberação do gerente */}
      <AwaitingReleaseBanner
        pricingHidden={data._pricingHidden ?? null}
        releasedAt={data.releasedAt ?? null}
        role={role}
      />

      {/* Totalizador sticky */}
      <div className="sticky top-0 z-20 grid grid-cols-2 gap-2 rounded-xl border border-brand-200 bg-white/95 p-3 shadow-sm backdrop-blur sm:grid-cols-4">
        <Stat label="FIPE"       value={data.fipeValue != null ? fmtBRL(data.fipeValue) : '—'} />
        <Stat label="Avaliado"   value={data.evaluatedValue != null ? fmtBRL(data.evaluatedValue) : '—'} />
        <Stat label="Sugerido"   value={data.suggestedSalePrice != null ? fmtBRL(data.suggestedSalePrice) : '—'} />
        <Stat label="Gastos previstos" value={fmtBRL(total)} highlight />
      </div>

      {/* Painel de precificação — gerente+ quando aguardando aprovação */}
      {isManagerPlus && isAwaitingApproval && (
        <PrecificarPanel
          evalId={evalId}
          data={data}
          onReleased={() => { showToast('Avaliação liberada para o vendedor.', true); load() }}
          showToast={showToast}
        />
      )}

      {/* Tabs de seção — só macro-abas. As 6 sub-abas de inspeção (Interior,
          Frente, Direita, Traseira, Esquerda, Test-drive) ficam DENTRO de
          <EvaluationSections> pra evitar duplicação do menu. */}
      <div className="flex flex-wrap items-center gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1.5">
        {(['DADOS', 'DOCUMENTOS', 'INSPECAO', 'SERVICOS', 'RESUMO'] as const).map((macroKey) => {
          const def = macroKey === 'INSPECAO'
            ? { key: 'INSPECAO', label: 'Inspeção', icon: 'ClipboardCheck' as const }
            : SECTIONS.find((s) => s.key === macroKey) ?? { key: macroKey, label: macroKey, icon: 'Car' }
          // Considera "Inspeção" ativo quando tab está em qualquer uma das 6 sub-seções.
          const inspectionTabs = ['INTERIOR', 'FRENTE', 'DIREITA', 'TRASEIRA', 'ESQUERDA', 'TEST_DRIVE']
          const active = macroKey === 'INSPECAO'
            ? inspectionTabs.includes(tab as string)
            : tab === macroKey
          // Conta total agregado para a macro-aba Inspeção
          const count = macroKey === 'INSPECAO'
            ? inspectionTabs.reduce((acc, k) => acc + (itemsBySection[k as SectionKey]?.length ?? 0), 0)
            : (itemsBySection[macroKey as SectionKey]?.length ?? 0)
          return (
            <button
              key={macroKey}
              onClick={() => setTab(macroKey === 'INSPECAO' ? 'INTERIOR' : (macroKey as SectionKey))}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                active ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Icon name={def.icon} size={12} />
              {def.label}
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

        {/* Seções de inspeção — usa EvaluationSections com tabs próprias */}
        {(['INTERIOR', 'FRENTE', 'DIREITA', 'TRASEIRA', 'ESQUERDA', 'TEST_DRIVE'] as const).includes(tab as never) && (
          <EvaluationSections
            evaluationId={evalId}
            evaluationStatus={status}
            reopenCount={data.reopenCount ?? 0}
            readOnly={isLocked}
          />
        )}
      </div>

      {/* Drawer legado removido — reavaliação ocorre via ItemDrawer dentro de
          EvaluationSections (ver _components/EvaluationSections.tsx). */}
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

// ── Tab: Itens de uma seção — REMOVIDO ───────────────────────────────────────
// Substituído por EvaluationSections (que possui suas próprias tabs internas
// e fluxo de reavaliação via ItemDrawer). Histórico no git.


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
  // Particiona: anexos cautelares ficam no widget dedicado; demais (CRLV, OUTRO,
  // FOTO genérica) continuam no widget existente, que aceita todas as categorias.
  const cautelar = attachments.filter((a) => a.category === 'LAUDO_CAUTELAR')
  const outros   = attachments.filter((a) => a.category !== 'LAUDO_CAUTELAR')
  const cautelarLite: AttachmentLite[] = cautelar.map((a) => ({
    id:        a.id,
    fileName:  a.fileName,
    fileType:  a.fileType,
    mimeType:  a.mimeType,
    fileSize:  a.fileSize,
    publicUrl: a.publicUrl,
    category:  a.category,
    uploadedByName: a.uploadedByName,
    createdAt: a.createdAt,
  }))
  return (
    <div className="space-y-6">
      {/* Widget dedicado: Laudo Cautelar */}
      <CautelarUploader
        evaluationId={evalId}
        existingFiles={cautelarLite}
        onChange={() => { onChanged(); showToast('Arquivos cautelar atualizados.', true) }}
        readOnly={disabled}
      />

      <div className="border-t border-gray-100 pt-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-gray-800">Outros documentos e anexos</p>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
          disabled={disabled}
        >
          {ATTACHMENT_CATEGORIES.filter((c) => c.value !== 'LAUDO_CAUTELAR').map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
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

      {outros.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-400">
          Nenhum outro documento anexado. Use o botão acima para enviar.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {outros.map((a) => (
            <AttachmentCard key={a.id} a={a} evalId={evalId} onDeleted={onChanged} canDelete={!disabled} />
          ))}
        </div>
      )}
      </div>
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

// ── Drawer de Reavaliação — REMOVIDO ─────────────────────────────────────────
// Substituído pelo ItemDrawer dentro de EvaluationSections. Histórico no git.

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

// ── Componente: Painel Precificar (gerente+) ──────────────────────────────

function PrecificarPanel({
  evalId, data, onReleased, showToast,
}: {
  evalId: string
  data: Evaluation
  onReleased: () => void
  showToast: (msg: string, ok?: boolean) => void
}) {
  const initial = (v: number | string | null | undefined) => {
    if (v == null || v === '') return ''
    const n = typeof v === 'number' ? v : Number(v)
    if (!Number.isFinite(n) || n === 0) return ''
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  const [avaliado,  setAvaliado]  = useState(initial(data.evaluatedValue))
  const [desejado,  setDesejado]  = useState('')
  const [minimo,    setMinimo]    = useState('')
  const [sugerido,  setSugerido]  = useState(initial(data.suggestedSalePrice))
  const [feedback,  setFeedback]  = useState(data.evaluatorFeedback ?? '')
  const [busy,      setBusy]      = useState(false)

  async function release() {
    if (!parseBRL(avaliado)) {
      showToast('Informe o valor avaliado.', false)
      return
    }
    setBusy(true)
    try {
      const r = await fetch(`/api/evaluations/${evalId}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evaluatedValue:     parseBRL(avaliado),
          desiredValue:       parseBRL(desejado),
          minimumValue:       parseBRL(minimo),
          suggestedSalePrice: parseBRL(sugerido),
          evaluatorFeedback:  feedback || null,
        }),
      })
      const d = await r.json()
      if (!r.ok) { showToast(d?.error ?? 'Falha ao liberar.', false); return }
      onReleased()
    } catch {
      showToast('Erro de conexão.', false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50/60 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={16} className="text-amber-600" />
        <p className="text-sm font-bold text-amber-900">Precificar e liberar para o vendedor</p>
      </div>
      <p className="text-xs text-amber-800 mb-3">
        Defina os valores de avaliação. Ao liberar, o vendedor é notificado e pode prosseguir
        com a negociação.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-700">Valor Avaliado (R$) *</span>
          <input className={inputCls} placeholder="0,00" value={avaliado} onChange={(e) => setAvaliado(maskBRLInput(e.target.value))} inputMode="numeric" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-700">Valor Desejado pelo Cliente (R$)</span>
          <input className={inputCls} placeholder="0,00" value={desejado} onChange={(e) => setDesejado(maskBRLInput(e.target.value))} inputMode="numeric" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-700">Valor Mínimo de Compra (R$)</span>
          <input className={inputCls} placeholder="0,00" value={minimo} onChange={(e) => setMinimo(maskBRLInput(e.target.value))} inputMode="numeric" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-700">Preço de Venda Sugerido (R$)</span>
          <input className={inputCls} placeholder="0,00" value={sugerido} onChange={(e) => setSugerido(maskBRLInput(e.target.value))} inputMode="numeric" />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-medium text-gray-700">Observações para o vendedor</span>
          <textarea className={inputCls + ' min-h-[72px] resize-y'} placeholder="Justificativa / condições..." value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        </label>
      </div>
      <div className="flex justify-end mt-3">
        <button
          type="button"
          onClick={release}
          disabled={busy}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
          Salvar precificação e liberar
        </button>
      </div>
    </div>
  )
}

// Helpers de tipos não usados por enquanto, evitar warning
void ImageIcon
