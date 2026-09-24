import { describe, it, expect } from 'vitest'
import { cleanVideoUrl, sanitizeListingInput } from './listing-input'

describe('anúncio', () => {
  it('vídeo: YouTube ou mp4/webm https', () => {
    expect(cleanVideoUrl('https://www.youtube.com/watch?v=abc123XYZ')).toBeTruthy()
    expect(cleanVideoUrl('https://youtu.be/abc123XYZ')).toBeTruthy()
    expect(cleanVideoUrl('https://www.youtube.com/shorts/abc123XYZ')).toBeTruthy()
    expect(cleanVideoUrl('https://cdn.loja.com/video.mp4')).toBeTruthy()
    expect(cleanVideoUrl('http://cdn.loja.com/video.mp4')).toBeNull()
    expect(cleanVideoUrl('javascript:alert(1)')).toBeNull()
  })
  it('opcionais de texto viram lista sem repetição', () => {
    const r = sanitizeListingInput({ options: 'Ar-condicionado, Multimídia\nCâmera de ré; Ar-condicionado' })
    expect(r.ok && r.value.options).toEqual(['Ar-condicionado', 'Multimídia', 'Câmera de ré'])
  })
  it('vídeo inválido é erro; campos vazios viram null e SEO é limitado', () => {
    expect(sanitizeListingInput({ videoUrl: 'https://vimeo.com/1' }).ok).toBe(false)
    const r = sanitizeListingInput({ title: '  ', seoTitle: 'x'.repeat(100), featured: 1 })
    expect(r.ok && r.value).toMatchObject({ title: null, featured: true, hidden: false })
    expect(r.ok && r.value.seoTitle?.length).toBe(70)
  })
})
