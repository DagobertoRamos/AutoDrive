import { describe, it, expect } from 'vitest'
import { contrastRatio, hex, parseHex, paletteFromPixels, suggestBrand, rgbToHsl, type RGB } from './brand-core'

/** Monta pixels RGBA: [cor, quantidade][] (+ transparentes). */
function pixels(parts: [RGB, number][], transparent = 0): Uint8ClampedArray {
  const out: number[] = []
  for (const [c, n] of parts) for (let i = 0; i < n; i++) out.push(c[0], c[1], c[2], 255)
  for (let i = 0; i < transparent; i++) out.push(0, 0, 0, 0)
  return new Uint8ClampedArray(out)
}

describe('cores', () => {
  it('hex/parse e hsl', () => {
    expect(hex([7, 156, 166])).toBe('#079ca6')
    expect(parseHex('#079ca6')).toEqual([7, 156, 166])
    expect(rgbToHsl([255, 0, 0])[0]).toBe(0)
  })
  it('contraste WCAG', () => {
    expect(Math.round(contrastRatio([0, 0, 0], [255, 255, 255]))).toBe(21)
    expect(contrastRatio([255, 255, 255], [255, 255, 255])).toBe(1)
  })
  it('paleta ignora transparentes e ordena por presença', () => {
    const p = paletteFromPixels(pixels([[[200, 30, 30], 10], [[20, 20, 200], 30]], 50))
    expect(p).toHaveLength(2)
    expect(hex(p[0].rgb)).toBe('#1414c8')
  })
})

describe('sugestão de marca', () => {
  it('logo vermelha em fundo transparente → principal vermelha legível e logo escura?', () => {
    const s = suggestBrand(pixels([[[220, 20, 30], 400], [[30, 30, 30], 100]], 500), { hasTransparency: true })
    expect(contrastRatio([255, 255, 255], parseHex(s.primary))).toBeGreaterThanOrEqual(4.5)
    expect(s.palette[0]).toBeTruthy()
    expect(s.hasTransparency).toBe(true)
  })
  it('cor clara demais é escurecida até o texto branco ficar legível', () => {
    const s = suggestBrand(pixels([[[255, 200, 0], 500]]), { hasTransparency: true }) // amarelo
    expect(s.whiteOnPrimary).toBeGreaterThanOrEqual(4.5)
    expect(s.warnings.join(' ')).toContain('Escurecemos')
  })
  it('logo preta sem cor → padrão + aviso, marcada como escura, fundo sólido avisa', () => {
    const s = suggestBrand(pixels([[[10, 10, 10], 300], [[255, 255, 255], 700]]), { hasTransparency: false })
    // Cor padrão (turquesa), escurecida até o texto branco ficar legível.
    expect(Math.round(rgbToHsl(parseHex(s.primary))[0] / 10)).toBe(Math.round(rgbToHsl([7, 156, 166])[0] / 10))
    expect(s.whiteOnPrimary).toBeGreaterThanOrEqual(4.5)
    expect(s.warnings.join(' ')).toContain('não tem uma cor marcante')
    expect(s.warnings.join(' ')).toContain('fundo sólido')
  })
  it('logo escura em fundo transparente pede versão clara no rodapé', () => {
    const s = suggestBrand(pixels([[[15, 30, 60], 500]], 500), { hasTransparency: true })
    expect(s.logoIsDark).toBe(true)
  })
})
