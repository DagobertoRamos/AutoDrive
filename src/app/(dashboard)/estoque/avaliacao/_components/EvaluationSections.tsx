'use client'

// =============================================================================
// EvaluationSections — abas de seções (Interior, Frente, Direita, Traseira,
// Esquerda, Test-drive, Serviços, Resumo).
//
// TODA a decisão de "o que está pendente / a seção está concluída / o botão
// avança" vem de `@/lib/evaluation/rules` — a mesma regra usada pelo Resumo e
// pelo backend no envio para aprovação. Este componente NÃO tem regra própria.
//
// Para cada seção do checklist:
//   • "Foto geral da seção" (obrigatória) no topo — upload por arquivo OU câmera;
//   • lista de itens com status, marcação de obrigatoriedade e ação de avaliar;
//   • painel com as pendências obrigatórias que faltam (clicáveis);
//   • navegação que só bloqueia por pendência OBRIGATÓRIA real.
// Auto-seeda os itens canônicos via POST /api/evaluations/[id]/items/seed.
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, ChevronRight, ChevronLeft, Camera, Upload, Trash2, ImageIcon, CheckCircle2, AlertTriangle } from 'lucide-react'
import { ITEMS, SECTIONS, ITEM_STATUS, type CatalogItem, type SectionKey } from '@/lib/evaluation/catalog'
import {
  getSectionProgress, findCatalogItem,
  isAnswerRequired, isPhotoRequiredFor, getItemPhotos, getSectionPhotos,
  type EvaluationAttachmentLike, type EvaluationItemLike, type EvaluationRuleContext,
  type PendingRequirement, type SectionProgress,
} from '@/lib/evaluation/rules'
import { FieldLabel, RequiredTag } from '@/components/ui/field'
import { ItemDrawer, type DrawerItem } from './ItemDrawer'
import { ServicesSection } from './ServicesSection'
import { SummarySection } from './SummarySection'

type EvalItem = EvaluationItemLike & {
  priority: string | null
  notes:    string | null
}

type EvalAttachment = EvaluationAttachmentLike & {
  fileName:  string
  publicUrl: string | null
}

interface EvaluationSectionsProps {
  evaluationId:       string
  evaluationStatus:   string
  /** reopenCount > 0 → label do botão muda para "Reavaliar". */
  reopenCount?:       number
  readOnly?:          boolean
  /** Opcionais marcados no Step Veículo — habilitam exigências `IF_EQUIPPED`. */
  opcionais?:         string[]
  /** Callback ao clicar "Anterior seção" estando na 1ª aba. */
  onBack?:            () => void
  /** Callback ao clicar "Concluir avaliação" estando na última aba. */
  onComplete?:        () => void
}

const TABS: SectionKey[] = ['INTERIOR', 'FRENTE', 'DIREITA', 'TRASEIRA', 'ESQUERDA', 'TEST_DRIVE', 'SERVICOS', 'RESUMO']

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

/** Selo de status da seção (Pendente / Em andamento / Concluída). */
function sectionStatusBadge(progress: SectionProgress) {
  const map = {
    CONCLUIDA:    { label: 'Concluída',    cls: 'bg-emerald-100 text-emerald-800' },
    EM_ANDAMENTO: { label: 'Em andamento', cls: 'bg-amber-100 text-amber-800' },
    PENDENTE:     { label: 'Pendente',     cls: 'bg-gray-100 text-gray-600' },
  } as const
  const s = map[progress.status]
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.cls}`}>{s.label}</span>
}

// ── Widget de foto geral da seção (obrigatório) ──────────────────────────────

function SectionPhotoWidget({
  evaluationId, section, photos, readOnly, onChanged,
}: {
  evaluationId: string
  section:      SectionKey
  photos:       EvalAttachment[]
  readOnly?:    boolean
  onChanged:    () => void | Promise<void>
}) {
  const fileRef   = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err,  setErr]  = useState('')

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return
    setBusy(true); setErr('')
    let failed = false
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
          // Upload que falha NÃO conta como foto enviada: a pendência continua.
          setErr(d?.error ?? 'Falha ao enviar a foto. Tente novamente.')
          failed = true
          break
        }
      }
      // Recarrega do servidor: a foto só aparece (e só deixa de ser pendência)
      // depois de persistida e devolvida pela API.
      await onChanged()
      if (!failed) setErr('')
    } catch {
      setErr('Erro de conexão ao enviar a foto. Tente novamente.')
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
      if (r.ok) await onChanged()
      else setErr('Não foi possível remover a foto.')
    } catch {
      setErr('Erro de conexão ao remover a foto.')
    }
  }

  const hasPhotos = photos.length > 0

  return (
    <div
      id={`section-photo-${section}`}
      className={[
        'rounded-xl border p-3 sm:p-4 scroll-mt-24',
        hasPhotos ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-300 bg-amber-50',
      ].join(' ')}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <FieldLabel
            required
            hint={hasPhotos ? `${photos.length} foto(s) enviada(s).` : 'Mínimo de 1 foto.'}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
              <ImageIcon className="h-4 w-4" /> Foto geral da seção
            </span>
          </FieldLabel>
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
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
              {busy ? 'Enviando...' : 'Câmera'}
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

      {err && <p role="alert" className="text-xs font-medium text-error mb-2">{err}</p>}

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
                  className="absolute top-1 right-1 rounded-full bg-white/90 p-1 text-error opacity-0 group-hover:opacity-100"
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

// ── Painel de pendências obrigatórias ────────────────────────────────────────

function PendingPanel({
  pending, onGoTo,
}: {
  pending: PendingRequirement[]
  onGoTo:  (p: PendingRequirement) => void
}) {
  if (pending.length === 0) return null
  return (
    <div className="rounded-lg border border-error bg-error-light/60 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-error">
        <AlertTriangle className="h-3.5 w-3.5" />
        {pending.length === 1
          ? 'Existe 1 pendência obrigatória:'
          : `Existem ${pending.length} pendências obrigatórias:`}
      </p>
      <ul className="mt-1.5 space-y-1">
        {pending.map((p) => (
          <li key={`${p.type}:${p.catalogKey ?? p.sectionId}`}>
            <button
              type="button"
              onClick={() => onGoTo(p)}
              className="text-left text-xs text-error hover:underline"
            >
              • {p.label}
            </button>
          </li>
        ))}
      </ul>
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
  // Guard de concorrência: só a resposta MAIS RECENTE pode escrever no estado.
  // Sem isso, salvar um item e trocar de seção rápido faz uma resposta antiga
  // sobrescrever a nova (item volta a aparecer como pendente).
  const loadSeq      = useRef(0)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const seq = ++loadSeq.current
    if (!opts?.silent) setLoading(true)
    setErr('')
    try {
      const r = await fetch(`/api/evaluations/${evaluationId}`, { cache: 'no-store' })
      const d = await r.json().catch(() => null)
      if (seq !== loadSeq.current) return          // chegou atrasada — descarta
      if (!r.ok) {
        // Não zera o que já está na tela: erro de rede não pode "apagar" dados.
        setErr(d?.error ?? 'Falha ao carregar a avaliação.')
        return
      }
      const incoming: EvalItem[] = Array.isArray(d?.data?.items) ? d.data.items : []
      const incAttachments: EvalAttachment[] = Array.isArray(d?.data?.attachments) ? d.data.attachments : []

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
          const d2 = await r2.json().catch(() => null)
          if (seq !== loadSeq.current) return
          setItems(dedupeItems(Array.isArray(d2?.data?.items) ? d2.data.items : []))
          setAttachments(Array.isArray(d2?.data?.attachments) ? d2.data.attachments : [])
        } finally {
          seedInFlight.current = false
        }
      } else {
        setItems(dedupeItems(incoming))
        setAttachments(incAttachments)
      }
    } catch {
      if (seq === loadSeq.current) setErr('Erro de conexão ao carregar a avaliação.')
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }, [evaluationId, readOnly])

  useEffect(() => { void load() }, [load])
  // evaluationStatus é repassado ao ItemDrawer; nada a fazer aqui.
  void evaluationStatus

  // Contexto único das regras — usado por contadores, botão e painel.
  const ruleCtx: EvaluationRuleContext = useMemo(
    () => ({ items, attachments, opcionais }),
    [items, attachments, opcionais],
  )

  const currentItems  = useMemo(() => items.filter((i) => i.section === tab), [items, tab])
  const sectionPhotos = useMemo(
    () => getSectionPhotos(tab, attachments) as EvalAttachment[],
    [tab, attachments],
  )
  const catalog  = ITEMS[tab] ?? []
  const progress = useMemo(
    () => (TABS.indexOf(tab) < 6 ? getSectionProgress(tab, ruleCtx) : null),
    [tab, ruleCtx],
  )
  const pending = progress?.pending ?? []

  function buttonLabel(status: string): string {
    if (reopenCount > 0) return 'Reavaliar'
    if (!status || status === 'PENDING' || status === 'NAO_AVALIADO') return 'Avaliar item'
    return 'Editar item'
  }

  /** Nome exibido: prefere o rótulo atual do catálogo (o do banco pode ser antigo). */
  function displayName(it: EvalItem): string {
    return findCatalogItem(it)?.name ?? it.name
  }

  function openDrawer(it: EvalItem) {
    setDrawer({
      id: it.id, evaluationId, name: displayName(it), status: it.status ?? 'PENDING',
      priority: it.priority, notes: it.notes, catalogKey: it.catalogKey,
    })
  }

  /** Clique numa pendência: abre o item correspondente ou rola até a foto da seção. */
  function goToPending(p: PendingRequirement) {
    if (p.type === 'SECTION_PHOTO') {
      document.getElementById(`section-photo-${p.sectionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    const target = items.find((i) => i.id === p.itemId)
      ?? items.find((i) => i.section === p.sectionId && i.catalogKey === p.catalogKey)
    if (target) openDrawer(target)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Tabs — contadores derivados das MESMAS regras da validação */}
      <div className="flex flex-wrap gap-1 overflow-x-auto border-b border-gray-200">
        {TABS.map((t) => {
          const def = SECTIONS.find((s) => s.key === t)!
          const isChecklist = TABS.indexOf(t) < 6
          const p = isChecklist ? getSectionProgress(t, ruleCtx) : null
          const active = tab === t
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              title={p
                ? `${p.requiredDone}/${p.requiredTotal} obrigatórios concluídos • ${p.answeredItems}/${p.totalItems} itens avaliados`
                : undefined}
              className={[
                'whitespace-nowrap rounded-t-md px-3 py-2 text-xs font-medium border-b-2 transition-colors',
                active
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800',
              ].join(' ')}
            >
              {def.label}
              {p && (
                <>
                  {/* Obrigatórios: concluídos / total */}
                  <span className={[
                    'ml-1.5 inline-flex items-center rounded-full px-1.5 text-[9px] font-bold',
                    p.pending.length === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-error-light text-error',
                  ].join(' ')}>
                    {p.requiredDone}/{p.requiredTotal}
                  </span>
                  {/* Itens avaliados (informativo) */}
                  {p.totalItems > 0 && (
                    <span className="ml-1 text-[10px] text-gray-400">
                      {p.answeredItems}/{p.totalItems} itens
                    </span>
                  )}
                </>
              )}
            </button>
          )
        })}
      </div>

      {err && (
        <div role="alert" className="rounded-lg border border-error bg-error-light/60 px-3 py-2 text-xs text-error">{err}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-10 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : tab === 'SERVICOS' ? (
        // Aba SERVIÇOS tem UI própria (catálogo configurável + custos)
        <ServicesSection
          evaluationId={evaluationId}
          readOnly={readOnly}
          onBack={() => setTab(TABS[TABS.indexOf('SERVICOS') - 1])}
          onComplete={() => setTab('RESUMO')}
        />
      ) : tab === 'RESUMO' ? (
        // Aba RESUMO: consolida tudo + botão Finalizar (submit-for-approval)
        <SummarySection
          evaluationId={evaluationId}
          opcionais={opcionais}
          onBack={() => setTab('SERVICOS')}
          onFinalized={() => onComplete?.()}
          onGoToSection={(s) => setTab(s)}
        />
      ) : (
        <>
          {/* Cabeçalho da seção: status + progresso */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-gray-800">
                {SECTIONS.find((s) => s.key === tab)?.label}
              </h4>
              {progress && sectionStatusBadge(progress)}
            </div>
            {progress && (
              <p className="text-[11px] text-gray-500">
                <span className={progress.pending.length === 0 ? 'text-emerald-700 font-semibold' : 'text-error font-semibold'}>
                  {progress.requiredDone}/{progress.requiredTotal} obrigatórios
                </span>
                {progress.totalItems > 0 && <> • {progress.answeredItems}/{progress.totalItems} itens avaliados</>}
              </p>
            )}
          </div>

          {/* Foto geral da seção (obrigatória) */}
          <SectionPhotoWidget
            evaluationId={evaluationId}
            section={tab}
            photos={sectionPhotos}
            readOnly={readOnly}
            onChanged={() => load({ silent: true })}
          />

          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(currentItems.length > 0 ? currentItems : catalog.map((c) => ({
              id: `__ph_${c.key}`, section: tab, catalogKey: c.key, name: c.name, status: 'PENDING', priority: null, notes: null,
            } as EvalItem))).map((it) => {
              const isPlaceholder = it.id.startsWith('__ph_')
              const cat: CatalogItem | null = findCatalogItem(it)
              const answerRequired = cat ? isAnswerRequired(cat) : false
              const photoRequired  = cat ? isPhotoRequiredFor(cat, opcionais) : false
              const photos         = isPlaceholder ? [] : getItemPhotos(it.id, attachments)
              const photoMissing   = photoRequired && photos.length === 0
              return (
                <li
                  key={it.catalogKey ?? it.id}
                  className={[
                    'flex items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2.5',
                    photoMissing || (answerRequired && it.status === 'PENDING')
                      ? 'border-error/40'
                      : 'border-gray-200',
                  ].join(' ')}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate flex items-center gap-1">
                      {cat?.name ?? it.name}
                      {answerRequired && <span aria-hidden="true" className="text-error font-semibold">*</span>}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {statusBadge(it.status || 'PENDING')}
                      {answerRequired && <RequiredTag />}
                      {photoRequired && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium">
                          <span className={photoMissing ? 'text-error' : 'text-emerald-700'}>
                            Foto <span aria-hidden="true">*</span>
                          </span>
                          {photoMissing
                            ? <RequiredTag />
                            : <span className="text-emerald-700">enviada</span>}
                        </span>
                      )}
                      {photos.length > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-500">
                          <Camera className="h-2.5 w-2.5" /> {photos.length}
                        </span>
                      )}
                    </div>
                    {cat?.hint && <p className="mt-0.5 text-[10px] text-gray-400 truncate">{cat.hint}</p>}
                  </div>
                  <button
                    type="button"
                    disabled={isPlaceholder || readOnly}
                    onClick={() => openDrawer(it)}
                    className="inline-flex items-center gap-1 rounded-lg border border-brand-300 bg-white px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={isPlaceholder ? 'Itens ainda não inicializados. Salve a avaliação antes.' : ''}
                  >
                    {buttonLabel(it.status ?? '')}
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </li>
              )
            })}
          </ul>

          {/* ── Pendências obrigatórias da seção ───────────────────────────── */}
          <PendingPanel pending={pending} onGoTo={goToPending} />

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
                  disabled={pending.length > 0}
                  title={pending.length > 0
                    ? `Faltam: ${pending.map((p) => p.label).join(' • ')}`
                    : undefined}
                  onClick={() => setTab(TABS[TABS.indexOf(tab) + 1])}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Próxima seção ({SECTIONS.find((s) => s.key === TABS[TABS.indexOf(tab) + 1])?.label})
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  disabled={pending.length > 0}
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
          photoRequired={(() => {
            const it = items.find((i) => i.id === drawer.id)
            const cat = it ? findCatalogItem(it) : null
            return cat ? isPhotoRequiredFor(cat, opcionais) : false
          })()}
          existingPhotos={attachments.filter((a) => a.itemId === drawer.id && a.fileType === 'image')}
          onClose={(dirty) => { setDrawer(null); if (dirty) void load({ silent: true }) }}
          onSave={() => { setDrawer(null); void load({ silent: true }) }}
        />
      )}
    </div>
  )
}
