'use client'

// Exclusão definitiva da loja (Painel MASTER): simula, mostra o que será
// apagado, pede o nome da loja e executa — tudo dentro da janela.

import { useEffect, useState } from 'react'
import { Loader2, Trash2, X } from 'lucide-react'

export default function DeleteTenantModal({ tenantId, tenantName, onClose, onDeleted }: { tenantId: string; tenantName: string; onClose: () => void; onDeleted: (message: string) => void }) {
  const [preview, setPreview] = useState<{ rows: number; files: number } | null>(null)
  const [stage, setStage] = useState<'loading' | 'ready' | 'deleting'>('loading')
  const [typed, setTyped] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    fetch(`/api/master/tenants/${tenantId}?dryRun=1`, { method: 'DELETE' })
      .then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => ({})) }))
      .then(({ ok, j }) => {
        if (!alive) return
        if (!ok) setError(j.error ?? 'Não foi possível simular a exclusão.')
        else setPreview(j.data)
        setStage('ready')
      })
      .catch(() => { if (alive) { setError('Erro de rede ao simular a exclusão.'); setStage('ready') } })
    return () => { alive = false }
  }, [tenantId])

  const matches = typed.trim().toLowerCase() === tenantName.trim().toLowerCase()

  const run = async () => {
    setStage('deleting'); setError('')
    try {
      const r = await fetch(`/api/master/tenants/${tenantId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmName: typed }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error ?? `Erro ao excluir (${r.status}).`); setStage('ready'); return }
      onDeleted(j.message ?? 'Loja excluída.')
    } catch {
      setError('Erro de rede. Confira a lista de lojas antes de tentar de novo.')
      setStage('ready')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && stage !== 'deleting') onClose() }}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between border-b border-red-100 bg-red-50 px-5 py-3">
          <h3 className="flex items-center gap-2 font-semibold text-red-700"><Trash2 size={16} />Excluir loja definitivamente</h3>
          {stage !== 'deleting' && <button type="button" onClick={onClose} className="rounded p-1 text-red-400 hover:bg-red-100" aria-label="Fechar"><X size={16} /></button>}
        </div>
        <div className="space-y-4 p-5 text-sm">
          <p className="font-medium text-gray-900">{tenantName}</p>
          {stage === 'loading' && <p className="flex items-center gap-2 text-gray-500"><Loader2 size={14} className="animate-spin" />Calculando o que será apagado…</p>}
          {preview && (
            <p className="rounded-lg bg-gray-50 p-3 text-gray-700">
              Serão apagados <strong>{preview.rows.toLocaleString('pt-BR')}</strong> registros (usuários, negociações, estoque, financeiro, documentos) e <strong>{preview.files}</strong> arquivo(s). Não há como desfazer.
            </p>
          )}
          {preview && (
            <label className="block text-xs font-medium text-gray-600">
              Digite <span className="font-mono text-red-700">{tenantName}</span> para confirmar
              <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} disabled={stage === 'deleting'} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
            </label>
          )}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button type="button" onClick={onClose} disabled={stage === 'deleting'} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancelar</button>
          <button type="button" onClick={() => void run()} disabled={!preview || !matches || stage !== 'ready'} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            {stage === 'deleting' ? <><Loader2 size={14} className="animate-spin" />Excluindo…</> : <><Trash2 size={14} />Excluir definitivamente</>}
          </button>
        </div>
      </div>
    </div>
  )
}
