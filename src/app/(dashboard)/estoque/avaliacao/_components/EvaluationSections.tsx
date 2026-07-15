'use client'

// =============================================================================
// EvaluationSections — exibe abas de seções (Interior, Frente, Direita, Traseira,
// Esquerda, Test-drive). Para cada seção:
//   • Renderiza um widget "Foto geral da seção" no TOPO (obrigatório p/ enviar).
//     Aceita upload por arquivo OU câmera (input capture="environment").
//   • Lista itens com status + ação de avaliar/editar/reavaliar, abrindo ItemDrawer.
// Auto-seeda os itens canônicos via POST /api/evaluations/[id]/items/seed se
// vazio.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, ChevronRight, ChevronLeft, Camera, Upload, Trash2, ImageIcon, CheckCircle2 } from 'lucide-react'
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

interface EvalAttachment {
  id:        string
  section:   string | null
  category:  string | null
  fileName:  string
  fileType:  string
  publicUrl: string | null
  itemId:    string | null
}

interface EvaluationSectionsProps {
  evaluationId:       string
  evaluationStatus:   string
  /** reopenCount > 0 → label do botão muda para "Reavaliar". */
  reopenCount?:       number
  readOnly?:          boolean
  /** Opcionais marcados no Step Veículo — usados para exigir foto de itens
   *  com `requiredPhoto: 'IF_EQUIPPED'` (ex: teto solar). */
  opcionais?:         string[]
  /** Callback opcional ao clicar "Anterior seção" estando na 1ª aba — leva ao step anterior do wizard. */
  onBack?:            () => void
  /** Callback opcional ao clicar "Concluir avaliação" estando na última aba — avança o wizard. */
  onComplete?:        () => void
}

const TABS: SectionKey[] = ['INTERIOR', 'FRENTE', 'DIREITA', 'TRASEIRA', 'ESQUERDA', 'TEST_DRIVE']

/**
 * Remove itens duplicados da lista. Critério:
 *   - Se tem catalogKey: dedup por (section, catalogKey) — mantém o 1º
 *   - Se não tem catalogKey: dedup por (section, name normalizado)
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

// ── Widget de foto geral da seção (obrigatório) ──────────────────────────────

function SectionPhotoWidget({
  evaluationId, section, photos, readOnly, onChanged,
}: {
  evaluationId: string
  section:      SectionKey
  photos:       EvalAttachment[]
  readOnly?:    boolean
  onChanged:    () => void
}) {
  const fileRef   = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err,  setErr]  = useState('')

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return
    setBusy(true); setErr('')
    try {
      for (let i = 0; i < files.length; i++) {
        const f  = files[i]
        const fd = new FormData()
        fd.append('file', f)
        fd.append('section',  section)
        fd.append('category', 'FOTO_SECAO')
        const r = await fetch(`/api/evaluations/${evaluationId}/attachments`, { method: 'POST', body: fd })
        if (!r.ok) {
          const d = await r.json().catch(() => ({}))
          setErr(d?.error ?? 'Falha ao enviar foto.')
          break
        }
      }
      onChanged()
    } catch {
      setErr('Erro de conexão ao enviar foto.')
    } finally {
      setBusy(false)
      if (fileRef.current)   fileRef.current.value   = ''
      if (cameraRef.current) cameraRef.current.value = ''
    }
  }

  async function remove(id: string) {
    if (!confirm('Remover esta foto?')) return
    try {
      const r = await fetch(`/api/evaluations/${evaluationId}/attachments/${id}`, { method: 'DELETE' })
      if (r.ok) onChanged()
    } catch { /* silent */ }
  }

  const hasPhotos = photos.length > 0

  return (
    <div className={[
      'rounded-xl border p-3 sm:p-4',
      hasPhotos ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-300 bg-amber-50',
    ].join(' ')}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
            <ImageIcon className="h-4 w-4" /> Foto geral da seção
            <span className="text-red-500">*</span>
          </p>
          <p className="text-[11px] text-gray-500">
            {hasPhotos
              ? `${photos.length} foto(s) enviada(s)`
              : 'Mínimo 1 foto obrigatória antes de enviar para aprovação.'}
          </p>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-1.5">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
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
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={busy}
              className="flex items-center gap-1 rounded-lg border border-brand-400 bg-white px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />} Câmera
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              <Upload className="h-3 w-3" /> Enviar arquivo
            </button>
          </div>
        )}
      </div>

      {err && <p className="text-xs text-red-600 mb-2">{err}</p>}

      {hasPhotos && (
        <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {photos.map((a) => (
            <li key={a.id} className="group relative aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-100">
              {a.publicUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.publicUrl} alt={a.fileName} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-gray-400 text-[10px]">{a.fileName}</div>
              )}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  className="absolute top-1 right-1 rounded-full bg-white/90 p-1 text-red-600 opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function EvaluationSections({
  evaluationId, evaluationStatus, reopenCount = 0, readOnly, opcionais = [], onBack, onComplete,
}: EvaluationSectionsProps) {
  const [tab,         setTab]         = useState<SectionKey>('INTERIOR')
  const [items,       setItems]       = useState<EvalItem[]>([])
  const [attachments, setAttachments] = useState<EvalAttachment[]>([])
  const [loading,     setLoading]     = useState(true)
  const [drawer,      setDrawer]      = useState<DrawerItem | null>(null)
  const [err,         setErr]         = useState('')
  // Lock client-side: evita 2x POST /seed disparado pelo React Strict Mode
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
      const incAttachments: EvalAttachment[] = Array.isArray(d?.data?.attachments) ? d.data.attachments : []
      setAttachments(incAttachments)

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
          const seededAtts = Array.isArray(d2?.data?.attachments) ? d2.data.attachments : []
          setAttachments(seededAtts)
        } finally {
          seedInFlight.current = false
        }
      } else {
        setItems(dedupeItems(incoming))
      }
    } catch {
      setErr('Erro de conexão.')
    } finally {
      setLoading(false)
    }
  }, [evaluationId, readOnly])

  useEffect(() => { void load() }, [load])
  // evaluationStatus não usado por enquanto (mantido na assinatura para
  // compatibilidade com o InspecaoPage que passa o status). Suprime warning.
  void evaluationStatus

  const currentItems = items.filter((i) => i.section === tab)
  // Fotos da seção atual: pega tudo que é image E section=tab (qualquer category,
  // mas prioritariamente FOTO_SECAO). Fotos de item ficam dentro do item.
  const sectionPhotos = attachments.filter((a) =>
    a.section === tab &&
    a.fileType === 'image' &&
    !a.itemId,
  )
  const catalog = ITEMS[tab] ?? []

  function buttonLabel(status: string): string {
    if (reopenCount > 0) return 'Reavaliar'
    if (!status || status === 'PENDING' || status === 'NAO_AVALIADO') return 'Avaliar item'
    return 'Editar item'
  }

  /**
   * Retorna itens da seção com foto obrigatória PENDENTE. Considera:
   *   • requiredPhoto === true            → sempre exige foto
   *   • requiredPhoto === 'IF_EQUIPPED'   → só exige se o opcional
   *                                          `requiredPhotoIfOptional`
   *                                          estiver marcado no formulário
   * Uma foto conta quando existe EvaluationAttachment com itemId igual ao
   * do EvaluationItem correspondente e fileType='image'.
   */
  function missingRequiredPhotos(section: SectionKey): Array<{ key: string; name: string }> {
    const catalogForSection = ITEMS[section] ?? []
    const missing: Array<{ key: string; name: string }> = []
    for (const catItem of catalogForSection) {
      if (!catItem.requiredPhoto) continue
      // Condicional: só exige quando o opcional correspondente está marcado
      if (catItem.requiredPhoto === 'IF_EQUIPPED') {
        const target = (catItem.requiredPhotoIfOptional ?? '').trim().toLowerCase()
        if (!target) continue
        const isEquipped = opcionais.some((o) => (o ?? '').trim().toLowerCase() === target)
        if (!isEquipped) continue
      }
      // Encontra o EvaluationItem correspondente (seed cria com catalogKey)
      const item = items.find((it) => it.catalogKey === catItem.key && it.section === section)
      if (!item) {
        // Item ainda não seedado — considera pendente (usuário precisa recarregar)
        missing.push({ key: catItem.key, name: catItem.name })
        continue
      }
      const hasPhoto = attachments.some((a) => a.itemId === item.id && a.fileType === 'image')
      if (!hasPhoto) missing.push({ key: catItem.key, name: catItem.name })
    }
    return missing
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Tabs */}
      <div className="flex flex-wrap gap-1 overflow-x-auto border-b border-gray-200">
        {TABS.map((t) => {
          const def = SECTIONS.find((s) => s.key === t)!
          const count = items.filter((i) => i.section === t).length
          const done  = items.filter((i) => i.section === t && i.status && i.status !== 'PENDING').length
          const photoCount = attachments.filter((a) => a.section === t && a.fileType === 'image' && !a.itemId).length
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
              <span className={[
                'ml-1.5 inline-flex items-center gap-0.5 rounded-full px-1.5 text-[9px] font-bold',
                photoCount > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700',
              ].join(' ')}>
                <Camera className="h-2.5 w-2.5" />{photoCount}
              </span>
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
        <>
          {/* Foto geral da seção (obrigatória) */}
          <SectionPhotoWidget
            evaluationId={evaluationId}
            section={tab}
            photos={sectionPhotos}
            readOnly={readOnly}
            onChanged={load}
          />

          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(currentItems.length > 0 ? currentItems : catalog.map((c, i) => ({
              id: `__ph_${i}`, section: tab, catalogKey: c.key, name: c.name, status: 'PENDING', priority: null, notes: null,
            } as EvalItem))).map((it) => {
              const isPlaceholder = it.id.startsWith('__ph_')
              const itemPhotoCount = attachments.filter((a) => a.itemId === it.id && a.fileType === 'image').length
              return (
                <li key={it.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{it.name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      {statusBadge(it.status || 'PENDING')}
                      {itemPhotoCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500">
                          <Camera className="h-2.5 w-2.5" /> {itemPhotoCount}
                        </span>
                      )}
                    </div>
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

          {/* ── Validação de fotos obrigatórias na seção atual ────────────── */}
          {(() => {
            const missing = missingRequiredPhotos(tab)
            if (missing.length === 0) return null
            return (
              <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                <strong>Foto obrigatória pendente:</strong>{' '}
                {missing.map((m) => m.name).join(', ')}. Clique no item para anexar antes de avançar.
              </div>
            )
          })()}

          {/* ── Navegação entre seções ───────────────────────────────────── */}
          {(onBack || onComplete) && (
            <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-3">
              <button
                type="button"
                onClick={() => {
                  const idx = TABS.indexOf(tab)
                  if (idx > 0) setTab(TABS[idx - 1])
                  else onBack?.()
                }}
                className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                {TABS.indexOf(tab) > 0 ? `Seção anterior (${SECTIONS.find((s) => s.key === TABS[TABS.indexOf(tab) - 1])?.label})` : 'Voltar ao veículo'}
              </button>

              {TABS.indexOf(tab) < TABS.length - 1 ? (
                <button
                  type="button"
                  disabled={missingRequiredPhotos(tab).length > 0}
                  onClick={() => setTab(TABS[TABS.indexOf(tab) + 1])}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Próxima seção ({SECTIONS.find((s) => s.key === TABS[TABS.indexOf(tab) + 1])?.label})
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={missingRequiredPhotos(tab).length > 0}
                  onClick={() => onComplete?.()}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Concluir avaliação — ir para Cautelar
                </button>
              )}
            </div>
          )}
        </>
      )}

      {drawer && (
        <ItemDrawer
          item={drawer}
          evaluationStatus={evaluationStatus}
          isReopen={reopenCount > 0}
          readOnly={readOnly}
          existingPhotos={attachments.filter((a) => a.itemId === drawer.id && a.fileType === 'image')}
          onClose={() => setDrawer(null)}
          onSave={() => { setDrawer(null); void load() }}
        />
      )}
    </div>
  )
}
