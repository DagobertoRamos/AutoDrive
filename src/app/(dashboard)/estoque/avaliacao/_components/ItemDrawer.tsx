'use client'

// =============================================================================
// ItemDrawer — Drawer lateral para Avaliar / Editar / Reavaliar um item.
//
// Persiste via PATCH /api/evaluations/[id]/items/[itemId] (status, priority,
// notes) e, se houver custo/tipo de serviço, cria/ATUALIZA (não duplica) um
// EvaluationService vinculado via POST /api/evaluations/[id]/services.
// Fotos do item: upload real via POST /api/evaluations/[id]/attachments com
// itemId+category=FOTO. Aceita câmera (capture=environment) ou arquivo.
//
// Regras de obrigatoriedade (declaradas no catálogo, aplicadas por
// @/lib/evaluation/rules):
//   • Status é OBRIGATÓRIO — enquanto o item ficar "Pendente" ele não conta
//     como avaliado em lugar nenhum (era a causa de "respondi e continua
//     pendente": dava para salvar mantendo Pendente).
//   • Item com `requiredPhoto` exige ao menos 1 foto PERSISTIDA para salvar.
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { X, Save, Loader2, Camera, Upload, Trash2 } from 'lucide-react'
import { maskBRL, parseBRL, numberToBRLMask } from '@/lib/masks'
import {
  ITEM_STATUS, SERVICE_TYPES, SERVICE_TYPE_LABELS, PRIORITIES,
  ITEMS, POSITION_LABELS, parseAppliesTo, stripAppliesTo, serializeNotesWithAppliesTo,
  type SectionKey, type PositionGroup,
} from '@/lib/evaluation/catalog'
import { isItemAnswered } from '@/lib/evaluation/rules'
import { FieldLabel, FieldError, RequiredTag, FIELD_ERROR_CLASS } from '@/components/ui/field'

export interface DrawerItem {
  id:           string
  evaluationId: string
  name:         string
  status:       string
  priority:     string | null
  notes:        string | null
  catalogKey:   string | null
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
  /** Item exige foto (vem do catálogo, via rules.isPhotoRequiredFor). */
  photoRequired?:   boolean
  existingPhotos?:  DrawerPhoto[]
  onSave:           () => void
  /** `dirty` = houve upload/remoção de foto — o pai precisa recarregar. */
  onClose:          (dirty: boolean) => void
}

const inputCls = 'rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 w-full'

/** Opções de status oferecidas ao avaliador — "Pendente" não é resposta. */
const SELECTABLE_STATUS = ITEM_STATUS.filter((s) => s.value !== 'PENDING')

export function ItemDrawer({
  item, isReopen, readOnly, photoRequired = false, existingPhotos = [], onSave, onClose,
}: ItemDrawerProps) {
  // Descobre o positionGroup do item a partir do catalogKey — se o item foi
  // criado com base no catálogo, exibe checkboxes de posições ("aplica-se
  // também a"). Se não achar, nada aparece — não quebra nada.
  const positionGroup: PositionGroup | null = (() => {
    if (!item.catalogKey) return null
    const [sectionKey] = item.catalogKey.split('.')
    if (!sectionKey) return null
    const upperSection = sectionKey.toUpperCase() as SectionKey
    const catalog = ITEMS[upperSection] ?? []
    const catItem = catalog.find((c) => c.key === item.catalogKey)
    return catItem?.positionGroup ?? null
  })()
  const positions = positionGroup ? POSITION_LABELS[positionGroup] : []

  const togglePosition = (key: string) => {
    setAppliesTo((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key])
  }

  const firstTime = !isItemAnswered(item.status)
  const headerChip = isReopen ? 'Reavaliar' : (firstTime ? 'Avaliar item' : 'Editar item')
  const buttonLabel = firstTime && !isReopen ? 'Salvar avaliação' : 'Salvar alterações'

  // Status começa VAZIO quando o item nunca foi avaliado: o avaliador precisa
  // escolher conscientemente (inclusive "Não se aplica", que é resposta válida).
  const [status,      setStatus]      = useState(isItemAnswered(item.status) ? item.status : '')
  const [priority,    setPriority]    = useState(item.priority ?? '')
  // Notes visíveis (sem o marker [APPLIES_TO]) — o marker é reagregado no save
  const [notes,       setNotes]       = useState(stripAppliesTo(item.notes))
  const [appliesTo,   setAppliesTo]   = useState<string[]>(parseAppliesTo(item.notes))
  const [serviceType, setServiceType] = useState<string>('OUTRO')
  const [costMask,    setCostMask]    = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [photos,      setPhotos]      = useState<DrawerPhoto[]>(existingPhotos)
  const [photoBusy,   setPhotoBusy]   = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [err,         setErr]         = useState('')
  const [statusError, setStatusError] = useState('')
  const [photoError,  setPhotoError]  = useState('')
  /** Houve upload/remoção de foto? O pai precisa recarregar mesmo se fechar. */
  const [dirty,       setDirty]       = useState(false)

  const fileRef   = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setStatus(isItemAnswered(item.status) ? item.status : '')
    setPriority(item.priority ?? '')
    setNotes(stripAppliesTo(item.notes))
    setAppliesTo(parseAppliesTo(item.notes))
    setCostMask('')
    setDescription('')
    setPhotos(existingPhotos)
    setErr(''); setStatusError(''); setPhotoError('')
    setDirty(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.status, item.priority, item.notes])

  async function uploadPhotos(files: FileList | null) {
    if (!files || files.length === 0 || readOnly) return
    setPhotoBusy(true); setErr(''); setPhotoError('')
    try {
      const added: DrawerPhoto[] = []
      for (let i = 0; i < files.length; i++) {
        const f  = files[i]
        const fd = new FormData()
        fd.append('file', f)
        fd.append('itemId',   item.id)
        fd.append('category', 'FOTO')
        const r = await fetch(`/api/evaluations/${item.evaluationId}/attachments`, { method: 'POST', body: fd })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) {
          // Falhou = NÃO conta como foto enviada (a obrigatoriedade continua).
          setErr(d?.error ?? 'Falha ao enviar a foto. Tente novamente.')
          break
        }
        // Só entra na lista o registro PERSISTIDO devolvido pela API.
        const att = d?.data
        if (att?.id) {
          added.push({ id: att.id, fileName: att.fileName, publicUrl: att.publicUrl })
        }
      }
      if (added.length > 0) {
        setPhotos((p) => [...p, ...added])
        setDirty(true)
      }
    } catch {
      setErr('Erro de conexão ao enviar a foto. Tente novamente.')
    } finally {
      setPhotoBusy(false)
      if (fileRef.current)   fileRef.current.value   = ''
      if (cameraRef.current) cameraRef.current.value = ''
    }
  }

  async function removePhoto(id: string) {
    if (readOnly) return
    if (!confirm('Remover esta foto?')) return
    try {
      const r = await fetch(`/api/evaluations/${item.evaluationId}/attachments/${id}`, { method: 'DELETE' })
      if (r.ok) {
        setPhotos((p) => p.filter((x) => x.id !== id))
        setDirty(true)
      } else {
        setErr('Não foi possível remover a foto.')
      }
    } catch {
      setErr('Erro de conexão ao remover a foto.')
    }
  }

  async function handleSave() {
    if (readOnly) { onClose(dirty); return }
    if (saving) return              // trava duplo clique

    // ── Validação dos obrigatórios (mesma regra do resto do módulo) ────────
    let invalid = false
    if (!isItemAnswered(status)) {
      setStatusError('Este campo é obrigatório.')
      invalid = true
    } else setStatusError('')

    if (photoRequired && photos.length === 0) {
      setPhotoError('Este item exige pelo menos 1 foto.')
      invalid = true
    } else setPhotoError('')

    if (invalid) {
      setErr('Preencha os campos obrigatórios destacados.')
      return
    }

    setSaving(true)
    setErr('')
    try {
      // Recombina o marker [APPLIES_TO] com as notes visíveis — persistido no
      // mesmo campo `notes` (evita migration Prisma).
      const finalNotes = positionGroup
        ? (serializeNotesWithAppliesTo(notes, appliesTo) || null)
        : (notes || null)
      const r1 = await fetch(`/api/evaluations/${item.evaluationId}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          priority: priority || null,
          notes:    finalNotes,
        }),
      })
      if (!r1.ok) {
        const d = await r1.json().catch(() => ({}))
        setErr(d?.error ?? 'Falha ao salvar o item.')
        setSaving(false)
        return
      }

      const cost = parseBRL(costMask)
      if ((cost != null && cost > 0) || description.trim()) {
        // A rota faz upsert por (evaluationId, itemId, serviceType) — editar o
        // item duas vezes NÃO cria dois serviços nem infla o total de gastos.
        const r2 = await fetch(`/api/evaluations/${item.evaluationId}/services`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemId:        item.id,
            description:   description.trim() || item.name,
            serviceType,
            estimatedCost: cost ?? 0,
            priority:      priority || null,
            notes:         null,
          }),
        }).catch(() => null)
        if (r2 && !r2.ok) {
          setErr('Item salvo, mas o serviço não pôde ser registrado. Revise na aba Serviços.')
        }
      }

      onSave()
    } catch {
      setErr('Erro de conexão ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={() => onClose(dirty)} />
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-[480px] bg-white shadow-2xl flex flex-col">
        <header className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="flex-1 min-w-0">
            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              isReopen ? 'bg-blue-100 text-blue-800' : firstTime ? 'bg-brand-100 text-brand-800' : 'bg-amber-100 text-amber-800'
            }`}>
              {headerChip}
            </span>
            <h3 className="mt-1 text-base font-semibold text-gray-900 truncate">{item.name}</h3>
          </div>
          <button type="button" onClick={() => onClose(dirty)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Nome do item</span>
            <input className={inputCls + ' bg-gray-50'} value={item.name} readOnly />
          </label>

          <div className="flex flex-col gap-1">
            <FieldLabel required htmlFor="item-status">Status da avaliação</FieldLabel>
            <select
              id="item-status"
              className={`${inputCls} ${statusError ? FIELD_ERROR_CLASS : ''}`}
              value={status}
              onChange={(e) => { setStatus(e.target.value); if (e.target.value) setStatusError('') }}
              disabled={readOnly}
              aria-invalid={statusError ? true : undefined}
              aria-describedby={statusError ? 'item-status-error' : undefined}
            >
              <option value="">Selecione o status…</option>
              {SELECTABLE_STATUS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <FieldError id="item-status-error">{statusError}</FieldError>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Descrição / serviço (opcional)</span>
            <textarea
              className={inputCls + ' min-h-[60px] resize-y'}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: trocar capa do banco, reparar amassado"
              disabled={readOnly}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-600">Tipo de serviço</span>
              <select className={inputCls} value={serviceType} onChange={(e) => setServiceType(e.target.value)} disabled={readOnly}>
                {SERVICE_TYPES.map((t) => (
                  <option key={t} value={t}>{SERVICE_TYPE_LABELS[t] ?? t}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-600">Previsão de custo (R$)</span>
              <input
                inputMode="numeric"
                className={inputCls}
                value={costMask}
                onChange={(e) => setCostMask(maskBRL(e.target.value))}
                placeholder="0,00"
                disabled={readOnly}
              />
              {costMask && (
                <span className="text-[10px] text-gray-400">
                  {numberToBRLMask(parseBRL(costMask) ?? 0)}
                </span>
              )}
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Prioridade</span>
            <select className={inputCls} value={priority} onChange={(e) => setPriority(e.target.value)} disabled={readOnly}>
              <option value="">Selecione</option>
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </label>

          {/* ── Aplica-se também a: posições adicionais (pneu/retrovisor/…) ── */}
          {positionGroup && positions.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-brand-200 bg-brand-50/50 px-3 py-2">
              <span className="text-xs font-medium text-brand-800">
                Aplica-se também a
                <span className="text-[10px] text-brand-600 font-normal ml-1">
                  (a mesma avaliação vale para as posições marcadas abaixo)
                </span>
              </span>
              <div className="flex flex-wrap gap-2">
                {positions.map((p) => {
                  const checked = appliesTo.includes(p.key)
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => togglePosition(p.key)}
                      disabled={readOnly}
                      className={[
                        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                        checked
                          ? 'border-brand-500 bg-brand-600 text-white'
                          : 'border-gray-300 bg-white text-gray-700 hover:border-brand-400',
                        readOnly ? 'opacity-50 cursor-not-allowed' : '',
                      ].join(' ')}
                    >
                      {checked ? '✓ ' : ''}{p.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600">Observações</span>
            <textarea
              className={inputCls + ' min-h-[72px] resize-y'}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalhes adicionais"
              disabled={readOnly}
            />
          </label>

          {/* ── Fotos do item (câmera ou arquivo) ─────────────────────────── */}
          <div
            className={[
              'flex flex-col gap-2 border-t pt-3',
              photoError ? 'border-error' : 'border-gray-100',
            ].join(' ')}
          >
            <div className="flex items-center justify-between gap-2">
              {photoRequired ? (
                <FieldLabel required hint="Mínimo de 1 foto.">Fotos do item</FieldLabel>
              ) : (
                <span className="text-xs font-medium text-gray-600">Fotos do item</span>
              )}
              {!readOnly && (
                <div className="flex items-center gap-1.5">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => uploadPhotos(e.target.files)}
                  />
                  <input
                    ref={cameraRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => uploadPhotos(e.target.files)}
                  />
                  <button
                    type="button"
                    onClick={() => cameraRef.current?.click()}
                    disabled={photoBusy}
                    className="flex items-center gap-1 rounded-lg border border-brand-400 bg-white px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-60"
                  >
                    {photoBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                    {photoBusy ? 'Enviando...' : 'Câmera'}
                  </button>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={photoBusy}
                    className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    <Upload className="h-3 w-3" /> Arquivo
                  </button>
                </div>
              )}
            </div>
            {photos.length === 0 ? (
              <p className="text-[11px] text-gray-400 italic">
                Nenhuma foto. Use câmera ou arquivo.
                {photoRequired && <> Este item <RequiredTag className="align-middle" /> tem foto.</>}
              </p>
            ) : (
              <ul className="grid grid-cols-3 gap-2">
                {photos.map((p) => (
                  <li key={p.id} className="group relative aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                    {p.publicUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.publicUrl} alt={p.fileName} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-[10px] text-gray-400">{p.fileName}</div>
                    )}
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => removePhoto(p.id)}
                        className="absolute top-1 right-1 rounded-full bg-white/90 p-1 text-error opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <FieldError id="item-photo-error">{photoError}</FieldError>
          </div>

          {err && <p role="alert" className="text-xs font-medium text-error">{err}</p>}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button type="button" onClick={() => onClose(dirty)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
            Fechar
          </button>
          {!readOnly && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || photoBusy}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Salvando...' : buttonLabel}
            </button>
          )}
        </footer>
      </aside>
    </>
  )
}
