'use client'

// =============================================================================
// Parceiros do feed — só aparece na loja que importa estoque do site antigo
// (hoje só a AutoDrive Veículos). Pausar um parceiro para de criar/atualizar os
// carros dele e tira os que estão no ar do site e dos anúncios.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { HelpHint } from '@/components/ui/help-hint'

interface FeedPartner { ref: string; name: string; city: string | null; onSite: number; total: number; blocked: boolean; blockedAt: string | null }

const fetchPartners = () => fetch('/api/site-admin/feed-partners', { credentials: 'include' }).then((r) => r.json()).catch(() => null)

export function FeedPartnersSection({ canManage }: { canManage: boolean }) {
  const [partners, setPartners] = useState<FeedPartner[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const apply = useCallback((j: { data?: { enabled: boolean; partners: FeedPartner[] } } | null) => {
    setPartners(j?.data?.enabled ? j.data.partners : null)
  }, [])
  useEffect(() => {
    let alive = true
    void fetchPartners().then((j) => { if (alive) apply(j) })
    return () => { alive = false }
  }, [apply])

  if (!partners) return null

  const toggle = async (p: FeedPartner) => {
    const block = !p.blocked
    if (block && !window.confirm(`Pausar ${p.name}?\n\n${p.onSite ? `${p.onSite} carro(s) saem do site e dos anúncios agora.` : 'Nenhum carro dele está no site agora.'} Carros novos ou alterados desse parceiro deixam de ser importados até você reativar.`)) return
    setBusy(p.ref); setMsg(null)
    try {
      const r = await fetch('/api/site-admin/feed-partners', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ ref: p.ref, blocked: block }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg({ ok: false, text: j?.error ?? 'Falha ao atualizar.' }); return }
      setPartners(j.data.partners)
      setMsg({ ok: true, text: block ? `${p.name} pausado${j.data.deactivated ? `: ${j.data.deactivated} carro(s) retirados` : ''}.` : `${p.name} reativado: os carros voltam em alguns minutos.` })
    } catch { setMsg({ ok: false, text: 'Erro de rede.' }) } finally { setBusy(null) }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-card">
      <h2 className="flex items-center gap-1 text-sm font-semibold text-gray-900">
        Parceiros do estoque importado
        <HelpHint title="Parceiros do estoque importado" text="Lojas parceiras cujos carros chegam pela importação do site antigo. Pausado, o parceiro para de atualizar no sistema e no site: os carros dele saem do ar e dos anúncios. Carros em negociação ou vendidos não são mexidos. Ao reativar, os carros voltam na próxima importação." />
      </h2>
      <p className="mb-3 text-xs text-gray-500">Pause um parceiro para parar de atualizar os carros dele no sistema e no site.</p>
      {partners.length === 0
        ? <p className="text-sm text-gray-500">Nenhum parceiro no estoque importado.</p>
        : (
          <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
            {partners.map((p) => (
              <div key={p.ref} className={cn('flex flex-wrap items-center justify-between gap-2 px-3 py-2', p.blocked && 'bg-gray-50')}>
                <div className="min-w-0">
                  <p className={cn('truncate text-sm font-medium', p.blocked ? 'text-gray-500' : 'text-gray-800')}>{p.name}{p.city && <span className="ml-1 text-xs font-normal text-gray-400">{p.city}</span>}</p>
                  <p className="text-xs text-gray-500">
                    {p.blocked
                      ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">Pausado{p.blockedAt ? ` desde ${new Date(p.blockedAt).toLocaleDateString('pt-BR')}` : ''}</span>
                      : `${p.onSite} no site · ${p.total} importado(s)`}
                  </p>
                </div>
                {canManage && (
                  <button onClick={() => void toggle(p)} disabled={busy !== null}
                    className={cn('rounded-md border px-2.5 py-1 text-xs font-medium disabled:opacity-50', p.blocked ? 'border-brand-200 text-brand-700 hover:bg-brand-50' : 'border-gray-200 text-gray-700 hover:bg-gray-50')}>
                    {busy === p.ref ? 'Aguarde…' : p.blocked ? 'Reativar' : 'Pausar'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      {msg && <p className={cn('mt-2 text-xs', msg.ok ? 'text-green-700' : 'text-red-600')}>{msg.text}</p>}
    </section>
  )
}
