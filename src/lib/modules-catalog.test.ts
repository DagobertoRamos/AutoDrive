import { describe, expect, it } from 'vitest'
import { ALL_FEATURE_KEYS, PARENT_OF, SYSTEM_MODULES, ancestorsOf, applyModuleChanges, descendantsOf, effectiveDisabled, normalizeFullState } from './modules-catalog'

describe('modules-catalog — hierarquia', () => {
  it('cada módulo tem a raiz como primeira ferramenta e chaves únicas', () => {
    for (const m of SYSTEM_MODULES) expect(m.parts[0].features[0].key).toBe(m.root)
    expect(new Set(ALL_FEATURE_KEYS).size).toBe(ALL_FEATURE_KEYS.length)
  })

  it('Publicações é filha de Marketing (não da área SDR)', () => {
    expect(ancestorsOf('marketing.publications.publish')).toEqual(['marketing.publications', 'marketing'])
    expect(PARENT_OF['marketing.sdr']).toBe('marketing')
    expect(PARENT_OF['crm.lead.transfer.own']).toBe('crm')
    expect(PARENT_OF['queue.reorder']).toBe('sellerQueue.view')
  })

  it('caso Donna: raiz marketing desligada esconde tudo; ligar Publicações liga a raiz', () => {
    const donna = ['marketing', 'marketing.sdr', 'marketing.telephony']
    expect(effectiveDisabled(donna)).toContain('marketing.publications')
    const next = applyModuleChanges(donna, { 'marketing.publications': true })
    expect(next.has('marketing')).toBe(false)
    expect(next.has('marketing.publications')).toBe(false)
    expect(next.has('marketing.sdr')).toBe(true)
  })

  it('desligar o módulo desliga todos os descendentes', () => {
    const off = applyModuleChanges([], { marketing: false })
    for (const k of descendantsOf('marketing')) expect(off.has(k)).toBe(true)
    expect(off.has('crm')).toBe(false)
  })

  it('estado completo com filho ligado e pai desligado liga o pai', () => {
    const sdr = ['marketing.sdr', ...descendantsOf('marketing.sdr')]
    const enabled = ALL_FEATURE_KEYS.filter((k) => k !== 'marketing' && !sdr.includes(k))
    const { disabled } = normalizeFullState(enabled)
    expect(disabled.sort()).toEqual(sdr.sort())
  })

  it('ligar tudo / desligar tudo', () => {
    expect(applyModuleChanges(['marketing', 'finance'], Object.fromEntries(ALL_FEATURE_KEYS.map((k) => [k, true]))).size).toBe(0)
    const off = applyModuleChanges([], Object.fromEntries(SYSTEM_MODULES.map((m) => [m.root, false])))
    expect(off.size).toBe(ALL_FEATURE_KEYS.length)
  })
})
