'use client'

// =============================================================================
// ServicesSection — aba SERVIÇOS da avaliação. Lista os serviços disponíveis
// (via /api/evaluations/service-catalog), permite marcar/desmarcar cada um e
// informar o custo estimado. Salva como EvaluationService (itemId=null).
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Wrench, ChevronLeft, ChevronRight, CheckCircle2, Trash2 } from 'lucide-react'
import { maskBRL, parseBRL, numberToBRLMask } from '@/lib/masks'

interface ServiceCatalogItem {
  key:            string
  label:          string
  hint?:          string
  serviceType:    string
  suggestedCost?: number
  askCost:        boolean
  active:         boolean
  isBuiltIn:      boolean
  order:          number
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

interface ServicesSectionProps {
  evaluationId: string
  readOnly?:    boolean
  onBack?:      () => void
  onComplete?:  () => void
}

// Marcador para identificar serviços criados a partir do catálogo (sobreviver
// a reloads). Persistido em notes com prefixo `[CATALOG_KEY] svc.xxx`.
const CATALOG_KEY_RE = /^\s*\[CATALOG_KEY\]\s*(\S+)\s*\r?\n?/m
const stripCatalogKey = (n: string | null): string => (n ?? '').replace(CATALOG_KEY_RE, '').trim()
const parseCatalogKey = (n: string | null): string | null => {
  if (!n) return null
  const m = CATALOG_KEY_RE.exec(n)
  return m ? m[1] : null
}
const withCatalogKey = (key: string, extra: string): string => {
  const clean = stripCatalogKey(extra)
  const line = `[CATALOG_KEY] ${key}`
  return clean ? `${line}\n${clean}` : line
}

export function ServicesSection({ evaluationId, readOnly, onBack, onComplete }: ServicesSectionProps) {
  const [catalog,  setCatalog]  = useState<ServiceCatalogItem[]>([])
  const [services, setServices] = useState<EvalService[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState<string | null>(null)  // key sendo salvo
  const [error,    setError]    = useState('')
  // Custos em edição (por catalog.key) — permite editar antes de salvar
  const [drafts,   setDrafts]   = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [rc, re] = await Promise.all([
        fetch('/api/evaluations/service-catalog', { cache: 'no-store' }),
        fetch(`/api/evaluations/${evaluationId}`, { cache: 'no-store' }),
      ])
      const dc = await rc.json()
      const de = await re.json()
      if (!rc.ok) throw new Error(dc?.error ?? 'Falha ao carregar catálogo')
      if (!re.ok) throw new Error(de?.error ?? 'Falha ao carregar avaliação')
      setCatalog(dc.data ?? [])
      const evalServices: EvalService[] = (de?.data?.services ?? []).filter((s: EvalService) => s.itemId == null)
      setServices(evalServices)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar')
    } finally {
      setLoading(false)
    }
  }, [evaluationId])

  useEffect(() => { void load() }, [load])

  /** Serviço já existente na avaliação para um item do catálogo. */
  const findServiceFor = (catKey: string): EvalService | undefined =>
    services.find((s) => parseCatalogKey(s.notes) === catKey)

  const isMarked = (catKey: string): boolean => !!findServiceFor(catKey)

  async function toggle(cat: ServiceCatalogItem, checked: boolean) {
    if (readOnly) return
    setError('')
    const existing = findServiceFor(cat.key)

    // Desmarcar → deleta o serviço
    if (!checked) {
      if (!existing) return
      setSaving(cat.key)
      try {
        const r = await fetch(`/api/evaluations/${evaluationId}/services/${existing.id}`, { method: 'DELETE' })
        if (!r.ok) throw new Error('Falha ao remover serviço')
        setServices((prev) => prev.filter((s) => s.id !== existing.id))
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro')
      } finally {
        setSaving(null)
      }
      return
    }

    // Marcar → cria novo serviço com o custo (draft ou sugerido)
    if (existing) return  // já marcado
    setSaving(cat.key)
    try {
      const costStr = drafts[cat.key] ?? (cat.suggestedCost ? numberToBRLMask(cat.suggestedCost) : '')
      const cost = parseBRL(costStr) ?? cat.suggestedCost ?? 0
      const r = await fetch(`/api/evaluations/${evaluationId}/services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description:   cat.label,
          serviceType:   cat.serviceType,
          estimatedCost: cost,
          priority:      null,
          notes:         withCatalogKey(cat.key, ''),
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d?.error ?? 'Falha ao adicionar serviço')
      setServices((prev) => [...prev, d.data])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro')
    } finally {
      setSaving(null)
    }
  }

  async function updateCost(cat: ServiceCatalogItem, newCostStr: string) {
    setDrafts((prev) => ({ ...prev, [cat.key]: newCostStr }))
    const existing = findServiceFor(cat.key)
    if (!existing) return
    // Atualiza custo do serviço existente
    const cost = parseBRL(newCostStr) ?? 0
    try {
      await fetch(`/api/evaluations/${evaluationId}/services/${existing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estimatedCost: cost }),
      })
      setServices((prev) => prev.map((s) => s.id === existing.id ? { ...s, estimatedCost: cost } : s))
    } catch { /* silent — próxima carga sincroniza */ }
  }

  const total = services.reduce((sum, s) => sum + (Number(s.estimatedCost) || 0), 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Wrench className="h-5 w-5 text-brand-600" />
        <h3 className="text-lg font-semibold text-gray-900">Serviços a executar</h3>
      </div>
      <p className="text-xs text-gray-500">
        Marque os serviços necessários. O custo estimado entra na conta total da avaliação.
      </p>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-10 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando catálogo…
        </div>
      ) : catalog.length === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Nenhum serviço configurado. Peça ao MASTER da loja para configurar em <code>/master/evaluation-services</code>.
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {catalog.map((cat) => {
            const marked = isMarked(cat.key)
            const existing = findServiceFor(cat.key)
            const currentCost = existing?.estimatedCost != null ? numberToBRLMask(Number(existing.estimatedCost)) : (drafts[cat.key] ?? (cat.suggestedCost ? numberToBRLMask(cat.suggestedCost) : ''))
            return (
              <li key={cat.key} className={`flex items-center gap-3 px-3 py-2.5 ${marked ? 'bg-brand-50/40' : ''}`}>
                <input
                  type="checkbox"
                  checked={marked}
                  onChange={(e) => toggle(cat, e.target.checked)}
                  disabled={readOnly || saving === cat.key}
                  className="h-4 w-4 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{cat.label}</p>
                  {cat.hint && <p className="text-[11px] text-gray-500">{cat.hint}</p>}
                </div>
                {cat.askCost && (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500">R$</span>
                    <input
                      type="text"
                      value={currentCost}
                      onChange={(e) => updateCost(cat, maskBRL(e.target.value))}
                      disabled={readOnly || !marked}
                      placeholder={cat.suggestedCost ? String(cat.suggestedCost) : '0,00'}
                      className="w-24 rounded border border-gray-300 px-2 py-1 text-right text-sm disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  </div>
                )}
                {saving === cat.key && <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-500" />}
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5">
        <span className="text-sm font-medium text-brand-800">Total estimado de gastos</span>
        <span className="text-lg font-bold text-brand-800">R$ {numberToBRLMask(total)}</span>
      </div>

      {(onBack || onComplete) && (
        <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-3">
          <button type="button" onClick={() => onBack?.()} className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
            <ChevronLeft className="h-3.5 w-3.5" /> Seção anterior
          </button>
          <button type="button" onClick={() => onComplete?.()} className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-700">
            Próxima seção (Resumo) <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
