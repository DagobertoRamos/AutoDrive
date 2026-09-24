'use client'
/* eslint-disable @next/next/no-img-element -- prévias locais (data:) e arquivos da loja */

// =============================================================================
// Painel do Site — Marca auto-configurável. O lojista solta a logo e o sistema:
// remove fundo branco, recorta, sugere as cores (com contraste garantido), gera
// a versão clara p/ o rodapé e o favicon, e mostra as prévias antes de aplicar.
// =============================================================================

import { useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ImagePlus, Loader2, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { analyzeLogo, type AnalyzedBrand } from '@/lib/site/brand-analyzer'
import { contrastRatio, parseHex } from '@/lib/site/brand-core'
import type { SiteConfig } from '@/lib/site/config-core'

type Identity = SiteConfig['identity']

async function upload(blob: Blob, kind: string): Promise<string> {
  const fd = new FormData()
  fd.append('file', blob, `${kind.toLowerCase()}.png`)
  fd.append('kind', kind)
  const r = await fetch('/api/site-admin/assets', { method: 'POST', body: fd, credentials: 'include' })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j?.error ?? 'Falha ao enviar a imagem.')
  return j.data.url as string
}

function Preview({ identity, logo, footerLogo, favicon, primary, dark }: { identity: Identity; logo: string; footerLogo: string; favicon: string; primary: string; dark: string }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="overflow-hidden rounded-lg border border-gray-200">
        <p className="bg-gray-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Cabeçalho do site</p>
        <div className="flex items-center justify-between gap-3 bg-white px-3 py-3">
          {logo ? <img src={logo} alt="" className="max-h-9 max-w-[180px] object-contain" /> : <b className="text-sm">{identity.name}</b>}
          <span className="rounded-lg px-3 py-1.5 text-xs font-bold text-white" style={{ background: primary }}>WhatsApp</span>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-gray-200">
        <p className="bg-gray-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Rodapé</p>
        <div className="flex items-center gap-3 px-3 py-3" style={{ background: dark }}>
          {footerLogo ? <img src={footerLogo} alt="" className="max-h-9 max-w-[180px] object-contain" /> : <b className="text-sm text-white">{identity.name}</b>}
          <span className="text-[11px] text-white/70">© {new Date().getFullYear()} {identity.name}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Aba do navegador</span>
        <span className="flex items-center gap-1.5 rounded-t-md border border-b-0 border-gray-200 bg-gray-50 px-2 py-1 text-[11px] text-gray-700">
          {favicon ? <img src={favicon} alt="" className="h-4 w-4 rounded-sm" /> : <span className="h-4 w-4 rounded-sm bg-gray-300" />}{identity.name}
        </span>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Botões</span>
        <span className="rounded-lg px-3 py-1.5 text-xs font-bold text-white" style={{ background: primary }}>Ver carros</span>
        <span className="rounded-lg px-3 py-1.5 text-xs font-bold text-white" style={{ background: dark }}>Ver estoque</span>
      </div>
    </div>
  )
}

export function BrandingSection({ identity, canManage, onApply }: { identity: Identity; canManage: boolean; onApply: (patch: Partial<Identity>) => void }) {
  const [busy, setBusy] = useState<'analyze' | 'apply' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [result, setResult] = useState<AnalyzedBrand | null>(null)
  const [primary, setPrimary] = useState(identity.primaryColor)
  const [dark, setDark] = useState(identity.darkColor)
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handle = async (file: File | undefined) => {
    if (!file) return
    setBusy('analyze'); setErr(null); setDone(null)
    try {
      const r = await analyzeLogo(file, identity.name)
      setResult(r); setPrimary(r.suggestion.primary); setDark(r.suggestion.dark)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Não foi possível analisar a imagem.') } finally { setBusy(null) }
  }

  const apply = async () => {
    if (!result) return
    setBusy('apply'); setErr(null)
    try {
      const [logoUrl, footerLogoUrl, faviconUrl] = await Promise.all([
        upload(result.logo, 'LOGO'),
        result.light ? upload(result.light, 'LOGO_LIGHT') : Promise.resolve(''),
        upload(result.favicon, 'FAVICON'),
      ])
      onApply({ logoUrl, footerLogoUrl, faviconUrl, primaryColor: primary, darkColor: dark })
      setResult(null)
      setDone('Marca aplicada. Clique em “Salvar site” para publicar.')
    } catch (e) { setErr(e instanceof Error ? e.message : 'Falha ao aplicar.') } finally { setBusy(null) }
  }

  const contrast = Math.round(contrastRatio([255, 255, 255], parseHex(primary)) * 10) / 10
  const logoShown = result?.logoPreview ?? identity.logoUrl
  const footerShown = result ? (result.lightPreview ?? result.logoPreview) : (identity.footerLogoUrl || identity.logoUrl)
  const faviconShown = result?.faviconPreview ?? identity.faviconUrl

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900"><Sparkles size={15} className="text-brand-600" />Marca da loja</h2>
      <p className="mb-3 text-xs text-gray-500">Envie a logo e o site se configura sozinho: cores, versão para fundo escuro e ícone da aba. Você confere e aplica.</p>

      {canManage && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void handle(e.dataTransfer.files?.[0]) }}
          className={cn('flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition', drag ? 'border-brand-400 bg-brand-50' : 'border-gray-200 bg-gray-50/60')}
        >
          {busy === 'analyze' ? <Loader2 size={26} className="animate-spin text-brand-600" /> : <ImagePlus size={26} className="text-gray-400" />}
          <p className="text-sm text-gray-700"><b>Arraste a logo aqui</b> ou</p>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy} className="btn-secondary text-xs">Escolher arquivo</button>
          <p className="text-[11px] text-gray-400">PNG com fundo transparente é o ideal · também aceita JPG, WebP e SVG · até 8 MB</p>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => { void handle(e.target.files?.[0]); e.target.value = '' }} />
        </div>
      )}
      {err && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>}
      {done && <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700"><CheckCircle2 size={14} />{done}</p>}

      {result && (
        <div className="mt-4 space-y-3 rounded-xl border border-brand-200 bg-brand-50/40 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-800"><Wand2 size={14} />Pronto! Veja como fica:</p>
          <ul className="list-disc space-y-0.5 pl-5 text-[11px] text-gray-600">
            {result.removedBackground && <li>Removemos o fundo branco da logo.</li>}
            <li>Recortamos as sobras e ajustamos o tamanho ({result.width}×{result.height}px).</li>
            {result.light && <li>Criamos uma versão branca da logo para o rodapé escuro.</li>}
            <li>Geramos o ícone da aba do navegador.</li>
          </ul>
          {result.suggestion.warnings.map((w) => <p key={w} className="flex items-start gap-1.5 text-[11px] text-amber-800"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{w}</p>)}
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[260px_1fr]">
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-xs font-medium text-gray-600">Cor principal <span className="text-gray-400">(botões e destaques)</span></p>
            <div className="flex items-center gap-2">
              <input type="color" disabled={!canManage} value={primary} onChange={(e) => { setPrimary(e.target.value); if (!result) onApply({ primaryColor: e.target.value }) }} className="h-9 w-14 rounded border border-gray-200" />
              <span className="font-mono text-xs text-gray-500">{primary}</span>
              <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', contrast >= 4.5 ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700')} title="Contraste do texto branco sobre a cor (WCAG)">
                {contrast >= 4.5 ? `Legível ${contrast}:1` : `Pouco contraste ${contrast}:1`}
              </span>
            </div>
            {result && result.suggestion.palette.length > 1 && (
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <span className="text-[10px] text-gray-400">Cores da sua logo:</span>
                {result.suggestion.palette.map((c) => (
                  <button key={c} type="button" onClick={() => setPrimary(c)} title={c} className={cn('h-5 w-5 rounded-full border-2', primary === c ? 'border-gray-900' : 'border-white shadow')} style={{ background: c }} />
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-gray-600">Cor escura <span className="text-gray-400">(rodapé e faixas)</span></p>
            <div className="flex items-center gap-2">
              <input type="color" disabled={!canManage} value={dark} onChange={(e) => { setDark(e.target.value); if (!result) onApply({ darkColor: e.target.value }) }} className="h-9 w-14 rounded border border-gray-200" />
              <span className="font-mono text-xs text-gray-500">{dark}</span>
            </div>
          </div>
          {canManage && result && (
            <div className="flex gap-2">
              <button type="button" onClick={() => void apply()} disabled={!!busy} className="btn-primary text-sm">{busy === 'apply' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}Aplicar marca</button>
              <button type="button" onClick={() => { setResult(null); setPrimary(identity.primaryColor); setDark(identity.darkColor) }} className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">Descartar</button>
            </div>
          )}
          {canManage && !result && identity.logoUrl && (
            <button type="button" onClick={() => onApply({ logoUrl: '', footerLogoUrl: '', faviconUrl: '' })} className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-600"><Trash2 size={12} />Remover logo (usar o nome da loja em texto)</button>
          )}
        </div>
        <Preview identity={identity} logo={logoShown} footerLogo={footerShown} favicon={faviconShown} primary={primary} dark={dark} />
      </div>
    </section>
  )
}
