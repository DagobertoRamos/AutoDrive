'use client'

// =============================================================================
// Pacote para anúncio: baixa um .zip com as fotos prontas (tratadas e, se
// quiser, com a identidade da loja e o WhatsApp), o vídeo vertical do carro
// (com música livre opcional) e os textos para Facebook Marketplace, grupos,
// WhatsApp e Instagram. Cada arquivo vem separado e o .zip é fechado aqui.
// =============================================================================

import { useState } from 'react'
import { CheckCircle2, Circle, Download, Loader2, Package, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api, Drawer, inputCls } from '@/components/publications/ui'
import { buildZipBrowser, type BrowserZipEntry } from '@/lib/publications/zip-browser'
import { MOOD_LABEL, MUSIC_MOODS, type MusicMood } from '@/lib/publications/social/music-core'

type Step = { label: string; state: 'wait' | 'run' | 'ok' | 'err'; note?: string }

async function getBytes(url: string, init?: RequestInit): Promise<Uint8Array> {
  const r = await fetch(url, { credentials: 'include', ...init })
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j?.error ?? `Falha (${r.status}).`) }
  return new Uint8Array(await r.arrayBuffer())
}

/** Baixa o vídeo em partes (Range) e junta. */
async function getVideo(assetId: string, size: number, onProgress: (p: number) => void): Promise<Uint8Array> {
  const out = new Uint8Array(size)
  let pos = 0
  while (pos < size) {
    const r = await fetch(`/api/publications/package/file?asset=${assetId}`, { credentials: 'include', headers: { Range: `bytes=${pos}-` } })
    if (r.status !== 206) throw new Error('Não foi possível baixar o vídeo.')
    const chunk = new Uint8Array(await r.arrayBuffer())
    if (!chunk.length) throw new Error('Vídeo incompleto.')
    out.set(chunk, pos); pos += chunk.length
    onProgress(Math.round((pos / size) * 100))
  }
  return out
}

export function AdPackageButton({ vehicleId, title, className }: { vehicleId: string; title: string; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn('inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline', className)} title="Baixar fotos tratadas, vídeo e textos para Marketplace e grupos">
        <Package size={12} />Pacote para anúncio
      </button>
      {open && <AdPackageDialog vehicleId={vehicleId} title={title} onClose={() => setOpen(false)} />}
    </>
  )
}

export function AdPackageDialog({ vehicleId, title, onClose }: { vehicleId: string; title: string; onClose: () => void }) {
  const [treat, setTreat] = useState(true)
  const [brand, setBrand] = useState<'' | 'DISCRETO' | 'COMPLETO'>('COMPLETO')
  const [video, setVideo] = useState(true)
  const [music, setMusic] = useState(true)
  const [mood, setMood] = useState<MusicMood>('ANIMADA')
  const [steps, setSteps] = useState<Step[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const run = async () => {
    setBusy(true); setDone(null)
    const list: Step[] = [{ label: 'Textos (Marketplace, grupos, WhatsApp, Instagram)', state: 'run' }, { label: 'Fotos', state: 'wait' }, ...(video ? [{ label: 'Vídeo vertical (pode levar até 1 minuto)', state: 'wait' as const }] : []), { label: 'Montando o .zip', state: 'wait' }]
    const set = (i: number, x: Partial<Step>) => { list[i] = { ...list[i], ...x }; setSteps([...list]) }
    setSteps([...list])
    try {
      const m = (await api(`/api/publications/package/${vehicleId}`)).data as { base: string; photos: number; texts: Record<string, string> }
      const enc = new TextEncoder()
      const files: BrowserZipEntry[] = Object.entries(m.texts).map(([name, text]) => ({ name: `${m.base}/${name}`, data: enc.encode(text.replace(/\n/g, '\r\n')) }))
      set(0, { state: 'ok' })
      set(1, { state: 'run', note: `0 de ${m.photos}` })
      for (let i = 0; i < m.photos; i++) {
        const q = new URLSearchParams({ i: String(i), treat: treat ? '1' : '0', ...(brand ? { brand } : {}) })
        files.push({ name: `${m.base}/fotos/${String(i + 1).padStart(2, '0')}.jpg`, data: await getBytes(`/api/publications/package/${vehicleId}/photo?${q}`) })
        set(1, { note: `${i + 1} de ${m.photos}` })
      }
      set(1, { state: 'ok' })
      let k = 2
      if (video) {
        set(k, { state: 'run', note: 'gerando…' })
        const v = await api(`/api/publications/package/${vehicleId}/video`, { method: 'POST', json: { template: 'OFERTA', music: music ? { mode: 'AUTO', mood } : null } })
        files.push({ name: `${m.base}/video/${m.base}.mp4`, data: await getVideo(v.assetId, v.size, (p) => set(k, { note: `baixando ${p}%` })) })
        set(k, { state: 'ok', note: `${v.seconds} s${v.music ? ' · com música livre' : ''}` })
        k++
      }
      set(k, { state: 'run' })
      const zip = buildZipBrowser(files)
      const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }))
      const a = document.createElement('a'); a.href = url; a.download = `${m.base}.zip`; document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
      set(k, { state: 'ok', note: `${(zip.length / 1_048_576).toFixed(1)} MB` })
      setDone(`${m.base}.zip`)
    } catch (e) {
      const i = list.findIndex((s) => s.state === 'run')
      if (i >= 0) set(i, { state: 'err', note: (e as Error).message })
    } finally { setBusy(false) }
  }

  return (
    <Drawer open onClose={() => !busy && onClose()} title="Pacote para anúncio" subtitle={title}>
      <div className="space-y-4 text-sm">
        <p className="text-xs text-gray-600">Um .zip com tudo para anunciar no <b>Facebook Marketplace</b>, em <b>grupos de compra e venda</b>, OLX e WhatsApp: fotos prontas, vídeo vertical e os textos.</p>
        <fieldset className="space-y-2 rounded-xl border border-gray-200 p-3" disabled={busy}>
          <legend className="px-1 text-xs font-semibold text-gray-700">Fotos</legend>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={treat} onChange={(e) => setTreat(e.target.checked)} />Tratar as fotos (luz, contraste, cor e nitidez)</label>
          <label className="block text-xs text-gray-600">Identidade da loja nas fotos
            <select className={inputCls} value={brand} onChange={(e) => setBrand(e.target.value as typeof brand)}>
              <option value="COMPLETO">Com as cores da loja, logo, nome e WhatsApp</option>
              <option value="DISCRETO">Só o logo no canto</option>
              <option value="">Sem identidade (foto limpa)</option>
            </select>
          </label>
          <p className="text-[11px] text-gray-500">No Marketplace, fotos limpas ou com o logo discreto costumam ir melhor; nos grupos, a faixa com o WhatsApp ajuda o contato.</p>
        </fieldset>
        <fieldset className="space-y-2 rounded-xl border border-gray-200 p-3" disabled={busy}>
          <legend className="px-1 text-xs font-semibold text-gray-700">Vídeo</legend>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={video} onChange={(e) => setVideo(e.target.checked)} />Incluir o vídeo vertical (gancho, fotos com as informações, preço e WhatsApp)</label>
          {video && (
            <label className="flex flex-wrap items-center gap-2 text-xs"><input type="checkbox" checked={music} onChange={(e) => setMusic(e.target.checked)} />Com música livre (sem direito autoral)
              {music && <select className={cn(inputCls, 'w-auto py-1 text-xs')} value={mood} onChange={(e) => setMood(e.target.value as MusicMood)}>{MUSIC_MOODS.map((x) => <option key={x} value={x}>{MOOD_LABEL[x]}</option>)}</select>}
            </label>
          )}
        </fieldset>
        {steps && (
          <ul className="space-y-1 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-2">
                {s.state === 'ok' ? <CheckCircle2 size={14} className="text-green-600" /> : s.state === 'run' ? <Loader2 size={14} className="animate-spin text-brand-700" /> : s.state === 'err' ? <XCircle size={14} className="text-red-600" /> : <Circle size={14} className="text-gray-300" />}
                <span className={cn(s.state === 'err' && 'text-red-700')}>{s.label}{s.note ? ` — ${s.note}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
        {done && <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">Pronto! <b>{done}</b> foi baixado. Abra a pasta e use os textos do arquivo <b>marketplace.txt</b> e <b>grupos-facebook.txt</b>.</p>}
        <button type="button" onClick={() => void run()} disabled={busy} className="btn-primary w-full justify-center px-4 py-2 text-sm">{busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}{busy ? 'Preparando o pacote…' : 'Gerar e baixar o pacote (.zip)'}</button>
      </div>
    </Drawer>
  )
}
