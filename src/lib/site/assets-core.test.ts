import { describe, it, expect } from 'vitest'
import { sniffImage } from './assets-core'

describe('sniffImage', () => {
  it('PNG com dimensões do IHDR', () => {
    const png = new Uint8Array(24)
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    new DataView(png.buffer).setUint32(16, 640); new DataView(png.buffer).setUint32(20, 200)
    expect(sniffImage(png)).toEqual({ mime: 'image/png', width: 640, height: 200 })
  })
  it('JPEG e WebP', () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe('image/jpeg')
    const webp = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ')
    expect(sniffImage(webp)?.mime).toBe('image/webp')
  })
  it('recusa SVG/HTML disfarçados', () => {
    expect(sniffImage(new TextEncoder().encode('<svg onload="alert(1)"></svg>'))).toBeNull()
    expect(sniffImage(new TextEncoder().encode('<html><script>x</script>'))).toBeNull()
  })
})
