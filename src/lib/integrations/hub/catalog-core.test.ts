import { describe, expect, it } from 'vitest'
import { availabilityOf, combineState, HUB_CATALOG, publicationCapFrom, searchHub } from './catalog-core'
import { CHANNELS, channelSpec, needsHomologation } from '@/lib/publications/channels'
import { CHANNEL_CATALOG } from '@/lib/crm/channels-core'

describe('Hub de canais — catálogo por capacidades', () => {
  it('ids únicos e explicação em todo card', () => {
    const ids = HUB_CATALOG.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const i of HUB_CATALOG) expect(i.hint.length).toBeGreaterThan(10)
  })

  it('aponta só para canais que existem (publicação e captação)', () => {
    const pubIds = new Set(CHANNELS.map((c) => c.id as string))
    const leadTypes = new Set(CHANNEL_CATALOG.map((c) => c.type))
    for (const i of HUB_CATALOG) {
      if (i.publicationChannel) expect(pubIds.has(i.publicationChannel), i.id).toBe(true)
      if (i.leadChannelType) expect(leadTypes.has(i.leadChannelType), i.id).toBe(true)
    }
  })

  it('não assume que todo canal faz tudo', () => {
    const olx = HUB_CATALOG.find((i) => i.id === 'olx')!
    expect(olx.caps.sendMessages).not.toBe('SIM')
    const icarros = HUB_CATALOG.find((i) => i.id === 'icarros')!
    expect(icarros.caps.publication).toBe('CONTRATO')
    expect(availabilityOf(icarros)).toBe('DISPONIVEL') // recebe leads por e-mail hoje
    expect(availabilityOf({ caps: { publication: 'HOMOLOGACAO' } })).toBe('EM_HOMOLOGACAO')
    expect(availabilityOf({ caps: { publication: 'CONTRATO' } })).toBe('REQUER_CONTRATO')
    expect(availabilityOf({ caps: {} })).toBe('EM_BREVE')
  })

  it('publicação segue a Central (fonte única)', () => {
    expect(publicationCapFrom(channelSpec('WEBMOTORS'), 'SIM')).toBe('HOMOLOGACAO')
    expect(publicationCapFrom(channelSpec('INSTAGRAM'), 'HOMOLOGACAO')).toBe('SIM')
    expect(publicationCapFrom(channelSpec('SITE'), 'HOMOLOGACAO')).toBe('SIM')
    expect(publicationCapFrom(undefined, 'CONTRATO')).toBe('CONTRATO')
  })

  it('busca por nome e apelido', () => {
    expect(searchHub(HUB_CATALOG, 'webmo').map((i) => i.id)).toEqual(['webmotors'])
    expect(searchHub(HUB_CATALOG, 'zap').map((i) => i.id)).toContain('whatsapp')
    expect(searchHub(HUB_CATALOG, '').length).toBe(HUB_CATALOG.length)
  })

  it('estado combinado', () => {
    expect(combineState([])).toBe('DESCONECTADO')
    expect(combineState([{ kind: 'CAPTACAO', state: 'CONECTADO', message: '' }, { kind: 'PUBLICACAO', state: 'ATENCAO', message: '' }])).toBe('ATENCAO')
    expect(combineState([{ kind: 'CAPTACAO', state: 'CONECTADO', message: '' }, { kind: 'PUBLICACAO', state: 'DESCONECTADO', message: '' }])).toBe('CONECTADO')
    expect(combineState([{ kind: 'EMAIL_PARSER', state: 'CONFIGURACAO_NECESSARIA', message: '' }, { kind: 'PUBLICACAO', state: 'DESCONECTADO', message: '' }])).toBe('CONFIGURACAO_NECESSARIA')
  })

  it('publicação real só em canal homologado (ou piloto liberado)', () => {
    expect(needsHomologation(channelSpec('WEBMOTORS')!, 'PRODUCAO', '')).toBe(true)
    expect(needsHomologation(channelSpec('WEBMOTORS')!, 'HOMOLOGACAO', '')).toBe(false)
    expect(needsHomologation(channelSpec('OLX')!, 'PRODUCAO', 'OLX, TIKTOK')).toBe(false)
    expect(needsHomologation(channelSpec('INSTAGRAM')!, 'PRODUCAO', '')).toBe(false)
    expect(needsHomologation(channelSpec('SITE')!, 'PRODUCAO', '')).toBe(false)
  })
})
