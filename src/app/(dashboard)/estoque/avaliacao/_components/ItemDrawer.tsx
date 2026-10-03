'use client'

// =============================================================================
// ItemDrawer — avaliação rápida de um item (capô, porta, banco…):
//   1. Foto do item (obrigatória, exceto "Não se aplica"); mais fotos opcionais.
//   2. Resultado: Sem avaria · Precisa de reparo · Não se aplica.
//   3. Reparo: lista da tabela da loja (Configurações de avaliação) com valor
//      fixo — o avaliador não digita valor.
// Grava em POST /api/evaluations/[id]/items/[itemId]/assess (valor vem do
// servidor). Fotos: POST /api/evaluations/[id]/attachments (comprimidas antes).
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { X, Save, Loader2, Camera, ImagePlus, Trash2, Check } from 'lucide-react'
import { ITEMS, POSITION_LABELS, parseAppliesTo, stripAppliesTo, type SectionKey, type PositionGroup } from '@/lib/evaluation/catalog'
import { repairsForSection, repairTotal, type RepairOption } from '@/lib/evaluation/repair-prices-core'
import { compressImage, uploadErrorMessage } from '@/lib/images/compress-client'
import { RequiredMark } from '@/components/ui/field'
import { PhotoLightbox } from './PhotoLightbox'

export interface DrawerItem {
  id:           string
  evaluationId: string
  name:         string
  section:      string
  status:       string
  priority:     string | null
  notes:        string | null
  catalogKey:   string | null
  /** Reparo da tabela já escolhido (serviço previsto do item). */
  repairKey?:   string | null
}

export interface DrawerPhoto {
  id:        string
  fileName:  string
  publicUrl: string | null
}

interface ItemDrawerProps {
  item:             DrawerItem
  evaluationStatus: string
  isReopen:         boolean
  readOnly?:        boolean
  photoRequired?:   boolean
  existingPhotos?:  DrawerPhoto[]
  onSave:           () => void
  /** `dirty` = houve upload/remoção de foto — o pai precisa recarregar. */
  onClose:          (dirty: boolean) => void
}

type Result = 'OK' | 'REPARO' | 'NA' | ''
const RESULT_OF: Record<string, Result> = { CONFORME: 'OK', REPARO: 'REPARO', OBRIGATORIO: 'REPARO', ATENCAO: 'REPARO', NA: 'NA' }
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

// Tabela de reparos da loja: carrega uma vez por página.
let repairsCache: Promise<RepairOption[]> | null = null
function fetchRepairs(): Promise<RepairOption[]> {
  repairsCache ??= fetch('/api/evaluations/repair-prices', { cache: 'no-store' })
    .then((r) => r.json()).then((j) => (j?.data?.repairs ?? []) as RepairOption[])
    .catch(() => { repairsCache = null; return [] })
  return repairsCache
}

export function ItemDrawer({ item, isReopen, readOnly, existingPhotos = [], onSave, onClose }: ItemDrawerProps) {
  const positionGroup: PositionGroup | null = (() => {
    if (!item.catalogKey) return null
    const sectionKey = item.catalogKey.split('.')[0]?.toUpperCase() as SectionKey | undefined
    return (sectionKey && ITEMS[sectionKey]?.find((c) => c.key === item.catalogKey)?.positionGroup) || null
  })()
  const positions = positionGroup ? POSITION_LABELS[positionGroup] : []

  const [result,    setResult]    = useState<Result>(RESULT_OF[item.status] ?? '')
  const [repairKey, setRepairKey] = useState(item.repairKey ?? '')
  const [notes,     setNotes]     = useState(stripAppliesTo(item.notes))
  const [showNotes, setShowNotes] = useState(!!stripAppliesTo(item.notes))
  const [appliesTo, setAppliesTo] = useState<string[]>(parseAppliesTo(item.notes))
  const [photos,    setPhotos]    = useState<DrawerPhoto[]>(existingPhotos)
  const [repairs,   setRepairs]   = useState<RepairOption[] | null>(null)
  const [busy,      setBusy]      = useState<'' | 'photo' | 'save'>('')
  const [err,       setErr]       = useState('')
  const [dirty,     setDirty]     = useState(false)
  const [viewIdx,   setViewIdx]   = useState<number | null>(null)
  const cameraRef  = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  useEffect(() => { void fetchRepairs().then(setRepairs) }, [])
  const options = repairs ? repairsForSection(repairs, item.section) : []
  const chosen = options.find((o) => o.key === repairKey) ?? null
  const total = chosen ? repairTotal(chosen.price, 1 + appliesTo.length) : 0
  const needsPhoto = result !== 'NA'

  async function upload(files: FileList | null) {
    if (!files?.length || readOnly) return
    setBusy('photo'); setErr('')
    try {
      for (const f of Array.from(files)) {
        const fd = new FormData()
        fd.append('file', await compressImage(f))
        fd.append('itemId', item.id)
        fd.append('category', 'FOTO')
        const r = await fetch(`/api/evaluations/${item.evaluationId}/attachments`, { method: 'POST', body: fd })
        if (!r.ok) { setErr(await uploadErrorMessage(r)); break }
        const att = (await r.json().catch(() => null))?.data
        if (att?.id) { setPhotos((p) => [...p, { id: att.id, fileName: att.fileName, publicUrl: att.publicUrl }]); setDirty(true) }
      }
    } catch {
      setErr('Sem conexão. Tente novamente.')
    } finally {
      setBusy('')
      if (cameraRef.current) cameraRef.current.value = ''
      if (galleryRef.current) galleryRef.current.value = ''
    }
  }

  async function removePhoto(id: string) {
    if (readOnly || !confirm('Remover esta foto?')) return
    const r = await fetch(`/api/evaluations/${item.evaluationId}/attachments/${id}`, { method: 'DELETE' }).catch(() => null)
    if (r?.ok) { setPhotos((p) => p.filter((x) => x.id !== id)); setDirty(true) } else setErr('Não foi possível remover a foto.')
  }

  async function save() {
    if (readOnly) { onClose(dirty); return }
    if (!result) { setErr('Escolha o resultado.'); return }
    if (needsPhoto && photos.length === 0) { setErr('Tire a foto do item.'); return }
    if (result === 'REPARO' && !chosen) { setErr('Escolha o reparo.'); return }
    setBusy('save'); setErr('')
    const r = await fetch(`/api/evaluations/${item.evaluationId}/items/${item.id}/assess`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result, repairKey: result === 'REPARO' ? repairKey : null, notes, appliesTo: result === 'NA' ? [] : appliesTo }),
    }).catch(() => null)
    setBusy('')
    if (!r?.ok) { setErr(r ? (await r.json().catch(() => null))?.error ?? 'Não foi possível salvar.' : 'Sem conexão. Tente novamente.'); return }
    onSave()
  }

  const resultBtn = (value: Exclude<Result, ''>, label: string, tone: string) => (
    <button
      type="button" disabled={readOnly}
      onClick={() => { setResult(value); setErr('') }}
      className={`flex-1 rounded-xl border-2 px-2 py-3 text-sm font-semibold transition-colors ${result === value ? tone : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
    >{label}</button>
  )

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] flex-col bg-white shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-3.5">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-brand-700">{isReopen ? 'Reavaliar' : 'Avaliar'}</p>
            <h3 className="truncate text-base font-semibold text-gray-900">{item.name}</h3>
          </div>
          <button type="button" onClick={() => onClose(dirty)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* 1. Foto */}
          <section>
            <p className="mb-2 text-xs font-semibold text-gray-700">Foto do item {needsPhoto && <RequiredMark />}</p>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void upload(e.target.files)} />
            <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void upload(e.target.files)} />
            <div className="grid grid-cols-3 gap-2">
              {photos.map((p, idx) => (
                <div key={p.id} className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                  {p.publicUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={p.publicUrl} alt={p.fileName} className="h-full w-full cursor-zoom-in object-cover" onClick={() => setViewIdx(idx)} />
                    : <div className="flex h-full items-center justify-center text-[10px] text-gray-400">{p.fileName}</div>}
                  {!readOnly && <button type="button" onClick={() => void removePhoto(p.id)} className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-error" aria-label="Remover foto"><Trash2 className="h-3 w-3" /></button>}
                </div>
              ))}
              {!readOnly && (
                <button
                  type="button" onClick={() => cameraRef.current?.click()} disabled={busy === 'photo'}
                  className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-xs font-medium ${photos.length ? 'border-gray-300 text-gray-500' : 'border-brand-400 bg-brand-50 text-brand-700'}`}
                >
                  {busy === 'photo' ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
                  {busy === 'photo' ? 'Enviando…' : photos.length ? 'Mais fotos' : 'Tirar foto'}
                </button>
              )}
            </div>
            {!readOnly && (
              <button type="button" onClick={() => galleryRef.current?.click()} disabled={busy === 'photo'} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-brand-700">
                <ImagePlus className="h-3.5 w-3.5" /> Da galeria
              </button>
            )}
          </section>

          {/* 2. Resultado */}
          <section>
            <p className="mb-2 text-xs font-semibold text-gray-700">Resultado <RequiredMark /></p>
            <div className="flex gap-2">
              {resultBtn('OK', 'Sem avaria', 'border-emerald-500 bg-emerald-50 text-emerald-800')}
              {resultBtn('REPARO', 'Reparo', 'border-amber-500 bg-amber-50 text-amber-800')}
              {resultBtn('NA', 'Não se aplica', 'border-gray-500 bg-gray-100 text-gray-800')}
            </div>
          </section>

          {/* 3. Reparo (tabela da loja) */}
          {result === 'REPARO' && (
            <section className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-gray-700">Reparo <RequiredMark /></span>
                <select className={inputCls} value={repairKey} onChange={(e) => { setRepairKey(e.target.value); setErr('') }} disabled={readOnly || !repairs}>
                  <option value="">{repairs ? 'Selecione' : 'Carregando…'}</option>
                  {options.map((o) => <option key={o.key} value={o.key}>{o.label} — {brl(o.price)}</option>)}
                </select>
              </label>
              {positions.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-gray-600">Também em</p>
                  <div className="flex flex-wrap gap-1.5">
                    {positions.map((p) => {
                      const on = appliesTo.includes(p.key)
                      return (
                        <button key={p.key} type="button" disabled={readOnly}
                          onClick={() => setAppliesTo((xs) => (on ? xs.filter((k) => k !== p.key) : [...xs, p.key]))}
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-300 text-gray-700'}`}
                        >{on && <Check className="h-3 w-3" />}{p.label}</button>
                      )
                    })}
                  </div>
                </div>
              )}
              {chosen && (
                <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5">
                  <span className="text-xs text-gray-600">Valor do reparo{appliesTo.length ? ` (${1 + appliesTo.length}×)` : ''}</span>
                  <span className="text-base font-bold tabular-nums text-gray-900">{brl(total)}</span>
                </div>
              )}
            </section>
          )}

          {showNotes || readOnly ? (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">Observação</span>
              <textarea rows={2} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={readOnly} />
            </label>
          ) : (
            <button type="button" onClick={() => setShowNotes(true)} className="text-xs font-medium text-gray-500 hover:text-brand-700">+ Observação</button>
          )}

          {err && <p role="alert" className="text-sm font-medium text-error">{err}</p>}
        </div>

        <footer className="border-t border-gray-100 px-5 py-3">
          {readOnly ? (
            <button type="button" onClick={() => onClose(dirty)} className="w-full rounded-lg border border-gray-300 py-2.5 text-sm text-gray-700">Fechar</button>
          ) : (
            <button type="button" onClick={() => void save()} disabled={busy !== ''} className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
              {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar
            </button>
          )}
        </footer>
      </aside>
      {viewIdx != null && <PhotoLightbox photos={photos} startIndex={viewIdx} title={item.name} onClose={() => setViewIdx(null)} />}
    </>
  )
}
