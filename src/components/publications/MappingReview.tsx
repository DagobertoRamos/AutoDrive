'use client'

// Revisão do de-para (marca/modelo/versão/cor) quando a correspondência não é
// exata. O sistema sugere; quem confirma é a loja — nunca troca a versão calado.
import { useEffect, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { api, Drawer, Empty, inputCls } from './ui'

interface Mapping { id: string; channelName: string; kindLabel: string; sourceLabel: string; sourceKey: string; candidates: Array<{ id: string; label: string; score: number }> | null }

export function MappingReview({ onClose, canConfirm }: { onClose: () => void; canConfirm: boolean }) {
  const [rows, setRows] = useState<Mapping[] | null>(null)
  const [pick, setPick] = useState<Record<string, string>>({})
  const [manual, setManual] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const load = () => api('/api/publications/mappings').then((j) => setRows(j.data)).catch((e) => setMsg((e as Error).message))
  useEffect(() => { void load() }, [])

  const confirmOne = async (m: Mapping) => {
    const c = (m.candidates ?? []).find((x) => x.id === pick[m.id])
    const targetId = c?.id ?? manual[m.id]?.trim()
    if (!targetId) return
    setBusy(m.id); setMsg(null)
    try { const j = await api('/api/publications/mappings', { method: 'PUT', json: { id: m.id, targetId, targetLabel: c?.label ?? targetId } }); setMsg(j.requeued ? `Confirmado. ${j.requeued} publicação(ões) reenviada(s).` : 'Confirmado.'); await load() } catch (e) { setMsg((e as Error).message) } finally { setBusy(null) }
  }

  return (
    <Drawer open onClose={onClose} title="Revisar correspondências" subtitle="Escolha o item equivalente em cada portal. A versão do veículo nunca é trocada sem confirmação.">
      {msg && <p role="status" className="mb-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">{msg}</p>}
      {!rows ? <Loader2 className="animate-spin text-gray-400" /> : !rows.length ? <Empty>Nenhuma correspondência pendente.</Empty> : (
        <ul className="space-y-3">
          {rows.map((m) => (
            <li key={m.id} className="rounded-xl border border-gray-200 p-3">
              <p className="text-xs text-gray-500">{m.channelName} · {m.kindLabel}</p>
              <p className="font-semibold text-gray-900">{m.sourceLabel}</p>
              <p className="text-[11px] text-gray-400">{m.sourceKey.replace(/\|/g, ' › ')}</p>
              <fieldset className="mt-2 space-y-1" disabled={!canConfirm}>
                <legend className="sr-only">Sugestões</legend>
                {(m.candidates ?? []).slice(0, 6).map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm"><input type="radio" name={`m-${m.id}`} checked={pick[m.id] === c.id} onChange={() => setPick((p) => ({ ...p, [m.id]: c.id }))} />{c.label}<span className="text-[10px] text-gray-400">{Math.round(c.score * 100)}%</span></label>
                ))}
                {!(m.candidates ?? []).length && <p className="text-xs text-gray-500">Sem sugestões do portal. Informe o código manualmente.</p>}
                <input className={inputCls} placeholder="Ou informe o código do portal" value={manual[m.id] ?? ''} onChange={(e) => { setManual((x) => ({ ...x, [m.id]: e.target.value })); setPick((p) => ({ ...p, [m.id]: '' })) }} />
              </fieldset>
              {canConfirm ? <button onClick={() => confirmOne(m)} disabled={busy === m.id || (!pick[m.id] && !manual[m.id])} className="btn-primary mt-2 px-3 py-1.5 text-xs">{busy === m.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}Confirmar</button> : <p className="mt-2 text-xs text-gray-500">Peça a um gestor para confirmar.</p>}
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  )
}
