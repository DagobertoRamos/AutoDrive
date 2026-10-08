import { describe, expect, it } from 'vitest'
import { isPartnerPhotoUrl, photoSrc, snapPhotoWidth } from './partner-photo'

const BNDV = 'https://cdn-sistema-lojistas.bndv.com.br/vehicles-images/sistema.lojistas/11271/1501164/c026ee3f.jpg'

describe('partner-photo', () => {
  it('reconhece só os hosts de parceiro, em https', () => {
    expect(isPartnerPhotoUrl(BNDV)).toBe(true)
    expect(isPartnerPhotoUrl('https://bndvsistemalojistasst.blob.core.windows.net/vehicles-images/a.jpg')).toBe(true)
    expect(isPartnerPhotoUrl('https://autoconf-production.s3.amazonaws.com/veiculos/fotos/1/a.jpeg')).toBe(true)
    expect(isPartnerPhotoUrl('http://cdn-sistema-lojistas.bndv.com.br/a.jpg')).toBe(false)
    expect(isPartnerPhotoUrl('https://evil.com/?x=bndv.com.br')).toBe(false)
    expect(isPartnerPhotoUrl('https://bndv.com.br.evil.com/a.jpg')).toBe(false)
    expect(isPartnerPhotoUrl('https://outro.blob.core.windows.net/a.jpg')).toBe(false)
    expect(isPartnerPhotoUrl('https://x.bndv.com.br:8443/a.jpg')).toBe(false)
    expect(isPartnerPhotoUrl('/api/site/assets/abc')).toBe(false)
    expect(isPartnerPhotoUrl(null)).toBe(false)
  })

  it('reescreve só foto de parceiro e encaixa a largura', () => {
    expect(photoSrc(BNDV)).toBe(`/api/integrations/foto?u=${encodeURIComponent(BNDV)}`)
    expect(photoSrc(BNDV, 300)).toBe(`/api/integrations/foto?u=${encodeURIComponent(BNDV)}&w=320`)
    expect(photoSrc(BNDV, 5000)).toBe(`/api/integrations/foto?u=${encodeURIComponent(BNDV)}`)
    expect(photoSrc('https://llhgzpbr2dax9nah.public.blob.vercel-storage.com/a.png')).toBe('https://llhgzpbr2dax9nah.public.blob.vercel-storage.com/a.png')
    expect(photoSrc(null)).toBeNull()
    expect(snapPhotoWidth(641)).toBe(1280)
    expect(snapPhotoWidth(0)).toBeNull()
  })
})
