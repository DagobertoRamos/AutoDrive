'use client'
/* eslint-disable @next/next/no-img-element -- arquivos do veículo servidos por rota autenticada */

// =============================================================================
// Campo de arquivos do veículo (laudo, fotos do recebimento, comprovantes).
// Foto pela câmera (celular) ou arquivo; imagens são comprimidas no navegador.
// =============================================================================

import { useRef, useState } from 'react'
import { Camera, FileText, Loader2, Paperclip, Trash2 } from 'lucide-react'
import { compressPhoto } from '@/lib/stock/photo-compress'

export interface VFile { id: string; url: string; fileName: string; mimeType: string; refKey: string | null; createdAt?: string | Date; uploadedByName?: string | null }

export async function uploadVehicleFile(vehicleId: string, file: File, kind: string, refKey?: string | null): Promise<VFile> {
  const fd = new FormData()
  if (file.type.startsWith('image/') && !/hei[cf]/i.test(file.type)) {
    fd.append('file', await compressPhoto(file), file.name.replace(/\.[^.]+$/, '') + '.webp')
  } else {
    fd.append('file', file, file.name)
  }
  fd.append('kind', kind)
  if (refKey) fd.append('refKey', refKey)
  const r = await fetch(`/api/vehicles/${vehicleId}/files`, { method: 'POST', body: fd })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error ?? 'Falha ao enviar o arquivo.')
  return j.data as VFile
}

export function VehicleFilesField({ vehicleId, kind, refKey, files, onChange, canEdit, compact, accept = 'image/*,application/pdf' }: {
  vehicleId: string; kind: string; refKey?: string | null; files: VFile[]; onChange: () => void | Promise<void>
  canEdit: boolean; compact?: boolean; accept?: string
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const camRef = useRef<HTMLInputElement>(null)

  async function send(list: FileList | null) {
    if (!list?.length) return
    setBusy(true); setErr('')
    try {
      for (const f of Array.from(list)) await uploadVehicleFile(vehicleId, f, kind, refKey)
      await onChange()
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  async function remove(id: string) {
    if (!confirm('Remover este arquivo?')) return
    const r = await fetch(`/api/vehicles/${vehicleId}/files/${id}`, { method: 'DELETE' })
    if (r.ok) await onChange()
    else setErr((await r.json().catch(() => ({}))).error ?? 'Falha ao remover.')
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        {files.map((f) => (
          <div key={f.id} className={`group relative overflow-hidden rounded-lg border border-gray-200 bg-white ${compact ? 'h-14 w-16' : 'h-20 w-24'}`}>
            <a href={f.url} target="_blank" rel="noopener noreferrer" title={f.fileName} className="block h-full w-full">
              {f.mimeType.startsWith('image/')
                ? <img src={f.url} alt={f.fileName} className="h-full w-full object-cover" loading="lazy" />
                : <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-1 text-center text-[9px] text-gray-500"><FileText size={16} className="text-red-500" />{f.fileName.slice(0, 18)}</span>}
            </a>
            {canEdit && (
              <button type="button" onClick={() => void remove(f.id)} className="absolute right-0.5 top-0.5 hidden rounded bg-white/90 p-0.5 text-red-600 shadow group-hover:block" aria-label="Remover arquivo"><Trash2 size={11} /></button>
            )}
          </div>
        ))}
        {canEdit && (
          <div className={`flex ${compact ? 'h-14' : 'h-20'} gap-1`}>
            <button type="button" disabled={busy} onClick={() => camRef.current?.click()} className="flex w-14 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-gray-300 text-[10px] text-gray-500 hover:border-brand-500 hover:text-brand-700 disabled:opacity-50">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}Foto
            </button>
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="flex w-14 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-gray-300 text-[10px] text-gray-500 hover:border-brand-500 hover:text-brand-700 disabled:opacity-50">
              <Paperclip size={14} />Arquivo
            </button>
            <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void send(e.target.files); e.target.value = '' }} />
            <input ref={fileRef} type="file" accept={accept} multiple className="hidden" onChange={(e) => { void send(e.target.files); e.target.value = '' }} />
          </div>
        )}
      </div>
      {err && <p className="text-[11px] text-red-600">{err}</p>}
    </div>
  )
}
