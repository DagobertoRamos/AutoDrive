'use client'
/* eslint-disable @next/next/no-img-element -- fotos privadas servidas pela API do painel */

// Fotos que o cliente enviou pelo site ("Venda seu carro"). Só aparece quando
// há fotos; clique abre a foto inteira. Acesso = mesmo acesso do lead no CRM.
import { useEffect, useState } from 'react'
import { Camera } from 'lucide-react'

export function SiteLeadPhotos({ leadId }: { leadId: string }) {
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>([])
  useEffect(() => {
    let alive = true
    fetch(`/api/site-admin/lead-photos?leadId=${encodeURIComponent(leadId)}`, { credentials: 'include' })
      .then((r) => r.json()).then((j) => { if (alive && Array.isArray(j?.data)) setPhotos(j.data) }).catch(() => {})
    return () => { alive = false }
  }, [leadId])
  if (!photos.length) return null
  return (
    <section className="mb-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white"><Camera size={14} />Fotos enviadas pelo cliente ({photos.length})</h3>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {photos.map((p, i) => (
          <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block aspect-[4/3] overflow-hidden rounded-lg bg-gray-100">
            <img src={p.url} alt={`Foto ${i + 1} do carro do cliente`} className="h-full w-full object-cover transition hover:scale-105" loading="lazy" />
          </a>
        ))}
      </div>
    </section>
  )
}
