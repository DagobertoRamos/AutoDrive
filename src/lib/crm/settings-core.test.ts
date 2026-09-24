import { describe, it, expect } from 'vitest'
import { defaultCrmSettings, sanitizeCrmSettings, sourceLabelOf, temperatureOf, reasonsFor, readLeadType, leadTypeOf, missingLeadFields, fieldLabels, evaluateLeadSla } from './settings-core'

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

describe('Fase B — regras', () => {
  it('sanitiza sla/distribuição/campos com limites e defaults', () => {
    const s = sanitizeCrmSettings({ sla: { enabled: true, firstContactMinutes: 1, noContactHours: 'x' }, requiredFields: { onCreate: ['phone', 'hack', 'phone'] }, distribution: { autoAssignNew: 1 } })
    expect(s.sla).toMatchObject({ enabled: true, firstContactMinutes: 5, noContactHours: 48 })
    expect(s.requiredFields).toEqual({ onCreate: ['phone'], onConvert: [] })
    expect(s.distribution).toEqual({ autoAssignNew: true, runSdrInTick: false })
    expect(sanitizeCrmSettings({}).sla.enabled).toBe(false)
  })

  it('missingLeadFields respeita a ordem e considera vazio/espaços', () => {
    expect(missingLeadFields(['email', 'name', 'leadType'], { name: '  ', email: 'a@b.c' })).toEqual(['name', 'leadType'])
    expect(fieldLabels(['name', 'vehicleId'])).toBe('Nome, Veículo de interesse')
  })

  const cfg = { enabled: true, firstContactMinutes: 30, noContactHours: 48, createFollowUpTask: true, escalateToManagers: true }
  const now = new Date('2026-09-23T12:00:00Z')
  const ago = (ms: number) => new Date(now.getTime() - ms)

  it('1º contato: alerta uma vez após o prazo', () => {
    const lead = { status: 'NEW', createdAt: ago(31 * 60_000), lastContactAt: null, marks: {} }
    expect(evaluateLeadSla(lead, cfg, now)).toMatchObject({ firstContactLate: true, alertFirstContact: true })
    expect(evaluateLeadSla({ ...lead, marks: { firstContactAlertedAt: 'x' } }, cfg, now).alertFirstContact).toBe(false)
    expect(evaluateLeadSla({ ...lead, createdAt: ago(10 * 60_000) }, cfg, now).firstContactLate).toBe(false)
  })

  it('sem contato: alerta por período (novo contato reabre o ciclo)', () => {
    const last = ago(49 * 3_600_000)
    const lead = { status: 'WORKING', createdAt: ago(100 * 3_600_000), lastContactAt: last, marks: {} }
    const v = evaluateLeadSla(lead, cfg, now)
    expect(v).toMatchObject({ noContactLate: true, alertNoContact: true, firstContactLate: false })
    expect(evaluateLeadSla({ ...lead, marks: { noContactAlertedFor: last.toISOString() } }, cfg, now).alertNoContact).toBe(false)
    expect(evaluateLeadSla({ ...lead, marks: { noContactAlertedFor: ago(200 * 3_600_000).toISOString() } }, cfg, now).alertNoContact).toBe(true)
  })

  it('lead fechado ou SLA desligado não alerta', () => {
    const lead = { status: 'CONVERTED', createdAt: ago(100 * 3_600_000), lastContactAt: null, marks: {} }
    expect(evaluateLeadSla(lead, cfg, now)).toMatchObject({ firstContactLate: false, noContactLate: false })
    expect(evaluateLeadSla({ ...lead, status: 'NEW' }, { ...cfg, enabled: false }, now)).toMatchObject({ firstContactLate: true, alertFirstContact: false })
  })
})

describe('SLA — ligar não dispara o histórico', () => {
  const now = new Date('2026-09-23T12:00:00Z')
  const cfg = { enabled: true, firstContactMinutes: 30, noContactHours: 48, createFollowUpTask: true, escalateToManagers: true, enabledAt: '2026-09-23T11:00:00Z' }
  it('estouro anterior ao enabledAt: selo sim, alerta não', () => {
    const lead = { status: 'WORKING', createdAt: new Date('2026-09-01T00:00:00Z'), lastContactAt: new Date('2026-09-10T00:00:00Z'), marks: {} }
    expect(evaluateLeadSla(lead, cfg, now)).toMatchObject({ noContactLate: true, alertNoContact: false })
  })
  it('estouro depois do enabledAt alerta', () => {
    const lead = { status: 'WORKING', createdAt: new Date('2026-09-01T00:00:00Z'), lastContactAt: new Date('2026-09-21T11:30:00Z'), marks: {} }
    expect(evaluateLeadSla(lead, cfg, now).alertNoContact).toBe(true)
  })
})
