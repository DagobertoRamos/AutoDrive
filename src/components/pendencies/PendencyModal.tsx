'use client'

// =============================================================================
// PendencyModal — Modal de detalhes da pendência
// =============================================================================

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { X, CheckCircle2, XCircle, AlertTriangle, ShieldCheck } from 'lucide-react'
import { PriorityBadge, StatusBadge } from './PendencyStatusBadge'
import { cn, formatDate, formatRelativeTime } from '@/lib/utils'
import { canAccessModule, type UserRole } from '@/lib/permissions'
import type { PendencyWithRelations } from '@/types'

interface PendencyModalProps {
  pendency: PendencyWithRelations
  onClose: () => void
  onRefresh: () => void
}

type Tab = 'detalhes' | 'historico' | 'respostas'

export function PendencyModal({ pendency, onClose, onRefresh }: PendencyModalProps) {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role as UserRole | undefined
  const canReview = !!role && canAccessModule(role, 'pendencies.manage')
  // Resolvido pelo responsável, aguardando conferência do gerente.
  const pendingReview = pendency.status === 'AGUARDANDO_RESPOSTA' && !!pendency.resolvedByUserId

  const [tab, setTab] = useState<Tab>('detalhes')
  const [loading, setLoading] = useState(false)
  const [unresolvedReason, setUnresolvedReason] = useState('')
  const [showUnresolved, setShowUnresolved] = useState(false)
  const [rejectMode, setRejectMode] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [error, setError] = useState('')

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-2xl rounded-xl bg-white shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-xs text-gray-400 font-mono">#{pendency.id.slice(-8)}</p>
              <h2 className="text-base font-bold text-gray-800">{pendency.customerName}</h2>
            </div>
            <PriorityBadge priority={pendency.priority} />
            <StatusBadge status={pendency.status} />
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-6">
          {(['detalhes', 'historico', 'respostas'] as Tab[]).map(t => (
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
              {t === 'detalhes' ? 'Detalhes' : t === 'historico' ? 'Histórico' : 'Respostas'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {tab === 'detalhes' && (
            <div className="grid grid-cols-2 gap-4">
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
                <div className="col-span-2">
                  <p className="mb-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">Descrição</p>
                  <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{pendency.description}</p>
                </div>
              )}
              {pendency.notes && (
                <div className="col-span-2">
                  <p className="mb-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">Observações</p>
                  <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{pendency.notes}</p>
                </div>
              )}
            </div>
          )}

          {tab === 'historico' && (
            <div className="space-y-3">
              {(pendency.statusHistory ?? []).length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Nenhum histórico registrado.</p>
              ) : (
                (pendency.statusHistory ?? []).map((h: any, i: number) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="h-2.5 w-2.5 rounded-full bg-brand-400 mt-1 shrink-0" />
                      {i < (pendency.statusHistory?.length ?? 0) - 1 && (
                        <div className="w-0.5 flex-1 bg-gray-200 my-1" />
                      )}
                    </div>
                    <div className="pb-3">
                      <p className="text-xs text-gray-400">{formatRelativeTime(new Date(h.createdAt))}</p>
                      <p className="text-sm text-gray-700">
                        <span className="font-medium">{h.previousStatus ?? '—'}</span>
                        {' → '}
                        <span className="font-medium text-brand-700">{h.newStatus}</span>
                      </p>
                      {h.reason && <p className="text-xs text-gray-500 mt-0.5 italic">&quot;{h.reason}&quot;</p>}
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
                (pendency.messageReturns ?? []).map((r: any, i: number) => (
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
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mb-2 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertTriangle size={14} />
            {error}
          </div>
        )}

        {/* Unresolved reason input */}
        {showUnresolved && (
          <div className="mx-6 mb-3">
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
          <div className="mx-6 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            🕒 O responsável marcou como <strong>resolvido</strong>. {canReview ? 'Confira e aprove ou reprove abaixo.' : 'Aguardando a conferência do gerente.'}
          </div>
        )}

        {/* Motivo da reprovação (gerente) */}
        {pendingReview && rejectMode && (
          <div className="mx-6 mb-3">
            <label className="mb-1 block text-xs font-medium text-gray-700">Motivo da reprovação *</label>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={2} placeholder="Explique o que precisa ser refeito..." className="input resize-none" />
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            Fechar
          </button>
          {!isResolved && pendingReview ? (
            // ── Conferência do gerente (resolvido pelo responsável) ──────────
            canReview ? (
              !rejectMode ? (
                <div className="flex items-center gap-2">
                  <button onClick={() => { setRejectMode(true); setError('') }} disabled={loading} className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"><XCircle size={15} />Reprovar</button>
                  <button onClick={() => handleReview('approve')} disabled={loading} className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">{loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <ShieldCheck size={15} />}Aprovar resolução</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button onClick={() => { setRejectMode(false); setError('') }} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
                  <button onClick={() => handleReview('reject')} disabled={loading} className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">{loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}Confirmar reprovação</button>
                </div>
              )
            ) : (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-600">🕒 Aguardando conferência do gerente</span>
            )
          ) : !isResolved ? (
            <div className="flex items-center gap-2">
              {!showUnresolved ? (
                <>
                  <button
                    onClick={() => setShowUnresolved(true)}
                    disabled={loading}
                    className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
                  >
                    <XCircle size={15} />
                    Não resolvido
                  </button>
                  <button
                    onClick={handleResolve}
                    disabled={loading}
                    className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors disabled:opacity-50"
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
                  <button onClick={() => { setShowUnresolved(false); setError('') }} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
                    Cancelar
                  </button>
                  <button
                    onClick={handleUnresolved}
                    disabled={loading}
                    className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                    Confirmar
                  </button>
                </>
              )}
            </div>
          ) : null}
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
