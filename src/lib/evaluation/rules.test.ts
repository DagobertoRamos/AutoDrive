import { describe, it, expect } from 'vitest'
import {
  CHECKLIST_SECTIONS,
  getEvaluationPending,
  getSectionPending,
  getSectionProgress,
  isAnswerRequired,
  isEmptyValue,
  isEvaluationComplete,
  isItemAnswered,
  isItemComplete,
  isPhotoRequiredFor,
  isRequiredFieldMissing,
  isSectionComplete,
  parseOpcionais,
  type EvaluationAttachmentLike,
  type EvaluationItemLike,
  type EvaluationRuleContext,
} from './rules'
import { ITEMS } from './catalog'

// ── Helpers de fixture (usam o catálogo REAL — nada de mock) ─────────────────

function itemsFor(section: 'INTERIOR' | 'FRENTE' | 'TEST_DRIVE'): EvaluationItemLike[] {
  return ITEMS[section].map((c, i) => ({
    id:         `${section.toLowerCase()}-${i}`,
    section,
    catalogKey: c.key,
    name:       c.name,
    status:     'PENDING',
  }))
}

function answer(items: EvaluationItemLike[], catalogKey: string, status: string): EvaluationItemLike[] {
  return items.map((it) => (it.catalogKey === catalogKey ? { ...it, status } : it))
}

function photo(over: Partial<EvaluationAttachmentLike>): EvaluationAttachmentLike {
  return { id: `att-${Math.round(over.id ? 1 : 2)}`, section: null, itemId: null, fileType: 'image', ...over } as EvaluationAttachmentLike
}

const PAINEL = 'interior.painel_km'
const TETO   = 'frente.teto_solar'

function ctx(over: Partial<EvaluationRuleContext> = {}): EvaluationRuleContext {
  return { items: [], attachments: [], opcionais: [], ...over }
}

// ── Cenário 1 — avaliação nova ──────────────────────────────────────────────

describe('cenário 1 — avaliação nova', () => {
  const c = ctx({ items: itemsFor('INTERIOR') })

  it('a seção começa Pendente, com 0 obrigatórios concluídos', () => {
    const p = getSectionProgress('INTERIOR', c)
    expect(p.status).toBe('PENDENTE')
    expect(p.requiredDone).toBe(0)
    expect(p.answeredItems).toBe(0)
    expect(p.totalItems).toBe(ITEMS.INTERIOR.length)
  })

  it('os obrigatórios são declarados no catálogo (foto da seção + painel/hodômetro)', () => {
    const p = getSectionProgress('INTERIOR', c)
    // 1 foto de seção + resposta do painel + foto do painel
    expect(p.requiredTotal).toBe(3)
    expect(p.pending.map((x) => x.type).sort()).toEqual(['ITEM_ANSWER', 'ITEM_PHOTO', 'SECTION_PHOTO'])
  })

  it('obrigatoriedade NUNCA é inferida do nome do item', () => {
    const painel = ITEMS.INTERIOR.find((c2) => c2.key === PAINEL)!
    const banco  = ITEMS.INTERIOR.find((c2) => c2.key === 'interior.banco_motorista')!
    expect(isAnswerRequired(painel)).toBe(true)
    expect(isPhotoRequiredFor(painel)).toBe(true)
    expect(isAnswerRequired(banco)).toBe(false)
    expect(isPhotoRequiredFor(banco)).toBe(false)
  })
})

// ── Cenário 2/3/4 — bloqueio de avanço ──────────────────────────────────────

describe('cenários 2 a 4 — o que bloqueia o avanço', () => {
  it('sem responder nada: bloqueia e lista exatamente o que falta', () => {
    const c = ctx({ items: itemsFor('INTERIOR') })
    const pending = getSectionPending('INTERIOR', c)
    expect(pending.length).toBe(3)
    expect(pending.map((p) => p.label)).toEqual([
      'Foto geral da seção',
      'Painel / hodômetro — avaliação do item',
      'Painel / hodômetro — foto obrigatória',
    ])
  })

  it('com todos os obrigatórios cumpridos: libera e a seção fica Concluída', () => {
    const items = answer(itemsFor('INTERIOR'), PAINEL, 'CONFORME')
    const painelId = items.find((i) => i.catalogKey === PAINEL)!.id
    const c = ctx({
      items,
      attachments: [
        photo({ id: 'a1', section: 'INTERIOR' }),
        photo({ id: 'a2', itemId: painelId }),
      ],
    })
    expect(isSectionComplete('INTERIOR', c)).toBe(true)
    expect(getSectionProgress('INTERIOR', c).status).toBe('CONCLUIDA')
    expect(getSectionProgress('INTERIOR', c).requiredDone).toBe(3)
  })

  it('itens OPCIONAIS sem resposta não impedem o avanço', () => {
    const items = answer(itemsFor('INTERIOR'), PAINEL, 'ATENCAO')  // só o obrigatório
    const painelId = items.find((i) => i.catalogKey === PAINEL)!.id
    const c = ctx({
      items,
      attachments: [photo({ id: 'a1', section: 'INTERIOR' }), photo({ id: 'a2', itemId: painelId })],
    })
    const p = getSectionProgress('INTERIOR', c)
    expect(p.pending).toHaveLength(0)          // nenhum bloqueio
    expect(p.answeredItems).toBe(1)            // mas o progresso informa 1 de N
    expect(p.answeredItems).toBeLessThan(p.totalItems)
  })

  it('test-drive não tem item obrigatório: só a foto geral bloqueia', () => {
    const c = ctx({ items: itemsFor('TEST_DRIVE') })
    const pending = getSectionPending('TEST_DRIVE', c)
    expect(pending).toHaveLength(1)
    expect(pending[0].type).toBe('SECTION_PHOTO')
  })
})

// ── Cenário 5/6 — foto obrigatória ──────────────────────────────────────────

describe('cenários 5 e 6 — foto só conta quando persistida', () => {
  const items = answer(itemsFor('INTERIOR'), PAINEL, 'CONFORME')
  const painelId = items.find((i) => i.catalogKey === PAINEL)!.id

  it('upload confirmado (registro devolvido pela API) remove a pendência', () => {
    const c = ctx({ items, attachments: [photo({ id: 'a1', itemId: painelId })] })
    expect(getSectionPending('INTERIOR', c).some((p) => p.type === 'ITEM_PHOTO')).toBe(false)
  })

  it('upload que falhou (nenhum anexo persistido) mantém a pendência', () => {
    const c = ctx({ items, attachments: [] })
    expect(getSectionPending('INTERIOR', c).some((p) => p.type === 'ITEM_PHOTO')).toBe(true)
  })

  it('foto de OUTRO item não satisfaz a exigência (ids não se misturam)', () => {
    const c = ctx({ items, attachments: [photo({ id: 'a1', itemId: 'interior-0' })] })
    expect(getSectionPending('INTERIOR', c).some((p) => p.type === 'ITEM_PHOTO')).toBe(true)
  })

  it('foto de item não substitui a foto GERAL da seção', () => {
    const c = ctx({ items, attachments: [photo({ id: 'a1', itemId: painelId })] })
    expect(getSectionPending('INTERIOR', c).some((p) => p.type === 'SECTION_PHOTO')).toBe(true)
  })

  it('PDF anexado não conta como foto', () => {
    const c = ctx({ items, attachments: [photo({ id: 'a1', section: 'INTERIOR', fileType: 'pdf' })] })
    expect(getSectionPending('INTERIOR', c).some((p) => p.type === 'SECTION_PHOTO')).toBe(true)
  })
})

// ── Foto condicional (IF_EQUIPPED) ──────────────────────────────────────────

describe('exigência condicional — teto solar', () => {
  const items = itemsFor('FRENTE')

  it('sem o opcional marcado, não exige foto', () => {
    const c = ctx({ items, opcionais: ['Bancos de couro'] })
    expect(getSectionPending('FRENTE', c).some((p) => p.catalogKey === TETO)).toBe(false)
  })

  it('com o opcional marcado, exige foto', () => {
    const c = ctx({ items, opcionais: ['Teto Solar'] })
    expect(getSectionPending('FRENTE', c).some((p) => p.catalogKey === TETO)).toBe(true)
  })

  it('a comparação do opcional ignora caixa e espaços', () => {
    const c = ctx({ items, opcionais: ['  teto solar '] })
    expect(getSectionPending('FRENTE', c).some((p) => p.catalogKey === TETO)).toBe(true)
  })

  it('parseOpcionais lê o marker persistido em evaluationNotes', () => {
    expect(parseOpcionais('[Opcionais] Teto Solar, Rodas de liga\nOutras notas')).toEqual(['Teto Solar', 'Rodas de liga'])
    expect(parseOpcionais(null)).toEqual([])
    expect(parseOpcionais('sem marker')).toEqual([])
  })
})

// ── Status ≠ obrigatoriedade ────────────────────────────────────────────────

describe('Pendente e Obrigatório são conceitos separados', () => {
  it('"Não se aplica" é resposta válida', () => {
    expect(isItemAnswered('NA')).toBe(true)
    expect(isItemAnswered('CONFORME')).toBe(true)
  })

  it('Pendente/vazio/null não são resposta', () => {
    expect(isItemAnswered('PENDING')).toBe(false)
    expect(isItemAnswered('')).toBe(false)
    expect(isItemAnswered(null)).toBe(false)
    expect(isItemAnswered(undefined)).toBe(false)
  })

  it('item opcional pendente continua opcional (não vira bloqueio)', () => {
    const c = ctx({ items: itemsFor('INTERIOR') })
    const pendingKeys = getSectionPending('INTERIOR', c).map((p) => p.catalogKey)
    expect(pendingKeys).not.toContain('interior.banco_motorista')
  })

  it('item obrigatório respondido mas sem a foto exigida NÃO está completo', () => {
    const items = answer(itemsFor('INTERIOR'), PAINEL, 'CONFORME')
    const painel = items.find((i) => i.catalogKey === PAINEL)!
    expect(isItemComplete(painel, ctx({ items }))).toBe(false)
    expect(isItemComplete(painel, ctx({ items, attachments: [photo({ id: 'a1', itemId: painel.id })] }))).toBe(true)
  })
})

// ── Cenário 12 — editar um item não afeta outro ─────────────────────────────

describe('cenário 12 — isolamento entre itens', () => {
  it('responder o item A não muda o estado do item B', () => {
    const base  = itemsFor('INTERIOR')
    const after = answer(base, 'interior.volante', 'REPARO')
    const b     = after.find((i) => i.catalogKey === 'interior.console')!
    expect(b.status).toBe('PENDING')
    expect(getSectionProgress('INTERIOR', ctx({ items: after })).answeredItems).toBe(1)
  })
})

// ── Cenários 10 e 11 — 0 e false são respostas válidas ──────────────────────

describe('cenários 10 e 11 — vazio por TIPO', () => {
  it('0 não é vazio em campo numérico', () => {
    expect(isEmptyValue(0, 'number')).toBe(false)
    expect(isEmptyValue('0', 'number')).toBe(false)
    expect(isRequiredFieldMissing(0, true, 'number')).toBe(false)
  })

  it('false não é vazio em campo booleano', () => {
    expect(isEmptyValue(false, 'boolean')).toBe(false)
    expect(isRequiredFieldMissing(false, true, 'boolean')).toBe(false)
  })

  it('null/undefined/"" continuam vazios', () => {
    expect(isEmptyValue(null, 'number')).toBe(true)
    expect(isEmptyValue(undefined, 'boolean')).toBe(true)
    expect(isEmptyValue('', 'text')).toBe(true)
    expect(isEmptyValue('   ', 'text')).toBe(true)
    expect(isEmptyValue([], 'list')).toBe(true)
  })

  it('campo opcional vazio nunca é pendência', () => {
    expect(isRequiredFieldMissing('', false, 'text')).toBe(false)
  })
})

// ── Cenário 15 — avaliação completa ─────────────────────────────────────────

describe('cenário 15 — avaliação inteira', () => {
  function completeContext(): EvaluationRuleContext {
    const items: EvaluationItemLike[] = []
    const attachments: EvaluationAttachmentLike[] = []
    for (const section of CHECKLIST_SECTIONS) {
      attachments.push({ id: `sec-${section}`, section, itemId: null, fileType: 'image' })
      ITEMS[section].forEach((c, i) => {
        const id = `${section}-${i}`
        items.push({ id, section, catalogKey: c.key, name: c.name, status: 'CONFORME' })
        if (c.requiredPhoto === true) attachments.push({ id: `p-${id}`, section: null, itemId: id, fileType: 'image' })
      })
    }
    return { items, attachments, opcionais: [] }
  }

  it('com tudo cumprido, não há pendência em nenhuma seção', () => {
    const c = completeContext()
    expect(getEvaluationPending(c)).toHaveLength(0)
    expect(isEvaluationComplete(c)).toBe(true)
  })

  it('faltando 1 foto de seção, a avaliação não pode ser enviada e aponta a seção', () => {
    const c = completeContext()
    c.attachments = c.attachments.filter((a) => a.id !== 'sec-ESQUERDA')
    const pending = getEvaluationPending(c)
    expect(isEvaluationComplete(c)).toBe(false)
    expect(pending).toHaveLength(1)
    expect(pending[0].sectionId).toBe('ESQUERDA')
    expect(pending[0].type).toBe('SECTION_PHOTO')
  })

  it('é determinístico: mesma entrada persistida → mesmo resultado (F5/reentrada)', () => {
    const c = completeContext()
    const primeira = JSON.stringify(getEvaluationPending(c))
    const segunda  = JSON.stringify(getEvaluationPending(JSON.parse(JSON.stringify(c))))
    expect(segunda).toBe(primeira)
  })
})
