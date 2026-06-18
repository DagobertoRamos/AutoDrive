'use client'

// =============================================================================
// Marketing > Telefonia > Gravações — via /api/marketing/telephony/recordings.
// Tocar: /play (emite link assinado de curta duração) → <audio>. Arquivar no
// bucket próprio: /archive. Excluir (LGPD): /delete.
// Leitura: marketing.telephony.recordings | gestão: marketing.telephony.manage.
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Disc, Play, Trash2, RefreshCw, Archive } from 'lucide-react'
import { cn } from '@/lib/utils'

const MANAGE_ROLES = ['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO']
const dt = (s: string | null) => (s ? new Date(s).toLocaleString('pt-BR') : '—')
const dur = (n: number | null) => { if (n == null) return '—'; const m = Math.floor(n / 60); const s = n % 60; return `${m}:${String(s).padStart(2, '0')}` }
const mb = (n: number | null) => (n == null ? '—' : `${(n / 1048576).toFixed(1)} MB`)
const STATUS_CLS: Record<string, string> = { AVAILABLE: 'bg-green-100 text-green-700', PENDING: 'bg-amber-100 text-amber-700', BLOCKED: 'bg-red-100 text-red-600', EXPIRED: 'bg-gray-100 text-gray-500', DELETED: 'bg-gray-100 text-gray-400', FAILED: 'bg-red-100 text-red-600' }

interface Rec { id: string; callId: string; status: string; durationSec: number | null; sizeBytes: number | null; retentionUntil: string | null; createdAt: string; storageUrl?: string | null }

export default function TelephonyRecordingsPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role
  const canManage = !role || MANAGE_ROLES.includes(role)

  const [items, setItems] = useState<Rec[]>([])
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [player, setPlayer] = useState<{ id: string; url: string } | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const flash = (msg: string, ok: boolean) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 4000) }

  const load = useCallback(async () => {
    setLoading(true); setDenied(false)
    try {
      const res = await fetch('/api/marketing/telephony/recordings', { credentials: 'include' })
      if (res.status === 403) { setDenied(true); return }
      setItems((await res.json())?.data ?? [])
    } catch { /* noop */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const play = async (r: Rec) => {
    setBusy(r.id); setPlayer(null)
    try {
      const res = await fetch(`/api/marketing/telephony/recordings/${r.id}/play`, { credentials: 'include' })
      const j = await res.json()
      if (!res.ok) { flash(j?.error ?? 'Não foi possível tocar.', false); return }
      setPlayer({ id: r.id, url: j.data.url })
    } catch { flash('Erro de rede.', false) } finally { setBusy(null) }
  }
  const archive = async (r: Rec) => {
    setBusy(r.id)
    try {
      const res = await fetch(`/api/marketing/telephony/recordings/${r.id}/archive`, { method: 'POST', credentials: 'include' })
      const j = await res.json(); flash(res.ok ? (j.status === 'already_archived' ? 'Já arquivada.' : 'Arquivada no bucket.') : (j?.error ?? 'Falha ao arquivar.'), res.ok); await load()
    } catch { flash('Erro de rede.', false) } finally { setBusy(null) }
  }
  const remove = async (r: Rec) => {
    if (!confirm('Excluir esta gravação (LGPD)? A ação não pode ser desfeita.')) return
    setBusy(r.id)
    try {
      const res = await fetch(`/api/marketing/telephony/recordings/${r.id}/delete`, { method: 'POST', credentials: 'include' })
      flash(res.ok ? 'Gravação excluída.' : 'Falha ao excluir.', res.ok); if (player?.id === r.id) setPlayer(null); await load()
    } catch { flash('Erro de rede.', false) } finally { setBusy(null) }
  }

  if (denied) return <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Seu perfil não tem acesso às gravações.</div>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><Disc size={20} className="text-brand-600" />Gravações de Chamadas</h1>
          <p className="mt-0.5 text-sm text-gray-500">{loading ? 'Carregando...' : `${items.length} gravação(ões) — acesso auditado (LGPD)`}</p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary text-xs"><RefreshCw size={13} className={cn(loading && 'animate-spin')} />Atualizar</button>
      </div>

      {toast && <div className={cn('rounded-lg px-4 py-2 text-sm', toast.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600')}>{toast.msg}</div>}
      {player && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-3">
          <p className="mb-2 text-xs font-medium text-gray-600">Reproduzindo gravação (link expira em alguns minutos):</p>
          <audio controls autoPlay src={player.url} className="w-full" onError={() => flash('Não foi possível carregar o áudio (storage não configurado?).', false)} />
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50"><tr>{['Quando', 'Status', 'Duração', 'Tamanho', 'Retenção', 'Local', ''].map((h) => (<th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>))}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? Array.from({ length: 4 }).map((_, i) => (<tr key={i}>{Array.from({ length: 7 }).map((_, j) => (<td key={j} className="px-4 py-3"><div className="h-4 animate-pulse rounded bg-gray-200" /></td>))}</tr>))
              : items.length === 0 ? (<tr><td colSpan={7} className="py-14 text-center"><Disc size={30} className="mx-auto mb-2 text-gray-300" strokeWidth={1} /><p className="text-sm text-gray-400">Nenhuma gravação.</p></td></tr>)
              : items.map((r) => (
                <tr key={r.id} className={cn('hover:bg-gray-50', r.status === 'DELETED' && 'opacity-50')}>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">{dt(r.createdAt)}</td>
                  <td className="px-4 py-3"><span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_CLS[r.status] ?? 'bg-gray-100 text-gray-500')}>{r.status}</span></td>
                  <td className="px-4 py-3 tabular-nums text-gray-600">{dur(r.durationSec)}</td>
                  <td className="px-4 py-3 tabular-nums text-gray-500">{mb(r.sizeBytes)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{dt(r.retentionUntil)}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{r.storageUrl?.startsWith('s3://') ? 'bucket' : r.status === 'DELETED' ? '—' : 'provedor'}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {r.status === 'AVAILABLE' && <button onClick={() => play(r)} disabled={busy === r.id} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-brand-50 hover:text-brand-700" title="Tocar"><Play size={15} /></button>}
                    {canManage && r.status === 'AVAILABLE' && !r.storageUrl?.startsWith('s3://') && <button onClick={() => archive(r)} disabled={busy === r.id} className="mr-1 inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Arquivar no bucket"><Archive size={15} /></button>}
                    {canManage && r.status !== 'DELETED' && <button onClick={() => remove(r)} disabled={busy === r.id} className="inline-flex rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Excluir (LGPD)"><Trash2 size={15} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
