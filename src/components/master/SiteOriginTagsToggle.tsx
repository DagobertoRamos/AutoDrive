'use client'
// MASTER: liga/desliga as etiquetas de origem dos carros no site desta loja.
import { useEffect, useState } from 'react'
import { HelpHint } from '@/components/ui/help-hint'

export default function SiteOriginTagsToggle({ tenantId }: { tenantId: string }) {
  const [on, setOn] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/master/tenants/${tenantId}/site-flags`).then((r) => r.json())
      .then((d) => setOn(!!d?.data?.originTags)).catch(() => setError('Não foi possível carregar.'))
  }, [tenantId])

  const toggle = async () => {
    if (on == null) return
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/master/tenants/${tenantId}/site-flags`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ originTags: !on }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Erro ao salvar')
      setOn(!!d.data.originTags)
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro ao salvar') } finally { setSaving(false) }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-2">
      <h2 className="font-semibold text-gray-800 text-sm">Site da loja</h2>
      <label className="flex items-center justify-between gap-3 text-sm text-gray-700">
        <span className="flex items-center">
          Etiquetas de origem nos carros
          <HelpHint className="ml-1" title="Etiquetas de origem" text="Mostra &quot;Lojista parceiro&quot; ou &quot;Particular intermediado&quot; nos carros do site. Carro de estoque próprio nunca leva etiqueta. Desligado por padrão." />
        </span>
        <button type="button" role="switch" aria-checked={!!on} disabled={on == null || saving} onClick={toggle}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-brand-600' : 'bg-gray-300'}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
