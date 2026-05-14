'use client'

// =============================================================================
// ThemeInjector — injeta paleta de cores dinâmica em runtime
//
// Ao montar (ou quando o tenant muda), lê /api/settings/identity,
// converte a primaryColor em uma paleta completa e escreve os CSS vars
// no <html> via <style id="brand-theme">.
//
// Vars geradas:
//   --brand-50 … --brand-950   (R G B para uso com Tailwind opacity)
//   --sb-bg, --sb-hover, --sb-active, --sb-accent, --sb-border   (sidebar)
// =============================================================================

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useIdentityStore } from '@/store/identityStore'

// ── Utilitários de cor ────────────────────────────────────────────────────────

/** hex → [h 0-360, s 0-100, l 0-100] */
function hexToHsl(hex: string): [number, number, number] | null {
  const c = hex.replace('#', '')
  if (c.length !== 6) return null
  const r = parseInt(c.slice(0, 2), 16) / 255
  const g = parseInt(c.slice(2, 4), 16) / 255
  const b = parseInt(c.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return [h * 360, s * 100, l * 100]
}

/** [h 0-360, s 0-100, l 0-100] → "R G B" (formato para Tailwind opacity) */
function hslToRgbStr(h: number, s: number, l: number): string {
  h /= 360; s /= 100; l /= 100
  let r: number, g: number, b: number
  if (s === 0) {
    r = g = b = l
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    const hue = (t: number): number => {
      if (t < 0) t += 1; if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }
    r = hue(h + 1 / 3); g = hue(h); b = hue(h - 1 / 3)
  }
  return `${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)}`
}

/** "R G B" string → `hsl(h, s%, l%)` string (para uso em CSS direto) */
function hslStr(h: number, s: number, l: number): string {
  return `hsl(${Math.round(h)}, ${Math.round(Math.max(0, Math.min(100, s)))}%, ${Math.round(Math.max(0, Math.min(100, l)))}%)`
}

// ── Geração da paleta ─────────────────────────────────────────────────────────

/**
 * Gera todas as CSS vars necessárias a partir de um hex de cor primária.
 * Retorna uma string CSS pronta para ser inserida em :root { ... }
 */
function generateThemeVars(primaryHex: string): string | null {
  const hsl = hexToHsl(primaryHex)
  if (!hsl) return null
  const [h, s] = hsl

  // ── Paleta brand (50-950) — formato "R G B" para suporte a opacity no Tailwind ──
  const brandScale: Array<[string, number, number]> = [
    ['50',  97, Math.min(s * 0.40, 48)],
    ['100', 93, Math.min(s * 0.50, 56)],
    ['200', 85, Math.min(s * 0.62, 64)],
    ['300', 73, Math.min(s * 0.74, 72)],
    ['400', 58, Math.min(s * 0.86, 82)],
    ['500', 46, Math.min(s * 0.93, 88)],
    ['600', 40, s],
    ['700', 32, s],
    ['800', 25, s],
    ['900', 18, Math.max(s * 0.94, s - 4)],
    ['950', 11, Math.max(s * 0.85, s - 8)],
  ]

  const brandVars = brandScale
    .map(([shade, l, sat]) => `  --brand-${shade}: ${hslToRgbStr(h, sat, l)};`)
    .join('\n')

  // ── Sidebar vars — formato hsl() completo (usados em bg/text diretamente) ──
  // A saturação da sidebar é limitada para não ficar excessivamente vibrante
  const ssCap = Math.min(s, 80)   // saturação máxima para sidebar
  const sbBg        = hslStr(h, ssCap * 0.75,  7)
  const sbHover     = hslStr(h, ssCap * 0.65, 11)
  const sbActive    = hslStr(h, ssCap * 0.70, 16)
  const sbAccent    = hslStr(h, Math.min(s, 90), 65)  // cor vibrante para ativo
  const sbBorder    = hslStr(h, ssCap * 0.55, 13)

  const sidebarVars = [
    `  --sb-bg:         ${sbBg};`,
    `  --sb-hover:      ${sbHover};`,
    `  --sb-active:     ${sbActive};`,
    `  --sb-accent:     ${sbAccent};`,
    `  --sb-accent-dim: ${sbAccent};`,
    `  --sb-border:     ${sbBorder};`,
  ].join('\n')

  return `:root {\n${brandVars}\n${sidebarVars}\n}`
}

// ── Injeção no DOM ────────────────────────────────────────────────────────────

export function injectTheme(primaryHex: string): void {
  if (typeof window === 'undefined') return
  const css = generateThemeVars(primaryHex)
  if (!css) return

  let tag = document.getElementById('brand-theme') as HTMLStyleElement | null
  if (!tag) {
    tag = document.createElement('style')
    tag.id = 'brand-theme'
    document.head.appendChild(tag)
  }
  tag.textContent = css
}

// ── Componente ────────────────────────────────────────────────────────────────

export function ThemeInjector() {
  const { data: session, status } = useSession()
  const setIdentity = useIdentityStore((s) => s.setIdentity)

  useEffect(() => {
    if (status !== 'authenticated') return
    // MASTER não tem tenant — usa os padrões de globals.css
    if (!session?.user?.tenantId) return

    fetch('/api/settings/identity', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        const data = d?.data ?? {}
        const color: string | undefined = data.primaryColor
        if (color?.startsWith('#')) injectTheme(color)
        // Atualiza nome/tagline no store para componentes como Topbar
        setIdentity(data.appName ?? '', data.appTagline ?? '')
      })
      .catch(() => { /* mantém padrão */ })
  }, [status, session?.user?.tenantId, setIdentity])

  return null
}
