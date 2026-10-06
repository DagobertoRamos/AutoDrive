'use client'

// =============================================================================
// Aba Cautelar da ficha do veículo — perícia com laudo anexado.
// A pendência "Perícia" só é resolvida com status (pendente vale; "sem perícia"
// não) E pelo menos um laudo (PDF/imagem), aqui ou na aba Pendências.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Loader2, Save, ShieldAlert } from 'lucide-react'
import { inspectionReady } from '@/lib/stock/prep-core'
import { VehicleFilesField, type VFile } from './VehicleFilesField'
import { HelpHint } from '@/components/ui/help-hint'
import { opsHint } from '@/lib/glossary-ops'

const OPTS = [
  ['SEM_CAUTELAR', 'Sem perícia'], ['PENDENTE', 'Pendente (laudo em andamento)'], ['APROVADA', 'Aprovada'],
  ['COM_APONTAMENTO', 'Com apontamento'], ['REPROVADA', 'Reprovada'],
] as const

export function CautelarPanel({ vehicleId, cautelarStatus, cautelarNumber, cautelarNotes, originEvaluationId, canEdit, onSaved }: {
  vehicleId: string; cautelarStatus: string; cautelarNumber: string | null; cautelarNotes: string | null
  originEvaluationId?: string | null
  canEdit: boolean; onSaved: () => void | Promise<void>
}) {
  const [evaluationLaudos, setEvaluationLaudos] = useState<Array<{ id: string; url: string; fileName: string }>>([])
  const [status, setStatus] = useState(cautelarStatus || 'SEM_CAUTELAR')
  const [number, setNumber] = useState(cautelarNumber ?? '')
  const [notes, setNotes] = useState(cautelarNotes ?? '')
  const [files, setFiles] = useState<VFile[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)

  const loadFiles = useCallback(async () => {
    const j = await fetch(`/api/vehicles/${vehicleId}/files?kind=LAUDO_CAUTELAR`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null)
    if (j?.success) setFiles(j.data)
  }, [vehicleId])
  useEffect(() => { const t = setTimeout(() => void loadFiles(), 0); return () => clearTimeout(t) }, [loadFiles])
  // Laudos que subiram na avaliação de origem também contam (mesma regra do servidor:
  // só a avaliação que deu entrada no carro, não outras com a mesma placa).
  useEffect(() => {
    if (!originEvaluationId) { setEvaluationLaudos([]); return }
    fetch(`/api/vehicles/${vehicleId}/documents?type=LAUDO_CAUTELAR`, { cache: 'no-store' }).then((r) => r.json())
      .then((j) => setEvaluationLaudos((Array.isArray(j?.data) ? j.data : []).filter((d: { category?: string; publicUrl?: string | null; source?: string; sourceId?: string }) =>
        d.category === 'LAUDO_CAUTELAR' && d.publicUrl && d.source === 'EVALUATION' && d.sourceId === originEvaluationId)
        .map((d: { id: string; publicUrl: string; fileName: string }) => ({ id: d.id, url: d.publicUrl, fileName: d.fileName }))))
      .catch(() => undefined)
  }, [vehicleId, originEvaluationId])

  const ready = inspectionReady(cautelarStatus, files.length + evaluationLaudos.length)

  async function save() {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch(`/api/vehicles/${vehicleId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cautelarStatus: status, cautelarNumber: number, cautelarNotes: notes }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.success) throw new Error(j.error ?? 'Falha ao salvar.')
      setMsg({ ok: true, t: 'Perícia salva.' })
      await onSaved()
    } catch (e) { setMsg({ ok: false, t: (e as Error).message }) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${ready.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
        {ready.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <ShieldAlert size={16} className="mt-0.5 shrink-0" />}
        <span>{ready.ok ? 'Perícia registrada com laudo.' : `Falta: ${ready.missing.join(' e ')}.`}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-medium text-gray-600"><span className="inline-flex items-center gap-1">Status da perícia <HelpHint {...opsHint('PERICIA')} /></span>
          <select value={status} disabled={!canEdit} onChange={(e) => setStatus(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
            {OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="block text-xs font-medium text-gray-600">Número do laudo
          <input value={number} disabled={!canEdit} onChange={(e) => setNumber(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" maxLength={60} />
        </label>
        <label className="block text-xs font-medium text-gray-600 sm:col-span-3">Observações / apontamentos
          <textarea rows={2} value={notes} disabled={!canEdit} onChange={(e) => setNotes(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </label>
      </div>
      {canEdit && (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void save()} disabled={busy} className="btn-primary px-3 py-1.5 text-xs">{busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Salvar perícia</button>
          {msg && <span className={`text-xs ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.t}</span>}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 p-3">
        <p className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-gray-900">Laudo cautelar <HelpHint title="Laudo cautelar" text="Arquivo (PDF ou foto) do laudo da perícia. A pendência de perícia só é resolvida com o status preenchido e pelo menos um laudo anexado." /></p>
        <VehicleFilesField vehicleId={vehicleId} kind="LAUDO_CAUTELAR" files={files} canEdit={canEdit} onChange={async () => { await loadFiles(); await onSaved() }} />
        {evaluationLaudos.length > 0 && (
          <p className="mt-2 text-xs text-gray-500">
            Anexados na avaliação: {evaluationLaudos.map((l, i) => <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">{i ? ', ' : ''}{l.fileName}</a>)}
          </p>
        )}
      </div>
    </div>
  )
}
