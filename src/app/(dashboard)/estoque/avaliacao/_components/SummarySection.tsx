'use client'

// =============================================================================
// SummarySection — aba RESUMO da avaliação. Consolida:
//   • Dados do veículo (placa, marca/modelo, ano, cor, chassi, KM…)
//   • Itens por seção agrupados por status (contagem)
//   • Serviços marcados com custo estimado (total geral)
//   • Anexos (fotos) — só contagem por seção
//   • Campo OBRIGATÓRIO "Atribuir ao vendedor" (dropdown de vendedores)
//   • Botão "Finalizar avaliação" → POST /submit-for-approval
// =============================================================================

import { useEffect, useState } from 'react'
import { Loader2, CheckCircle2, ChevronLeft, User, Wrench, Camera, FileCheck2, AlertCircle } from 'lucide-react'
import { SECTIONS, ITEM_STATUS, type SectionKey } from '@/lib/evaluation/catalog'
import { numberToBRLMask } from '@/lib/masks'

interface Seller {
  id:       string
  userId:   string
  fullName: string
  shortName?: string | null
  active:   boolean
  unit?: { id: string; name: string } | null
}

interface EvalItem {
  id:         string
  section:    string
  catalogKey: string | null
  name:       string
  status:     string
  priority:   string | null
  notes:      string | null
}
interface EvalService {
  id:            string
  itemId:        string | null
  description:   string
  serviceType:   string
  estimatedCost: string | number | null
  section:       string | null
  notes:         string | null
}
interface EvalAttachment {
  id:        string
  section:   string | null
  category:  string | null
  fileName:  string
  fileType:  string
  publicUrl: string | null
  itemId:    string | null
}
interface EvalData {
  id: string
  plate: string | null
  brand: string | null
  model: string | null
  version: string | null
  manufactureYear: number | null
  modelYear: number | null
  km: number | null
  color: string | null
  chassi: string | null
  renavam: string | null
  status: string
  unitId: string | null
}

interface SummarySectionProps {
  evaluationId: string
  onBack?:      () => void
  onFinalized?: () => void
}

export function SummarySection({ evaluationId, onBack, onFinalized }: SummarySectionProps) {
  const [eval_,    setEval]     = useState<EvalData | null>(null)
  const [items,    setItems]    = useState<EvalItem[]>([])
  const [services, setServices] = useState<EvalService[]>([])
  const [attachs,  setAttachs]  = useState<EvalAttachment[]>([])
  const [sellers,  setSellers]  = useState<Seller[]>([])
  const [sellerId, setSellerId] = useState('')
  const [loading,  setLoading]  = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error,    setError]    = useState('')
  const [ok,       setOk]       = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true); setError('')
      try {
        const r = await fetch(`/api/evaluations/${evaluationId}`, { cache: 'no-store' })
        const d = await r.json()
        if (!r.ok) throw new Error(d?.error ?? 'Falha ao carregar avaliação')
        if (!alive) return
        setEval(d.data)
        setItems(d.data?.items ?? [])
        setServices(d.data?.services ?? [])
        setAttachs(d.data?.attachments ?? [])
        // Carrega vendedores da unidade da avaliação
        const unitId = d.data?.unitId
        if (unitId) {
          const rs = await fetch(`/api/sellers?unitId=${encodeURIComponent(unitId)}`, { cache: 'no-store' })
          const ds = await rs.json()
          if (rs.ok && alive) setSellers((ds.data ?? []).filter((s: Seller) => s.active))
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Erro')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [evaluationId])

  async function finalize() {
    setError(''); setOk('')
    if (!sellerId) {
      setError('Selecione o vendedor responsável antes de finalizar.')
      return
    }
    setSubmitting(true)
    try {
      const r = await fetch(`/api/evaluations/${evaluationId}/submit-for-approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedSellerId: sellerId }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error ?? 'Falha ao finalizar')
      setOk('Avaliação enviada para aprovação. Gerente e vendedor foram notificados.')
      setTimeout(() => onFinalized?.(), 1500)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao finalizar')
    } finally {
      setSubmitting(false)
    }
  }

  const generalServices = services.filter((s) => s.itemId == null)
  const totalServicesCost = generalServices.reduce((sum, s) => sum + (Number(s.estimatedCost) || 0), 0)
  const SECTIONS_TO_COUNT: SectionKey[] = ['INTERIOR', 'FRENTE', 'DIREITA', 'TRASEIRA', 'ESQUERDA', 'TEST_DRIVE']

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando resumo…
      </div>
    )
  }

  const status = eval_?.status ?? 'DRAFT'
  const isFinalized = status === 'AGUARDANDO_APROVACAO' || status === 'APROVADO' || status === 'CONCLUIDA'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <FileCheck2 className="h-5 w-5 text-brand-600" />
        <h3 className="text-lg font-semibold text-gray-900">Resumo da avaliação</h3>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 flex items-start gap-2"><AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />{error}</div>}
      {ok && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 flex items-start gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />{ok}</div>}

      {/* ── Dados do veículo ────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h4 className="text-sm font-semibold text-gray-800 mb-3">Veículo</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          <Fact label="Placa"     value={eval_?.plate ?? '—'} />
          <Fact label="Marca"     value={eval_?.brand ?? '—'} />
          <Fact label="Modelo"    value={[eval_?.model, eval_?.version].filter(Boolean).join(' ') || '—'} />
          <Fact label="Ano Fab/Mod" value={[eval_?.manufactureYear, eval_?.modelYear].filter(Boolean).join(' / ') || '—'} />
          <Fact label="Cor"       value={eval_?.color ?? '—'} />
          <Fact label="KM"        value={eval_?.km ? eval_.km.toLocaleString('pt-BR') : '—'} />
          <Fact label="Chassi"    value={eval_?.chassi ?? '—'} mono />
          <Fact label="Renavam"   value={eval_?.renavam ?? '—'} mono />
        </div>
      </div>

      {/* ── Itens por seção agrupados por status ────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h4 className="text-sm font-semibold text-gray-800 mb-3">Itens avaliados</h4>
        <div className="space-y-2">
          {SECTIONS_TO_COUNT.map((sec) => {
            const secItems = items.filter((it) => it.section === sec)
            if (secItems.length === 0) return null
            const secDef = SECTIONS.find((s) => s.key === sec)
            const byStatus: Record<string, EvalItem[]> = {}
            for (const it of secItems) {
              const k = it.status || 'PENDING'
              if (!byStatus[k]) byStatus[k] = []
              byStatus[k].push(it)
            }
            const photoCount = attachs.filter((a) => a.section === sec && a.fileType === 'image').length
            return (
              <div key={sec} className="rounded-lg border border-gray-100 bg-gray-50/40 px-3 py-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-700">{secDef?.label ?? sec}</span>
                  <span className="text-[10px] text-gray-500 flex items-center gap-1"><Camera className="h-3 w-3" /> {photoCount}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(byStatus).map(([st, list]) => {
                    const s = ITEM_STATUS.find((x) => x.value === st)
                    return (
                      <span key={st} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${s?.color ?? 'bg-gray-100 text-gray-600'}`}>
                        {list.length} {s?.label ?? st}
                      </span>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Serviços com custo ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-3">
          <Wrench className="h-4 w-4 text-brand-600" />
          <h4 className="text-sm font-semibold text-gray-800">Serviços a executar</h4>
        </div>
        {generalServices.length === 0 ? (
          <p className="text-xs text-gray-500">Nenhum serviço marcado. Volte para a aba <em>Serviços</em> se necessário.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {generalServices.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-1.5 text-xs">
                <span className="text-gray-800">{s.description}</span>
                <span className="font-mono font-semibold text-gray-700">R$ {numberToBRLMask(Number(s.estimatedCost) || 0)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          <span className="text-sm font-medium text-gray-800">Total estimado</span>
          <span className="text-lg font-bold text-brand-700">R$ {numberToBRLMask(totalServicesCost)}</span>
        </div>
      </div>

      {/* ── Atribuir ao vendedor + Finalizar ────────────────────────────────── */}
      <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4">
        <div className="flex items-center gap-2 mb-3">
          <User className="h-4 w-4 text-brand-600" />
          <h4 className="text-sm font-semibold text-gray-800">Atribuir ao vendedor</h4>
          <span className="text-red-500 text-xs">*obrigatório</span>
        </div>
        <select
          value={sellerId}
          onChange={(e) => setSellerId(e.target.value)}
          disabled={isFinalized || submitting}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-gray-100"
        >
          <option value="">Selecione o vendedor responsável…</option>
          {sellers.map((s) => (
            <option key={s.id} value={s.userId}>
              {s.fullName}{s.unit ? ` — ${s.unit.name}` : ''}
            </option>
          ))}
        </select>
        {sellers.length === 0 && (
          <p className="mt-2 text-xs text-amber-700">Nenhum vendedor cadastrado nesta unidade. Cadastre em <em>Cadastros → Vendedores</em> antes de finalizar.</p>
        )}
        <p className="mt-2 text-[11px] text-gray-500">O vendedor selecionado receberá notificação para acompanhar a negociação. Gerentes da unidade também são notificados.</p>
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-3">
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
          <ChevronLeft className="h-3.5 w-3.5" /> Seção anterior
        </button>
        <button
          type="button"
          onClick={finalize}
          disabled={isFinalized || submitting || !sellerId || sellers.length === 0}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {isFinalized ? 'Avaliação já finalizada' : 'Finalizar avaliação'}
        </button>
      </div>
    </div>
  )
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-gray-500 font-medium tracking-wide">{label}</p>
      <p className={`text-sm text-gray-900 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}
