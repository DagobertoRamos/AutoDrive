import { describe, it, expect } from 'vitest'
import { defaultCrmSettings, sanitizeCrmSettings, sourceLabelOf, temperatureOf, reasonsFor, readLeadType, leadTypeOf } from './settings-core'

describe('sanitizeCrmSettings', () => {
  it('vazio → defaults', () => {
    expect(sanitizeCrmSettings(null)).toEqual(defaultCrmSettings())
  })

  it('temperaturas: sempre os 4 códigos, só rótulo/cor/ativa mudam', () => {
    const s = sanitizeCrmSettings({ temperatures: [{ value: 'HOT', label: 'Pegando fogo', color: '#000000', active: false }, { value: 'HACK', label: 'x' }] })
    expect(s.temperatures.map((t) => t.value)).toEqual(['BOILING', 'HOT', 'WARM', 'COLD'])
    expect(s.temperatures[1]).toEqual({ value: 'HOT', label: 'Pegando fogo', color: '#000000', active: false })
    expect(s.temperatures[0].label).toBe('Fervendo')
  })

  it('origens do sistema não somem e próprias ganham código', () => {
    const s = sanitizeCrmSettings({ sources: [{ code: 'AUTOCONF', label: 'Portal AutoConf', active: false }, { label: 'Instagram Ads' }, { code: 'MANUAL', label: 'dup' }] })
    expect(s.sources.find((x) => x.code === 'AUTOCONF')).toMatchObject({ label: 'Portal AutoConf', active: false, system: true })
    expect(s.sources.find((x) => x.code === 'FILA_ATENDIMENTO')?.system).toBe(true)
    expect(s.sources.find((x) => x.label === 'Instagram Ads')).toMatchObject({ code: 'INSTAGRAM_ADS', system: false })
    expect(s.sources.filter((x) => x.code === 'MANUAL')).toHaveLength(1)
  })

  it('tipos: descarta sem nome, gera id e garante unicidade', () => {
    const s = sanitizeCrmSettings({ leadTypes: [{ label: 'Frota' }, { label: '' }, { id: 'frota', label: 'Frota 2' }] })
    expect(s.leadTypes.map((t) => t.id)).toEqual(['frota', 'frota-2'])
  })

  it('motivos: exige desfecho válido e troca id provisório', () => {
    const s = sanitizeCrmSettings({ closeReasons: [{ id: 'new-LOST-1', label: 'Preço alto', outcome: 'LOST' }, { label: 'x', outcome: 'WON' }] })
    expect(s.closeReasons).toEqual([{ id: 'lost-preco-alto', label: 'Preço alto', outcome: 'LOST', active: true }])
  })
})

describe('leitura', () => {
  const s = sanitizeCrmSettings({ sources: [{ code: 'AUTOCONF', label: 'Portal' }] })
  it('rótulo de origem por código (case-insensitive) e fallback', () => {
    expect(sourceLabelOf(s, 'autoconf')).toBe('Portal')
    expect(sourceLabelOf(s, 'XYZ')).toBe('XYZ')
    expect(sourceLabelOf(s, null)).toBe('Sem origem')
  })
  it('temperatura desconhecida → não classificado', () => {
    expect(temperatureOf(s, 'NOPE').value).toBe('UNCLASSIFIED')
  })
  it('motivos ativos por desfecho', () => {
    expect(reasonsFor(s, 'DISCARDED').every((r) => r.outcome === 'DISCARDED' && r.active)).toBe(true)
  })
  it('tipo de lead vem do metadata', () => {
    expect(readLeadType({ leadType: 'troca' })).toBe('troca')
    expect(readLeadType(null)).toBeNull()
    expect(leadTypeOf(s, 'troca')?.label).toBe('Troca')
  })
})
