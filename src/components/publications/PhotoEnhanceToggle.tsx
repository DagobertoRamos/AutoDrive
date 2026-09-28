'use client'

// Liga/desliga o tratamento automático das fotos (luz, contraste, cor e
// nitidez) — vale para artes, vídeos e fotos enviadas às redes e portais.
import { useEffect, useState } from 'react'
import { Wand2 } from 'lucide-react'
import { api } from '@/components/publications/ui'

export function PhotoEnhanceToggle({ onChanged }: { onChanged?: () => void }) {
  const [on, setOn] = useState<boolean | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { api('/api/publications/settings').then((j) => setOn(j.data.photoEnhance !== false)).catch(() => undefined) }, [])
  if (on === null) return null
  const change = async (v: boolean) => {
    setOn(v); setErr(null)
    try { await api('/api/publications/settings', { method: 'PUT', json: { photoEnhance: v } }); onChanged?.() } catch (e) { setOn(!v); setErr((e as Error).message) }
  }
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <label className="flex items-center gap-1.5" title="Clareia fotos escuras, recupera sombras, ajusta contraste e cor e dá nitidez. A foto original do estoque não muda.">
        <input type="checkbox" checked={on} onChange={(e) => void change(e.target.checked)} className="rounded border-gray-300 text-brand-600" />
        <Wand2 size={13} className="text-brand-700" />Tratar as fotos automaticamente (luz, contraste, cor e nitidez)
      </label>
      {err && <span className="text-red-700">{err}</span>}
    </span>
  )
}
