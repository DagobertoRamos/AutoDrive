'use client'
/* eslint-disable @next/next/no-img-element -- miniaturas locais e fotos da loja */

// =============================================================================
// Painel de fotos do veículo (estoque): enviar várias (arrastar ou escolher,
// comprimidas no navegador), reordenar arrastando (ou setas, no celular),
// escolher a principal e excluir. Com a 1ª foto o carro sai do "Em breve" e
// é publicado no site da loja.
// =============================================================================

import { useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Camera, Globe, ImagePlus, Loader2, Star, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { compressPhoto } from '@/lib/stock/photo-compress'

export interface VehiclePhotoItem { id: string; url: string; isMain: boolean; order: number; caption?: string | null }

interface Props {
  vehicleId: string
  photos: VehiclePhotoItem[]
  onChange: (photos: VehiclePhotoItem[], mainPhotoUrl: string | null) => void
}

export function VehiclePhotosManager({ vehicleId, photos, onChange }: Props) {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [err, setErr] = useState<string[]>([])
  const [drag, setDrag] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const sorted = [...photos].sort((a, b) => a.order - b.order)

  const apply = (data: { photos: VehiclePhotoItem[]; mainPhotoUrl: string | null }) => onChange(data.photos, data.mainPhotoUrl)

  const upload = async (list: FileList | File[]) => {
    const files = [...list].filter((f) => f.type.startsWith('image/') || /\.hei[cf]$/i.test(f.name))
    if (!files.length) return
    setBusy(true); setErr([]); setProgress({ done: 0, total: files.length })
    const problems: string[] = []
    // Envia em lotes de 4 (comprime no navegador antes).
    for (let i = 0; i < files.length; i += 4) {
      const batch = files.slice(i, i + 4)
      const fd = new FormData()
      for (const f of batch) {
        try { fd.append('files', await compressPhoto(f), f.name.replace(/\.[^.]+$/, '') + '.webp') }
        catch (e) { problems.push(`${f.name}: ${e instanceof Error ? e.message : 'não foi possível ler'}`) }
      }
      if (fd.getAll('files').length) {
        const r = await fetch(`/api/vehicles/${vehicleId}/photos`, { method: 'POST', body: fd, credentials: 'include' })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) problems.push(j?.error ?? 'Falha no envio.')
        else { apply(j.data); problems.push(...(j.rejected ?? [])) }
      }
      setProgress({ done: Math.min(files.length, i + batch.length), total: files.length })
    }
    setErr(problems); setBusy(false); setProgress(null)
  }

  const patch = async (body: { order?: string[]; mainId?: string }) => {
    setBusy(true)
    const r = await fetch(`/api/vehicles/${vehicleId}/photos`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'include' })
    const j = await r.json().catch(() => ({}))
    if (r.ok) apply(j.data); else setErr([j?.error ?? 'Não foi possível salvar.'])
    setBusy(false)
  }

  const remove = async (id: string) => {
    if (!confirm('Excluir esta foto?')) return
    setBusy(true)
    const r = await fetch(`/api/vehicles/${vehicleId}/photos?photoId=${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' })
    const j = await r.json().catch(() => ({}))
    if (r.ok) apply(j.data); else setErr([j?.error ?? 'Não foi possível excluir.'])
    setBusy(false)
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= sorted.length || from === to) return
    const ids = sorted.map((p) => p.id)
    const [x] = ids.splice(from, 1)
    ids.splice(to, 0, x)
    void patch({ order: ids })
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { if (!dragId) { e.preventDefault(); setDrag(true) } }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { if (dragId) return; e.preventDefault(); setDrag(false); void upload(e.dataTransfer.files) }}
        className={cn('flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition', drag ? 'border-brand-400 bg-brand-50' : 'border-gray-200 bg-gray-50/60')}
      >
        {busy && progress ? <Loader2 size={26} className="animate-spin text-brand-600" /> : <ImagePlus size={26} className="text-gray-400" />}
        <p className="text-sm text-gray-700">{progress ? `Enviando ${progress.done} de ${progress.total}…` : <><b>Arraste as fotos aqui</b> ou</>}</p>
        {!progress && <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="btn-secondary text-xs"><Camera size={13} />Escolher fotos</button>}
        <p className="text-[11px] text-gray-400">Várias de uma vez · JPG, PNG ou WebP · reduzimos o tamanho automaticamente · até 40 fotos</p>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files) void upload(e.target.files); e.target.value = '' }} />
      </div>

      {err.length > 0 && <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{err.map((m) => <p key={m}>{m}</p>)}</div>}

      <p className="flex items-center gap-1.5 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">
        <Globe size={13} />
        {sorted.length ? 'Com fotos, este carro aparece publicado no site da loja. A foto marcada como Capa é a principal do anúncio.' : 'Sem fotos, o carro aparece no site como “Em breve”. Envie as fotos para publicá-lo.'}
      </p>

      {sorted.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {sorted.map((p, i) => (
            <li key={p.id}
              draggable={!busy}
              onDragStart={(e) => { setDragId(p.id); e.dataTransfer.effectAllowed = 'move' }}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverId(p.id) } }}
              onDragEnd={() => { setDragId(null); setOverId(null) }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragId && dragId !== p.id) move(sorted.findIndex((x) => x.id === dragId), i)
                setDragId(null); setOverId(null)
              }}
              className={cn('group relative overflow-hidden rounded-xl border-2 bg-gray-100', p.isMain ? 'border-amber-400' : 'border-transparent', overId === p.id && dragId !== p.id && 'ring-2 ring-brand-400', dragId === p.id && 'opacity-50', !busy && 'cursor-grab')}
            >
              <img src={p.url} alt={`Foto ${i + 1}`} className="aspect-[4/3] w-full object-cover" loading="lazy" />
              <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">{i + 1}</span>
              {p.isMain && <span className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-amber-950"><Star size={10} />Capa</span>}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                <div className="flex gap-1">
                  <button type="button" onClick={() => move(i, i - 1)} disabled={busy || i === 0} className="rounded bg-white/90 p-1 text-gray-700 disabled:opacity-30" aria-label="Mover para a esquerda"><ArrowLeft size={12} /></button>
                  <button type="button" onClick={() => move(i, i + 1)} disabled={busy || i === sorted.length - 1} className="rounded bg-white/90 p-1 text-gray-700 disabled:opacity-30" aria-label="Mover para a direita"><ArrowRight size={12} /></button>
                </div>
                <div className="flex gap-1">
                  {!p.isMain && <button type="button" onClick={() => void patch({ mainId: p.id })} disabled={busy} className="rounded bg-white/90 p-1 text-amber-600" aria-label="Definir como capa" title="Definir como capa"><Star size={12} /></button>}
                  <button type="button" onClick={() => void remove(p.id)} disabled={busy} className="rounded bg-white/90 p-1 text-red-600" aria-label="Excluir foto"><Trash2 size={12} /></button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
