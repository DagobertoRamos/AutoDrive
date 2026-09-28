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

describe('trilha sonora embutida (ffmpeg real)', () => {
  const run = async (args: string[]) => {
    const { spawnSync } = await import('node:child_process')
    const bin = (await import('ffmpeg-static')).default as unknown as string
    return spawnSync(bin, args, { encoding: 'utf8' })
  }
  /** Trilha de teste: tom de 440 Hz em MP3 (5 s — o vídeo repete a trilha até o fim). */
  async function toneMp3(): Promise<Buffer> {
    const { mkdtempSync, readFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const f = path.join(mkdtempSync(path.join(tmpdir(), 'tone-')), 't.mp3')
    await run(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=5', '-c:a', 'libmp3lame', '-b:a', '128k', f])
    return readFileSync(f)
  }
  async function meanVolume(mp4: Buffer): Promise<number> {
    const { mkdtempSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const f = path.join(mkdtempSync(path.join(tmpdir(), 'vol-')), 'v.mp4')
    writeFileSync(f, mp4)
    const r = await run(['-hide_banner', '-i', f, '-af', 'volumedetect', '-vn', '-f', 'null', '-'])
    return Number(/mean_volume:\s*(-?[\d.]+) dB/.exec(r.stderr)?.[1] ?? '-999')
  }

  it('Reels com trilha: áudio audível do começo ao fim (trilha curta repete)', async () => {
    const { renderReel } = await import('./reel')
    const { mp4, seconds } = await renderReel({ ...base, template: 'OFERTA', photos: [await fakePhoto(), await fakePhoto()], audio: await toneMp3() })
    expect(seconds).toBeGreaterThan(6)
    expect(await meanVolume(mp4)).toBeGreaterThan(-40)
    if (process.env.SOCIAL_ART_OUT) writeFileSync(path.join(process.env.SOCIAL_ART_OUT, 'reel-musica.mp4'), mp4)
  }, 120_000)

  it('sem trilha: áudio mudo (compatível com as redes)', async () => {
    const { renderReel } = await import('./reel')
    const { mp4 } = await renderReel({ ...base, template: 'OFERTA', photos: [await fakePhoto()] })
    expect(await meanVolume(mp4)).toBeLessThan(-80)
  }, 120_000)

  it('clipe de uma arte (Story/Post com música): 9:16 com trilha', async () => {
    const { renderArtClip } = await import('./reel')
    const art = await renderArt({ ...base, format: 'POST', template: 'OFERTA', photo: await fakePhoto() })
    const { mp4, seconds } = await renderArtClip(art, 8, await toneMp3())
    expect(seconds).toBe(8)
    expect(await meanVolume(mp4)).toBeGreaterThan(-40)
    if (process.env.SOCIAL_ART_OUT) writeFileSync(path.join(process.env.SOCIAL_ART_OUT, 'clip-post-musica.mp4'), mp4)
  }, 120_000)
})

describe('vídeo do carro → Reels (ffmpeg real)', () => {
  const ff = async (args: string[]) => {
    const { spawnSync } = await import('node:child_process')
    return spawnSync((await import('ffmpeg-static')).default as unknown as string, args, { encoding: 'utf8' })
  }
  it('vídeo horizontal com som e vídeo mudo viram 1080×1920 com áudio AAC', async () => {
    const { mkdtempSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { toReels } = await import('./video')
    const dir = mkdtempSync(path.join(tmpdir(), 'vtest-'))
    const withAudio = path.join(dir, 'a.mp4'); const mute = path.join(dir, 'm.mp4')
    await ff(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30:duration=4', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=4', '-shortest', '-c:v', 'libx264', '-c:a', 'aac', withAudio])
    await ff(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30:duration=3', '-c:v', 'libx264', '-an', mute])
    for (const [src, audible] of [[withAudio, true], [mute, false]] as const) {
      const out = `${src}.reels.mp4`
      await toReels(src, out)
      const info = (await ff(['-hide_banner', '-i', out])).stderr
      expect(info).toMatch(/1080x1920/)
      expect(info).toMatch(/Audio: aac/)
      const vol = Number(/mean_volume:\s*(-?[\d.]+) dB/.exec((await ff(['-hide_banner', '-i', out, '-af', 'volumedetect', '-vn', '-f', 'null', '-'])).stderr)?.[1] ?? '-999')
      if (audible) expect(vol).toBeGreaterThan(-40); else expect(vol).toBeLessThan(-80)
      if (process.env.SOCIAL_ART_OUT && audible) writeFileSync(path.join(process.env.SOCIAL_ART_OUT, 'video-carro-reels.mp4'), (await import('node:fs')).readFileSync(out))
    }
  }, 180_000)
})
