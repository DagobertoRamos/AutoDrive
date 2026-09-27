// Renderização REAL das artes (sharp + fonte embutida), com foto gerada aqui.
// Com SOCIAL_ART_OUT=<pasta> grava os arquivos para conferência visual.
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { renderArt } from './art'
import type { ArtTemplate, SocialFormat } from './formats'

async function fakePhoto(): Promise<Buffer> {
  // "Carro" prata sobre fundo de showroom, 4:3 como as fotos do estoque.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200"><rect width="1600" height="1200" fill="#2b3440"/><rect y="820" width="1600" height="380" fill="#9aa3ad"/><rect x="330" y="520" width="940" height="330" rx="120" fill="#c9ced4"/><rect x="480" y="400" width="600" height="200" rx="80" fill="#b5bcc4"/><circle cx="530" cy="860" r="110" fill="#111"/><circle cx="1070" cy="860" r="110" fill="#111"/></svg>`
  return sharp(Buffer.from(svg)).jpeg().toBuffer()
}

const base = {
  brand: 'Volkswagen', model: 'Tiguan', version: '1.4 TSI 16V 150cv 2.0 TSI', year: 2011, modelYear: 2011, km: 160276, gear: 'Automático',
  price: 43000, oldPrice: 46900, storeName: 'AutoDrive Veículos', whatsapp: '(11) 93471-8276', instagram: '@dagobertoautodriveveiculos',
  primaryColor: '#16a34a', darkColor: '#061b29',
}

describe('artes do estúdio social (renderização real)', () => {
  const out = process.env.SOCIAL_ART_OUT
  if (out) mkdirSync(out, { recursive: true })
  const cases: Array<[SocialFormat, ArtTemplate, boolean, { w: number; h: number }]> = [
    ['POST', 'OFERTA', false, { w: 1080, h: 1350 }],
    ['STORY', 'CHEGOU', false, { w: 1080, h: 1920 }],
    ['REELS', 'DESTAQUE', true, { w: 720, h: 1280 }],
    ['POST', 'LIMPA', false, { w: 1080, h: 1350 }],
  ]
  for (const [format, template, forVideo, size] of cases) {
    it(`${format} · ${template}`, async () => {
      const photo = await fakePhoto()
      const jpg = await renderArt({ ...base, format, template, forVideo, photo })
      const meta = await sharp(jpg).metadata()
      expect(meta.format).toBe('jpeg')
      expect({ w: meta.width, h: meta.height }).toEqual(size)
      if (out) writeFileSync(path.join(out, `${format}-${template}.jpg`), jpg)
    }, 20_000)
  }

  it('quadro final do Reels', async () => {
    const jpg = await renderArt({ ...base, format: 'REELS', template: 'OFERTA', forVideo: true, endCard: true, photo: await fakePhoto() })
    expect((await sharp(jpg).metadata()).height).toBe(1280)
    if (out) writeFileSync(path.join(out, 'REELS-final.jpg'), jpg)
  }, 20_000)
})

describe('Reels (vídeo real com ffmpeg)', () => {
  it('gera MP4 vertical com as fotos e o quadro final', async () => {
    const { renderReel } = await import('./reel')
    const photo = await fakePhoto()
    const t0 = Date.now()
    const { mp4, seconds } = await renderReel({ ...base, template: 'OFERTA', photos: [photo, photo, photo] })
    const ms = Date.now() - t0
    expect(mp4.subarray(4, 8).toString('ascii')).toBe('ftyp')
    expect(seconds).toBeGreaterThan(8)
    expect(mp4.length).toBeLessThan(4_000_000)
    if (process.env.SOCIAL_ART_OUT) writeFileSync(path.join(process.env.SOCIAL_ART_OUT, 'reel.mp4'), mp4)
    console.log(`reel: ${seconds}s, ${(mp4.length / 1e6).toFixed(2)} MB, gerado em ${ms} ms`)
  }, 120_000)
})
