'use client'

// =============================================================================
// EvaluationSections — exibe abas de seções (Interior, Frente, Direita, Traseira,
// Esquerda, Test-drive). Para cada seção lista itens com status + ação de
// avaliar/editar/reavaliar, abrindo ItemDrawer.
// Auto-seeda os itens canônicos via POST /api/evaluations/[id]/items/seed se
// vazio.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, ChevronRight } from 'lucide-react'
import { ITEMS, SECTIONS, ITEM_STATUS, type SectionKey } from '@/lib/evaluation/catalog'
import { ItemDrawer, type DrawerItem } from './ItemDrawer'

interface EvalItem {
  id:         string
  section:    string
  catalogKey: string | null
  name:       string
  status:     string
  priority:   string | null
  notes:      string | null
}

interface EvaluationSectionsProps {
  evaluationId:       string
  evaluationStatus:   string
  /** reopenCount > 0 → label do botão muda para "Reavaliar". */
  reopenCount?:       number
  readOnly?:          boolean
}

const TABS: SectionKey[] = ['INTERIOR', 'FRENTE', 'DIREITA', 'TRASEIRA', 'ESQUERDA', 'TEST_DRIVE']

/**
 * Remove itens duplicados da lista. Critério:
 *   - Se tem catalogKey: dedup por (section, catalogKey) — mantém o 1º
 *   - Se não tem catalogKey: dedup por (section, name normalizado)
 *
 * Defende contra duas fontes históricas de duplicata:
 *   1) Race condition no seed (React Strict Mode + dev) que rodava 2x
 *   2) Seeds antigos que rodaram antes do guard de catalogKey
 */
function dedupeItems(items: EvalItem[]): EvalItem[] {
  const seen = new Set<string>()
  const out: EvalItem[] = []
  for (const it of items) {
    const key = it.catalogKey
      ? `${it.section}::${it.catalogKey}`
      : `${it.section}::name::${it.name.trim().toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(it)
  }
  return out
}

function statusBadge(status: string) {
  const s = ITEM_STATUS.find((x) => x.value === status)
  if (!s) return <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">—</span>
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${s.color}`}>{s.label}</span>
}

export function EvaluationSections({
  evaluationId, evaluationStatus, reopenCount = 0, readOnly,
}: EvaluationSectionsProps) {
  const [tab,     setTab]     = useState<SectionKey>('INTERIOR')
  const [items,   setItems]   = useState<EvalItem[]>([])
  const [loading, setLoading] = useState(true)
  const [drawer,  setDrawer]  = useState<DrawerItem | null>(null)
  const [err,     setErr]     = useState('')
  // Lock client-side: evita 2x POST /seed disparado pelo React Strict Mode
  // (que monta useEffect duas vezes em dev). Sem o lock, a 2ª chamada
  // criava registros duplicados.
  const seedInFlight = useRef(false)
  const seedDone     = useRef<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const r = await fetch(`/api/evaluations/${evaluationId}`, { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) {
        setErr(d?.error ?? 'Falha ao carregar avaliação.')
        setItems([])
        return
      }
      const incoming: EvalItem[] = Array.isArray(d?.data?.items) ? d.data.items : []

      // Se não há itens ainda e podemos editar — chama seed UMA vez só
      const shouldSeed =
        incoming.length === 0 &&
        !readOnly &&
        !seedInFlight.current &&
        seedDone.current !== evaluationId

      if (shouldSeed) {
        seedInFlight.current = true
        try {
          await fetch(`/api/evaluations/${evaluationId}/items/seed`, { method: 'POST' })
          seedDone.current = evaluationId
          const r2 = await fetch(`/api/evaluations/${evaluationId}`, { cache: 'no-store' })
          const d2 = await r2.json()
          const seeded = Array.isArray(d2?.data?.items) ? d2.data.items : []
          setItems(dedupeItems(seeded))
        } finally {
          seedInFlight.current = false
        }
      } else {
        // Dedup defensivo: mesmo que o backend traga duplicatas legadas, o
        // render fica limpo. Mantém o primeiro registro de cada catalogKey
        // (ou de cada name dentro da mesma section quando catalogKey é null).
        setItems(dedupeItems(incoming))
      }
    } catch {
      setErr('Erro de conexão.')
    } finally {
      setLoading(false)
    }
  }, [evaluationId, readOnly])

  useEffect(() => { void load() }, [load])

  const currentItems = items.filter((i) => i.section === tab)
  const catalog = ITEMS[tab] ?? []

  function buttonLabel(status: string): string {
    if (reopenCount > 0) return 'Reavaliar'
    if (!status || status === 'PENDING' || status === 'NAO_AVALIADO') return 'Avaliar item'
    return 'Editar item'
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Tabs */}
      <div className="flex flex-wrap gap-1 overflow-x-auto border-b border-gray-200">
        {TABS.map((t) => {
          const def = SECTIONS.find((s) => s.key === t)!
          const count = items.filter((i) => i.section === t).length
          const done  = items.filter((i) => i.section === t && i.status && i.status !== 'PENDING').length
          const active = tab === t
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={[
                'whitespace-nowrap rounded-t-md px-3 py-2 text-xs font-medium border-b-2 transition-colors',
                active
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800',
              ].join(' ')}
            >
              {def.label}
              {count > 0 && (
                <span className="ml-1.5 text-[10px] text-gray-400">({done}/{count})</span>
              )}
            </button>
          )
        })}
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(currentItems.length > 0 ? currentItems : catalog.map((c, i) => ({
            id: `__ph_${i}`, section: tab, catalogKey: c.key, name: c.name, status: 'PENDING', priority: null, notes: null,
          } as EvalItem))).map((it) => {
            const isPlaceholder = it.id.startsWith('__ph_')
            return (
              <li key={it.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{it.name}</p>
                  <div className="mt-1">{statusBadge(it.status || 'PENDING')}</div>
                </div>
                <button
                  type="button"
                  disabled={isPlaceholder || readOnly}
                  onClick={() => setDrawer({
                    id: it.id, evaluationId, name: it.name, status: it.status,
                    priority: it.priority, notes: it.notes,
                  })}
                  className="inline-flex items-center gap-1 rounded-lg border border-brand-300 bg-white px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={isPlaceholder ? 'Itens ainda não inicializados. Salve a avaliação antes.' : ''}
                >
                  {buttonLabel(it.status)}
                  <ChevronRight className="h-3 w-3" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {drawer && (
        <ItemDrawer
          item={drawer}
          evaluationStatus={evaluationStatus}
          isReopen={reopenCount > 0}
          readOnly={readOnly}
          onClose={() => setDrawer(null)}
          onSave={() => { setDrawer(null); void load() }}
        />
      )}
    </div>
  )
}
