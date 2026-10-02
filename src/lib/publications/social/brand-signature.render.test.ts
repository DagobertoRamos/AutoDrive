// Assinatura da loja no vídeo (sharp + ffmpeg reais): logo e @ fora da imagem
// no vídeo deitado, no canto no vídeo em pé, e o encerramento de 2,5 s.
// SOCIAL_ART_OUT=<pasta> grava os quadros para conferir a olho.
import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const ff = async (args: string[]) => {
  const { spawnSync } = await import('node:child_process')
  return spawnSync((await import('ffmpeg-static')).default as unknown as string, args, { encoding: 'utf8' })
}

async function darkLogo(): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  // Logo escuro com fundo transparente (o caso que precisa virar branco).
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200"><rect x="10" y="40" width="120" height="120" rx="24" fill="#0b1f33"/><rect x="160" y="70" width="400" height="60" rx="12" fill="#0b1f33"/></svg>'
  return sharp(Buffer.from(svg)).png().toBuffer()
}

describe('assinatura da loja no vídeo (renderização real)', () => {
  it('vídeo deitado e em pé: 1080×1920, com o encerramento no fim e áudio', async () => {
    const { brandEndCard, brandOverlay, fitBox } = await import('./brand-frame')
    const { probeVideo, toReels, END_CARD_SECONDS } = await import('./video')
    const brand = { storeName: 'AutoDrive Veículos', primaryColor: '#16a34a', darkColor: '#061b29', whatsapp: '(11) 93471-8276', instagram: 'dagobertoautodriveveiculos', site: 'https://www.appautodrive.com.br/', logo: await darkLogo() }
    const dir = mkdtempSync(path.join(tmpdir(), 'sig-'))
    const card = path.join(dir, 'fim.png')
    writeFileSync(card, await brandEndCard(brand))
    for (const [name, size, secs] of [['deitado', '1280x720', 4], ['em-pe', '720x1280', 3]] as const) {
      const src = path.join(dir, `${name}.mp4`)
      await ff(['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `testsrc=size=${size}:rate=30:duration=${secs}`, '-f', 'lavfi', '-i', `sine=frequency=330:duration=${secs}`, '-shortest', '-c:v', 'libx264', '-c:a', 'aac', src])
      const info = await probeVideo(src)
      expect(info).toMatchObject({ width: Number(size.split('x')[0]), height: Number(size.split('x')[1]) })
      expect(info!.duration).toBeGreaterThan(secs - 0.2)
      const box = fitBox(info!.width, info!.height)
      if (name === 'deitado') expect(box).toMatchObject({ x: 0, w: 1080, h: 608 })
      const over = path.join(dir, `${name}.png`)
      writeFileSync(over, await brandOverlay(1080, 1920, brand, 'ASSINATURA', box))
      // Deitado: nada da marca dentro da imagem do vídeo (camada transparente ali).
      if (name === 'deitado') {
        const sharp = (await import('sharp')).default
        const { data } = await sharp(over).extract({ left: 0, top: box.y + 4, width: 1080, height: box.h - 8 }).extractChannel(3).raw().toBuffer({ resolveWithObject: true })
        expect(data.reduce((a, b) => Math.max(a, b), 0)).toBe(0)
      }
      const out = path.join(dir, `${name}.out.mp4`)
      await toReels(src, out, undefined, { overlay: over, endCard: card, duration: info!.duration })
      const res = (await ff(['-hide_banner', '-i', out])).stderr
      expect(res).toMatch(/1080x1920/)
      expect(res).toMatch(/Audio: aac/)
      const outInfo = await probeVideo(out)
      expect(outInfo!.duration).toBeGreaterThan(secs + END_CARD_SECONDS - 0.3)
      expect(outInfo!.duration).toBeLessThan(secs + END_CARD_SECONDS + 0.4)
      if (process.env.SOCIAL_ART_OUT) {
        for (const [t, tag] of [[1, 'video'], [secs + END_CARD_SECONDS - 0.5, 'fim']] as const) {
          const jpg = path.join(dir, `${name}-${tag}.jpg`)
          await ff(['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(t), '-i', out, '-frames:v', '1', jpg])
          writeFileSync(path.join(process.env.SOCIAL_ART_OUT, `assinatura-${name}-${tag}.jpg`), readFileSync(jpg))
        }
        writeFileSync(path.join(process.env.SOCIAL_ART_OUT, `assinatura-${name}.mp4`), readFileSync(out))
      }
    }
  }, 240_000)

  it('foto com a assinatura mantém o tamanho', async () => {
    const sharp = (await import('sharp')).default
    const { brandPhoto } = await import('./brand-frame')
    const photo = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#7a8899' } }).jpeg().toBuffer()
    const out = await brandPhoto(photo, { storeName: 'Loja', primaryColor: '#16a34a', darkColor: '#061b29', whatsapp: '', instagram: '@loja', logo: await darkLogo() }, 'ASSINATURA')
    const meta = await sharp(out).metadata()
    expect([meta.width, meta.height]).toEqual([1200, 900])
    if (process.env.SOCIAL_ART_OUT) writeFileSync(path.join(process.env.SOCIAL_ART_OUT, 'assinatura-foto.jpg'), out)
  }, 60_000)
})
