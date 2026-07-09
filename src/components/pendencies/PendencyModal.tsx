'use client'

// =============================================================================
// PendencyModal — Modal de detalhes da pendência
// =============================================================================

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { X, CheckCircle2, XCircle, AlertTriangle, ShieldCheck, BellRing, Archive, Trash2 } from 'lucide-react'
import { PriorityBadge, StatusBadge } from './PendencyStatusBadge'
import { cn, formatDate, formatRelativeTime } from '@/lib/utils'
import { canAccessModule, type UserRole } from '@/lib/permissions'
import type { PendencyWithRelations } from '@/types'

interface PendencyModalProps {
  pendency: PendencyWithRelations
  onClose: () => void
  onRefresh: () => void
}

type Tab = 'detalhes' | 'historico' | 'respostas' | 'envios'
interface PushLog { id: string; channel: string; status: string; sentCount: number; detail: string | null; createdAt: string }
interface ModalMessageReturn { profileName?: string | null; messageBody?: string | null; createdAt: string | Date }

// Cor do marcador e ícone por grupo de evento da timeline unificada.
const TIMELINE_DOT: Record<string, string> = { status: 'bg-brand-400', comment: 'bg-gray-300', event: 'bg-amber-400', send: 'bg-sky-400' }
const TIMELINE_ICON: Record<string, string> = { status: '🔄', comment: '💬', event: '⚡', send: '🔔' }

const ARCHIVE_ROLES = new Set(['MASTER', 'ADM', 'ADMIN', 'OWNER', 'SUPER_ADMIN', 'GERENTE_GERAL', 'GERENTE_ADMINISTRATIVO', 'GERENTE'])
const DELETE_ROLES = new Set(['MASTER', 'ADM', 'ADMIN', 'OWNER', 'SUPER_ADMIN', 'GERENTE_GERAL'])

// Item unificado da linha do tempo (vem mesclado do endpoint /timeline).
interface TimelineItem { id: string; kind: string; type: string; at: string; by?: string | null; title: string; detail?: string | null }

export function PendencyModal({ pendency, onClose, onRefresh }: PendencyModalProps) {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role as UserRole | undefined
  const canReview = !!role && canAccessModule(role, 'pendencies.manage')
  const canArchive = !!role && ARCHIVE_ROLES.has(role)
  const canDelete = !!role && DELETE_ROLES.has(role)
  // Resolvido pelo responsável, aguardando conferência do gerente.
  const pendingReview = pendency.status === 'AGUARDANDO_RESPOSTA' && !!pendency.resolvedByUserId

  const [tab, setTab] = useState<Tab>('detalhes')
  const [loading, setLoading] = useState(false)
  const [unresolvedReason, setUnresolvedReason] = useState('')
  const [showUnresolved, setShowUnresolved] = useState(false)
  const [rejectMode, setRejectMode] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [remindMsg, setRemindMsg] = useState('')
  const [pushLogs, setPushLogs] = useState<PushLog[]>([])
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (tab !== 'envios') return
    fetch(`/api/pendencies/${pendency.id}/logs`, { credentials: 'include' }).then((r) => r.ok ? r.json() : null).then((j) => setPushLogs(j?.data ?? [])).catch(() => {})
  }, [tab, pendency.id])

  // Timeline unificada (status + prioridade/prazo + pop-ups + escalonamento +
  // penalidades + respostas + envios), mesclada no servidor em /timeline.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/pendencies/${pendency.id}/timeline`, { credentials: 'include' }).then((r) => r.ok ? r.json() : null).catch(() => null)
        if (cancelled) return
        setTimeline((res?.data ?? []) as TimelineItem[])
      } catch { /* silencioso */ }
    })()
    return () => { cancelled = true }
  }, [pendency.id])

  const handleRemindNow = async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/pendencies/${pendency.id}/remind-now`, { method: 'POST', credentials: 'include' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j?.error ?? 'Falha ao cobrar.'); return }
      setError(''); setRemindMsg(j?.message ?? 'Lembrete enviado.'); setTimeout(() => setRemindMsg(''), 4000)
    } catch { setError('Erro de rede.') } finally { setLoading(false) }
  }

  const handleArchive = async () => {
    if (!window.confirm('Arquivar esta pendência resolvida? Ela sairá da lista principal e ficará na aba Arquivo.')) return
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/pendencies/${pendency.id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: 'Arquivada pelo usuário.' }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j?.error ?? 'Falha ao arquivar.'); return }
      onRefresh()
    } catch { setError('Erro de rede. Tente de novo.') } finally { setLoading(false) }
  }

  const handleDelete = async () => {
    if (!window.confirm('Tem certeza que deseja excluir esta pendência? Esta ação deve ser usada somente quando necessário.')) return
    const reason = window.prompt('Informe o motivo da exclusão.')
    if (reason === null) return
    if (reason.trim().length < 5) { setError('Informe o motivo da exclusão.'); return }

    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/pendencies/${pendency.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: reason.trim() }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j?.error ?? 'Falha ao excluir.'); return }
      onRefresh()
    } catch { setError('Erro de rede. Tente de novo.') } finally { setLoading(false) }
  }

  const handleReview = async (action: 'approve' | 'reject') => {
    if (action === 'reject' && !rejectReason.trim()) { setError('Informe o motivo da reprovação.'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch(`/api/pendencies/${pendency.id}/review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ action, reason: action === 'reject' ? rejectReason.trim() : undefined }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j?.error ?? 'Falha ao conferir.'); return }
      onRefresh()
    } catch { setError('Erro de rede. Tente de novo.') } finally { setLoading(false) }
  }

  // Fechar com Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleResolve = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/pendencies/${pendency.id}/resolve`, { method: 'POST' })
      if (!res.ok) throw new Error()
      onRefresh()
    } catch {
      setError('Erro ao marcar como resolvido. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const handleUnresolved = async () => {
    if (!unresolvedReason.trim()) {
      setError('Informe o motivo da não resolução.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/pendencies/${pendency.id}/unresolved`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: unresolvedReason }),
      })
      if (!res.ok) throw new Error()
      onRefresh()
    } catch {
      setError('Erro ao registrar. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const isResolved = pendency.status === 'FINALIZADA' || pendency.status === 'CANCELADA'
  const isFinalized = pendency.status === 'FINALIZADA'
  const isArchived = pendency.status === 'CANCELADA'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-x-hidden p-2 sm:p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 flex max-h-[90dvh] w-full max-w-[calc(100vw-1rem)] flex-col rounded-xl bg-white shadow-2xl sm:max-w-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-4 sm:items-center sm:px-6">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-3">
            <div className="min-w-0">
              <p className="text-xs text-gray-400 font-mono">#{pendency.id.slice(-8)}</p>
              <h2 className="truncate text-base font-bold text-gray-800">{pendency.customerName}</h2>
            </div>
            <PriorityBadge priority={pendency.priority} />
            <StatusBadge status={pendency.status} />
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto border-b border-gray-200 px-4 sm:px-6">
          {(['detalhes', 'historico', 'respostas', 'envios'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'pb-3 pt-3 px-4 text-sm font-medium capitalize transition-colors border-b-2 -mb-px',
                tab === t
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              {t === 'detalhes' ? 'Detalhes' : t === 'historico' ? 'Histórico' : t === 'respostas' ? 'Respostas' : 'Envios'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {tab === 'detalhes' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Cliente" value={pendency.customerName} />
              <Field label="Placa" value={pendency.plate} mono />
              <Field label="Veículo" value={pendency.vehicleLabel ?? pendency.vehicle?.plate ?? pendency.vehicle?.model ?? null} />
              <Field label="Negociação" value={pendency.negotiation} />
              <Field label="Tipo" value={pendency.type} />
              <Field label="Responsável" value={pendency.responsible?.fullName} />
              <Field label="Data Inicial" value={pendency.initialDate ? formatDate(new Date(pendency.initialDate as string)) : undefined} />
              <Field label="Data Vencimento" value={pendency.dueDate ? formatDate(new Date(pendency.dueDate)) : undefined} danger={pendency.dueDate ? new Date(pendency.dueDate) < new Date() : false} />
              <Field label="Último Envio" value={pendency.lastSentAt ? formatDate(new Date(pendency.lastSentAt)) : 'Nenhum'} />
              <Field label="Próximo Envio" value={pendency.nextSendAt ? formatDate(new Date(pendency.nextSendAt)) : '—'} />
              <Field label="Total Envios" value={String(pendency.totalSent ?? 0)} />
              <Field label="Loja" value={pendency.unit?.name} />
              {pendency.description && (
                <div className="sm:col-span-2">
                  <p className="mb-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">Descrição</p>
                  <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{pendency.description}</p>
                </div>
              )}
              {pendency.notes && (
                <div className="sm:col-span-2">
                  <p className="mb-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">Observações</p>
                  <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{pendency.notes}</p>
                </div>
              )}
            </div>
          )}

          {tab === 'historico' && (
            <div className="space-y-3">
              {timeline.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Nenhum histórico registrado.</p>
              ) : (
                timeline.map((it, i) => (
                  <div key={it.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={cn('h-2.5 w-2.5 rounded-full mt-1 shrink-0', TIMELINE_DOT[it.kind] ?? 'bg-brand-400')} />
                      {i < timeline.length - 1 && <div className="w-0.5 flex-1 bg-gray-200 my-1" />}
                    </div>
                    <div className="pb-3 min-w-0">
                      <p className="text-xs text-gray-400">
                        {formatRelativeTime(new Date(it.at))}
                        {it.by && <span className="text-gray-400"> · {it.by}</span>}
                      </p>
                      <p className="text-sm font-medium text-gray-700">
                        <span className="mr-1">{TIMELINE_ICON[it.kind] ?? '•'}</span>{it.title}
                      </p>
                      {it.detail && <p className="text-xs text-gray-500 mt-0.5 italic">&quot;{it.detail}&quot;</p>}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'respostas' && (
            <div className="space-y-3">
              {(pendency.messageReturns ?? []).length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Nenhuma resposta do vendedor.</p>
              ) : (
                ((pendency.messageReturns ?? []) as ModalMessageReturn[]).map((r, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-700">{r.profileName ?? 'Vendedor'}</span>
                      <span className="text-[11px] text-gray-400">{formatRelativeTime(new Date(r.createdAt))}</span>
                    </div>
                    <p className="text-sm text-gray-800">{r.messageBody}</p>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'envios' && (
            <div className="space-y-2">
              {pushLogs.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">Nenhum envio registrado ainda.</p>
              ) : (
                pushLogs.map((l) => (
                  <div key={l.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
                    <div>
                      <span className={cn('mr-2 rounded px-1.5 py-0.5 text-[10px] font-semibold', l.channel === 'ESCALATION' ? 'bg-red-100 text-red-700' : l.channel === 'MANUAL' ? 'bg-brand-100 text-brand-700' : 'bg-gray-200 text-gray-600')}>{l.channel === 'ESCALATION' ? 'ESCALADO' : l.channel === 'MANUAL' ? 'MANUAL' : 'PUSH'}</span>
                      <span className={l.status === 'SENT' ? 'text-green-700' : 'text-red-600'}>{l.status === 'SENT' ? `enviado (${l.sentCount})` : 'sem aparelho'}</span>
                      {l.detail && <span className="text-xs text-gray-400"> · {l.detail}</span>}
                    </div>
                    <span className="text-[11px] tabular-nums text-gray-400">{formatRelativeTime(new Date(l.createdAt))}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:mx-6">
            <AlertTriangle size={14} />
            {error}
          </div>
        )}

        {/* Unresolved reason input */}
        {showUnresolved && (
          <div className="mx-4 mb-3 sm:mx-6">
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Motivo da não resolução *
            </label>
            <textarea
              value={unresolvedReason}
              onChange={e => setUnresolvedReason(e.target.value)}
              rows={2}
              placeholder="Explique o motivo..."
              className="input resize-none"
            />
          </div>
        )}

        {/* Aviso: aguardando conferência do gerente */}
        {pendingReview && !rejectMode && (
          <div className="mx-4 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 sm:mx-6">
            🕒 O responsável marcou como <strong>resolvido</strong>. {canReview ? 'Confira e aprove ou reprove abaixo.' : 'Aguardando a conferência do gerente.'}
          </div>
        )}

        {/* Motivo da reprovação (gerente) */}
        {pendingReview && rejectMode && (
          <div className="mx-4 mb-3 sm:mx-6">
            <label className="mb-1 block text-xs font-medium text-gray-700">Motivo da reprovação *</label>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={2} placeholder="Explique o que precisa ser refeito..." className="input resize-none" />
          </div>
        )}

        {remindMsg && <div className="mx-4 mb-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 sm:mx-6">{remindMsg}</div>}

        {/* Footer */}
        <div className="flex flex-col gap-3 border-t border-gray-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            <button onClick={onClose} className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 sm:w-auto">
              Fechar
            </button>
            {canReview && !isResolved && !pendingReview && (
              <button onClick={handleRemindNow} disabled={loading} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50 sm:w-auto" title="Enviar o lembrete por push agora ao responsável"><BellRing size={14} />Cobrar agora</button>
            )}
          </div>
          {!isResolved && pendingReview ? (
            // ── Conferência do gerente (resolvido pelo responsável) ──────────
            canReview ? (
              !rejectMode ? (
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                  <button onClick={() => { setRejectMode(true); setError('') }} disabled={loading} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 sm:w-auto"><XCircle size={15} />Reprovar</button>
                  <button onClick={() => handleReview('approve')} disabled={loading} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 sm:w-auto">{loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <ShieldCheck size={15} />}Aprovar resolução</button>
                </div>
              ) : (
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                  <button onClick={() => { setRejectMode(false); setError('') }} className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 sm:w-auto">Cancelar</button>
                  <button onClick={() => handleReview('reject')} disabled={loading} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 sm:w-auto">{loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}Confirmar reprovação</button>
                </div>
              )
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-600">🕒 Aguardando conferência do gerente</span>
            )
          ) : !isResolved ? (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
              {!showUnresolved ? (
                <>
                  <button
                    onClick={() => setShowUnresolved(true)}
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50 sm:w-auto"
                  >
                    <XCircle size={15} />
                    Não resolvido
                  </button>
                  <button
                    onClick={handleResolve}
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50 sm:w-auto"
                  >
                    {loading ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <CheckCircle2 size={15} />
                    )}
                    Resolvido
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => { setShowUnresolved(false); setError('') }} className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 sm:w-auto">
                    Cancelar
                  </button>
                  <button
                    onClick={handleUnresolved}
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50 sm:w-auto"
                  >
                    {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                    Confirmar
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
              {canArchive && isFinalized && (
                <button onClick={handleArchive} disabled={loading} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 sm:w-auto">
                  <Archive size={15} />Arquivar
                </button>
              )}
              {canDelete && (isFinalized || isArchived) && (
                <button onClick={handleDelete} disabled={loading} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 sm:w-auto">
                  <Trash2 size={15} />Excluir
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, mono = false, danger = false }: {
  label: string; value?: string | null; mono?: boolean; danger?: boolean
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={cn('text-sm text-gray-800', mono && 'font-mono', danger && 'text-red-600 font-medium')}>
        {value || '—'}
      </p>
    </div>
  )
}
