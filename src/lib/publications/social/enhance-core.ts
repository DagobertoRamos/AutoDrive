// =============================================================================
// Tratamento automático das fotos (PURO, testado) — o "editor profissional":
// mede a luz da foto e decide quanto clarear, recuperar sombras (contraste
// local), esticar os tons, avivar a cor e dar nitidez. Foto boa quase não muda;
// foto escura/lavada é corrigida. A foto original do estoque nunca é alterada.
// =============================================================================

export interface PhotoStats {
  /** Luminância média 0–255. */
  mean: number
  /** Percentis 2 e 98 da luminância (faixa tonal usada). */
  p2: number
  p98: number
  /** Saturação média 0–1. */
  sat: number
}

export interface EnhancePlan {
  /** Esticar tons entre os percentis (normalise). */
  stretch: boolean
  /** Contraste local (CLAHE): recupera detalhes nas sombras. 0 = não aplica. */
  clahe: number
  /** Multiplicador de brilho (1 = mantém). */
  brightness: number
  /** Curva que clareia meios-tons sem estourar o céu (expoente < 1 clareia). */
  gamma: number
  saturation: number
  sharpen: number
  /** Resumo para o histórico/tela. */
  label: string
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const r2 = (v: number) => Math.round(v * 100) / 100

/** Estatística a partir de pixels RGB (amostra reduzida). */
export function photoStats(rgb: Uint8Array | Buffer, channels = 3): PhotoStats {
  const n = Math.floor(rgb.length / channels)
  if (!n) return { mean: 128, p2: 0, p98: 255, sat: 0.3 }
  const hist = new Array<number>(256).fill(0)
  let sum = 0; let satSum = 0
  for (let i = 0; i < n; i++) {
    const r = rgb[i * channels]; const g = rgb[i * channels + 1]; const b = rgb[i * channels + 2]
    const l = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)
    hist[l]++; sum += l
    const mx = Math.max(r, g, b); const mn = Math.min(r, g, b)
    satSum += mx === 0 ? 0 : (mx - mn) / mx
  }
  const pct = (p: number) => { let acc = 0; const target = n * p; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= target) return v } return 255 }
  return { mean: sum / n, p2: pct(0.02), p98: pct(0.98), sat: satSum / n }
}

/** Decide o tratamento. Alvo: média ~125, faixa tonal cheia, cor viva sem exagero. */
export function enhancePlan(s: PhotoStats): EnhancePlan {
  const range = s.p98 - s.p2
  const dark = s.mean < 105
  const veryDark = s.mean < 70
  const stretch = range < 225
  // Média estimada depois de esticar os tons.
  const after = stretch && range > 10 ? clamp(((s.mean - s.p2) / range) * 255, 0, 255) : s.mean
  const gamma = veryDark ? 0.7 : dark ? 0.82 : after < 110 ? 0.9 : 1
  const afterGamma = 255 * Math.pow(clamp(after, 1, 255) / 255, gamma)
  // Só escurece foto estourada (média alta); foto bem iluminada fica como está.
  const brightness = r2(clamp(125 / Math.max(afterGamma, 1), s.mean > 185 ? 0.92 : 1, veryDark ? 1.35 : 1.2))
  const clahe = veryDark ? 3 : dark ? 2 : 0
  const saturation = r2(s.sat < 0.18 ? 1.18 : s.sat < 0.3 ? 1.1 : s.sat > 0.55 ? 1 : 1.05)
  const parts = [veryDark ? 'foto muito escura: clareada e sombras recuperadas' : dark ? 'foto escura: clareada' : null, stretch ? 'contraste ajustado' : null, saturation > 1.05 ? 'cor avivada' : null, 'nitidez'].filter(Boolean)
  return { stretch, clahe, brightness, gamma, saturation, sharpen: 0.8, label: parts.join(', ') }
}
