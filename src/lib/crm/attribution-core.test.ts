import { describe, expect, it } from 'vitest'
import { addTouch, extractTouch, readAttribution, touchLabel } from './attribution-core'

const at = new Date('2026-10-07T10:00:00Z')

describe('Atribuição de marketing', () => {
  it('lê ids de campanha/anúncio em qualquer formato de chave', () => {
    const t = extractTouch({ campaign_id: '123', adsetId: '456', AD_ID: '789', form_id: 'f1', utm_source: 'google', gclid: 'G-1', listing_id: 'WM-93828' }, { source: 'GOOGLE_ADS' }, at)
    expect(t).toMatchObject({ source: 'GOOGLE_ADS', campaignId: '123', adsetId: '456', adId: '789', formId: 'f1', utmSource: 'google', gclid: 'G-1', externalListingId: 'WM-93828', at: at.toISOString() })
  })

  it('tira parâmetros de campanha da URL da página', () => {
    const t = extractTouch({ pageUrl: 'https://loja.com/carro?utm_campaign=feirao&fbclid=FB1&ttclid=TT1' }, { source: 'SITE' }, at)
    expect(t.utmCampaign).toBe('feirao')
    expect(t.fbclid).toBe('FB1')
    expect(t.ttclid).toBe('TT1')
  })

  it('primeiro toque fica, último troca, histórico limitado', () => {
    let a = addTouch(null, { at: '1', source: 'WEBMOTORS' })
    a = addTouch(a, { at: '2', source: 'INSTAGRAM' })
    a = addTouch(a, { at: '3', source: 'WHATSAPP' })
    expect(a.firstTouch.source).toBe('WEBMOTORS')
    expect(a.lastTouch.source).toBe('WHATSAPP')
    expect(a.touches).toHaveLength(3)
    for (let i = 0; i < 30; i++) a = addTouch(a, { at: `x${i}`, source: 'SITE' })
    expect(a.touches).toHaveLength(20)
    expect(a.firstTouch.source).toBe('WEBMOTORS')
  })

  it('lê do metadata e monta rótulo', () => {
    const a = addTouch(null, { at: '1', source: 'FACEBOOK', campaign: 'Feirão', adName: 'Carrossel SUV' })
    expect(readAttribution({ attribution: a })?.firstTouch.campaign).toBe('Feirão')
    expect(readAttribution({})).toBeNull()
    expect(touchLabel(a.firstTouch, (c) => (c === 'FACEBOOK' ? 'Facebook' : c))).toBe('Facebook · campanha Feirão · anúncio Carrossel SUV')
  })
})
