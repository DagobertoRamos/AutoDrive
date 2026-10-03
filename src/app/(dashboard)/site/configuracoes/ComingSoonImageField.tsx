'use client'
/* eslint-disable @next/next/no-img-element -- imagem da loja */

// Imagem mostrada no site para carro sem fotos novas ("Em breve" / aguardando fotos).

import { useState } from 'react'
import { ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { EM_BREVE_IMG } from '@/components/site/SiteVehicleImage'

export function ComingSoonImageField({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (url: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function pick(file: File | undefined) {
    if (!file) return
    setBusy(true); setErr('')
    try {
      const fd = new FormData()
      fd.append('file', file, file.name)
      fd.append('kind', 'IMAGE')
      const r = await fetch('/api/site-admin/assets', { method: 'POST', body: fd, credentials: 'include' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error ?? 'Falha ao enviar a imagem.')
      onChange(j.data.url as string)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-start gap-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <img src={value || EM_BREVE_IMG} alt="Imagem de aguardando fotos" className="h-24 w-40 rounded-md border border-gray-200 bg-white object-cover" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-sm font-medium text-gray-800">Imagem de “aguardando fotos”</p>
        <p className="text-xs text-gray-500">JPG, PNG ou WebP · até 2 MB · 16:9</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 ${disabled || busy ? 'pointer-events-none opacity-60' : ''}`}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />} Enviar imagem
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={disabled || busy} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          {value && !disabled && (
            <button type="button" onClick={() => onChange('')} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-red-600"><Trash2 size={12} />Usar a padrão</button>
          )}
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    </div>
  )
}
