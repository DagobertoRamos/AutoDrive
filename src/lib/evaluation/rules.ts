// =============================================================================
// rules.ts — FONTE ÚNICA DA VERDADE do módulo de Avaliação Veicular.
//
// Toda decisão de "isto está respondido / esta seção está concluída / o que
// falta para enviar" nasce aqui. O mesmo módulo roda:
//   • no client  (abas, contadores, botão "Próxima seção", resumo);
//   • no servidor (POST /submit-for-approval);
//   • nos testes  (src/lib/evaluation/rules.test.ts).
//
// Regras do desenho:
//   • Puro: sem React, sem Prisma, sem Next. Só dados de entrada.
//   • Obrigatoriedade é DECLARADA no catálogo (catalog.ts), nunca inferida do
//     nome do campo/label.
//   • `status` (Pendente/respondido) e `required` (obrigatório/opcional) são
//     conceitos SEPARADOS — um nunca é derivado do outro.
//   • Uma foto só conta quando existe o registro persistido devolvido pela API.
// =============================================================================

import {
  ITEMS, SECTIONS, type CatalogItem, type SectionKey,
} from './catalog'

// ── Seções que compõem o checklist de vistoria ───────────────────────────────

export const CHECKLIST_SECTIONS: SectionKey[] = [
  'INTERIOR', 'FRENTE', 'DIREITA', 'TRASEIRA', 'ESQUERDA', 'TEST_DRIVE',
]

/** Seções que exigem, no mínimo, 1 foto geral (sem vínculo a item). */
export const SECTIONS_REQUIRING_PHOTO: SectionKey[] = [...CHECKLIST_SECTIONS]

// ── Formatos de entrada (compatíveis com Prisma e com o estado do client) ────

export interface EvaluationItemLike {
  id:          string
  section:     string
  catalogKey:  string | null
  name:        string
  status:      string | null
}

export interface EvaluationAttachmentLike {
  id:       string
  section:  string | null
  itemId:   string | null
  fileType: string | null
  category?: string | null
}

export interface EvaluationRuleContext {
  items:       EvaluationItemLike[]
  attachments: EvaluationAttachmentLike[]
  /** Opcionais marcados no veículo — habilitam exigências `IF_EQUIPPED`. */
  opcionais?:  string[]
}

// ── Status de item ───────────────────────────────────────────────────────────

/** Valores que significam "ainda não respondido". */
export const UNANSWERED_STATUSES = ['PENDING', 'NAO_AVALIADO', 'PENDENTE'] as const

/**
 * Item respondido = tem status escolhido pelo avaliador.
 * ATENÇÃO: "NA" (não se aplica) É uma resposta válida — conta como respondido.
 */
export function isItemAnswered(status: string | null | undefined): boolean {
  if (status == null) return false
  const s = String(status).trim().toUpperCase()
  if (!s) return false
  return !(UNANSWERED_STATUSES as readonly string[]).includes(s)
}

/** Um item está completo quando respondido e, se exigir foto, com foto persistida. */
export function isItemComplete(
  item: EvaluationItemLike,
  ctx: EvaluationRuleContext,
): boolean {
  const cat = findCatalogItem(item)
  if (!isItemAnswered(item.status)) return false
  if (cat && isPhotoRequiredFor(cat, ctx.opcionais) && !itemHasPhoto(item, ctx.attachments)) return false
  return true
}

// ── Obrigatoriedade (declarada no catálogo) ──────────────────────────────────

/** Resposta (status) obrigatória para concluir a seção? */
export function isAnswerRequired(cat: CatalogItem): boolean {
  return cat.required === true
}

/**
 * Foto do item obrigatória?
 *   true          → sempre
 *   'IF_EQUIPPED' → só quando o opcional declarado está marcado no veículo
 */
export function isPhotoRequiredFor(cat: CatalogItem, opcionais: string[] = []): boolean {
  if (!cat.requiredPhoto) return false
  if (cat.requiredPhoto === true) return true
  const target = (cat.requiredPhotoIfOptional ?? '').trim().toLowerCase()
  if (!target) return false
  return opcionais.some((o) => (o ?? '').trim().toLowerCase() === target)
}

// ── Consultas sobre anexos ───────────────────────────────────────────────────

function isImage(a: EvaluationAttachmentLike): boolean {
  return (a.fileType ?? '').toLowerCase() === 'image'
}

/** Fotos gerais da seção: imagem, com a seção marcada e SEM vínculo a item. */
export function getSectionPhotos(
  section: SectionKey,
  attachments: EvaluationAttachmentLike[],
): EvaluationAttachmentLike[] {
  return attachments.filter((a) => a.section === section && isImage(a) && !a.itemId)
}

/** Fotos de um item específico (persistidas). */
export function getItemPhotos(
  itemId: string,
  attachments: EvaluationAttachmentLike[],
): EvaluationAttachmentLike[] {
  return attachments.filter((a) => a.itemId === itemId && isImage(a))
}

export function itemHasPhoto(
  item: EvaluationItemLike,
  attachments: EvaluationAttachmentLike[],
): boolean {
  return getItemPhotos(item.id, attachments).length > 0
}

// ── Catálogo ─────────────────────────────────────────────────────────────────

export function getCatalog(section: SectionKey): CatalogItem[] {
  return ITEMS[section] ?? []
}

export function sectionLabel(section: SectionKey): string {
  return SECTIONS.find((s) => s.key === section)?.label ?? section
}

/** Acha a definição de catálogo de um item persistido (por catalogKey). */
export function findCatalogItem(item: EvaluationItemLike): CatalogItem | null {
  if (!item.catalogKey) return null
  const section = item.section as SectionKey
  const list = ITEMS[section] ?? []
  return list.find((c) => c.key === item.catalogKey) ?? null
}

/** Item persistido correspondente a uma entrada do catálogo. */
export function findItemForCatalog(
  section: SectionKey,
  cat: CatalogItem,
  items: EvaluationItemLike[],
): EvaluationItemLike | null {
  return (
    items.find((it) => it.section === section && it.catalogKey === cat.key) ??
    items.find(
      (it) => it.section === section &&
        it.name.trim().toLowerCase() === cat.name.trim().toLowerCase(),
    ) ??
    null
  )
}

// ── Pendências obrigatórias ──────────────────────────────────────────────────

export type RequirementType = 'SECTION_PHOTO' | 'ITEM_PHOTO' | 'ITEM_ANSWER'

export interface PendingRequirement {
  sectionId:    SectionKey
  sectionLabel: string
  /** id do EvaluationItem quando já existe no banco (null p/ foto da seção). */
  itemId:       string | null
  catalogKey:   string | null
  type:         RequirementType
  /** Texto pronto para exibir/enviar na resposta da API. */
  label:        string
}

/**
 * Requisitos obrigatórios pendentes de UMA seção. Opcionais nunca entram aqui.
 */
export function getSectionPending(
  section: SectionKey,
  ctx: EvaluationRuleContext,
): PendingRequirement[] {
  const pending: PendingRequirement[] = []
  const label = sectionLabel(section)

  // 1) Foto geral da seção
  if (SECTIONS_REQUIRING_PHOTO.includes(section) && getSectionPhotos(section, ctx.attachments).length === 0) {
    pending.push({
      sectionId: section, sectionLabel: label, itemId: null, catalogKey: null,
      type: 'SECTION_PHOTO', label: 'Foto geral da seção',
    })
  }

  // 2) Requisitos declarados por item no catálogo
  for (const cat of getCatalog(section)) {
    const item = findItemForCatalog(section, cat, ctx.items)

    if (isAnswerRequired(cat) && !isItemAnswered(item?.status ?? null)) {
      pending.push({
        sectionId: section, sectionLabel: label, itemId: item?.id ?? null,
        catalogKey: cat.key, type: 'ITEM_ANSWER',
        label: `${cat.name} — avaliação do item`,
      })
    }

    if (isPhotoRequiredFor(cat, ctx.opcionais)) {
      const hasPhoto = item ? itemHasPhoto(item, ctx.attachments) : false
      if (!hasPhoto) {
        pending.push({
          sectionId: section, sectionLabel: label, itemId: item?.id ?? null,
          catalogKey: cat.key, type: 'ITEM_PHOTO',
          label: `${cat.name} — foto obrigatória`,
        })
      }
    }
  }

  return pending
}

/** Total de requisitos obrigatórios existentes na seção (pendentes + cumpridos). */
export function countSectionRequirements(
  section: SectionKey,
  ctx: EvaluationRuleContext,
): number {
  let total = SECTIONS_REQUIRING_PHOTO.includes(section) ? 1 : 0
  for (const cat of getCatalog(section)) {
    if (isAnswerRequired(cat)) total += 1
    if (isPhotoRequiredFor(cat, ctx.opcionais)) total += 1
  }
  return total
}

export type SectionStatus = 'PENDENTE' | 'EM_ANDAMENTO' | 'CONCLUIDA'

export interface SectionProgress {
  section:        SectionKey
  label:          string
  /** Itens do checklist persistidos na seção. */
  totalItems:     number
  /** Itens respondidos (qualquer status ≠ Pendente) — indicador informativo. */
  answeredItems:  number
  /** Requisitos OBRIGATÓRIOS da seção. */
  requiredTotal:  number
  requiredDone:   number
  pending:        PendingRequirement[]
  status:         SectionStatus
  photos:         number
}

export function getSectionProgress(
  section: SectionKey,
  ctx: EvaluationRuleContext,
): SectionProgress {
  const items         = ctx.items.filter((i) => i.section === section)
  const answeredItems = items.filter((i) => isItemAnswered(i.status)).length
  const pending       = getSectionPending(section, ctx)
  const requiredTotal = countSectionRequirements(section, ctx)
  const photos        = getSectionPhotos(section, ctx.attachments).length
  const itemPhotos    = items.reduce((n, it) => n + getItemPhotos(it.id, ctx.attachments).length, 0)

  const started = answeredItems > 0 || photos > 0 || itemPhotos > 0
  const status: SectionStatus =
    pending.length === 0 ? 'CONCLUIDA' : started ? 'EM_ANDAMENTO' : 'PENDENTE'

  return {
    section,
    label:        sectionLabel(section),
    totalItems:   items.length,
    answeredItems,
    requiredTotal,
    requiredDone: Math.max(0, requiredTotal - pending.length),
    pending,
    status,
    photos,
  }
}

export function isSectionComplete(section: SectionKey, ctx: EvaluationRuleContext): boolean {
  return getSectionPending(section, ctx).length === 0
}

/** Todas as pendências obrigatórias da avaliação, na ordem das seções. */
export function getEvaluationPending(ctx: EvaluationRuleContext): PendingRequirement[] {
  return CHECKLIST_SECTIONS.flatMap((s) => getSectionPending(s, ctx))
}

export function isEvaluationComplete(ctx: EvaluationRuleContext): boolean {
  return getEvaluationPending(ctx).length === 0
}

// ── Opcionais do veículo (marker persistido em evaluationNotes) ──────────────

const OPCIONAIS_RE = /^\s*\[Opcionais\]\s*(.+)$/mi

/**
 * Lê os opcionais marcados no formulário do veículo. Enquanto não existe coluna
 * dedicada no schema, eles ficam em `evaluationNotes` com o marker
 * `[Opcionais] Teto Solar, Bancos de couro`.
 */
export function parseOpcionais(evaluationNotes: string | null | undefined): string[] {
  if (!evaluationNotes) return []
  const m = OPCIONAIS_RE.exec(evaluationNotes)
  if (!m) return []
  return m[1].split(',').map((s) => s.trim()).filter(Boolean)
}

// ── Validação de campos (0 e false SÃO respostas válidas) ────────────────────

export type FieldKind = 'text' | 'number' | 'boolean' | 'select' | 'list'

/**
 * "Vazio" por TIPO — nunca `if (!value)`.
 *   number  → só null/undefined/NaN/'' são vazios (0 é válido)
 *   boolean → só null/undefined são vazios (false é válido)
 *   list    → array sem elementos
 */
export function isEmptyValue(value: unknown, kind: FieldKind = 'text'): boolean {
  if (value === null || value === undefined) return true
  switch (kind) {
    case 'number': {
      if (typeof value === 'number') return Number.isNaN(value)
      const s = String(value).trim()
      if (!s) return true
      return Number.isNaN(Number(s))
    }
    case 'boolean':
      return typeof value === 'boolean' ? false : String(value).trim() === ''
    case 'list':
      return !Array.isArray(value) || value.length === 0
    default:
      return String(value).trim() === ''
  }
}

/** Campo obrigatório não preenchido? (required && vazio) */
export function isRequiredFieldMissing(
  value: unknown,
  required: boolean,
  kind: FieldKind = 'text',
): boolean {
  return required && isEmptyValue(value, kind)
}
