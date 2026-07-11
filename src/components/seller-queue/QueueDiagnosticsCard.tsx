'use client'

// =============================================================================
// QueueDiagnosticsCard — Diagnóstico dos colaboradores (GESTÃO). Fase 3.
// Cruza /callable (lista) com /diagnostics (dispositivos/push + presença).
// Mostra push (plataformas/ativos), último acesso e status na fila. Read-only.
// Para testar push/pop-up/som use a página "Testes da fila".
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { Stethoscope, RefreshCw, AlertCircle, Smartphone, Globe, MonitorSmartphone, ShieldAlert, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Device { platform: string; deviceName: string | null; isActive: boolean; lastSeenAt: string | null }
interface Seller { sellerId: string; name: string; role?: string; positionName?: string | null; queueStatus?: string | null }
interface ComplianceSummary {
  openFraudFlags: number
  highSeverityFlags: number
  mediumSeverityFlags: number
  openCompliancePendencies: number
  resolvedCompliancePendencies: number
  latestPendencyAt: string | null
}
interface CompliancePilotInfo {
  enabled: boolean
  notifyManagers: boolean
  autoCreateManagerPendency: boolean
  requireConfirmedFraudForRanking: boolean
}

const STATUS_LABEL: Record<string, string> = {
  WAITING: 'Aguardando', NEXT: 'Próximo', CALLED: 'Chamado', ACCEPTED: 'Aceitou',
  IN_ATTENDANCE: 'Atendendo', PAUSED: 'Pausado', LEFT: 'Fora da fila', BLOCKED: 'Bloqueado',
}
const PLATFORM_ICON = (p: string) => p === 'ANDROID' ? <Smartphone size={13} /> : p === 'IOS' ? <MonitorSmartphone size={13} /> : <Globe size={13} />
const fmtDateTime = (s: string | null) => { if (!s) return '—'; try { return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) } catch { return '—' } }

export default function QueueDiagnosticsCard() {
  const [sellers, setSellers] = useState<Seller[]>([])
  const [devicesByUser, setDevicesByUser] = useState<Record<string, Device[]>>({})
  const [queueByUser, setQueueByUser] = useState<Record<string, { status: string; lastActiveAt: string | null }>>({})
  const [complianceSummary, setComplianceSummary] = useState<ComplianceSummary | null>(null)
  const [compliancePilot, setCompliancePilot] = useState<CompliancePilotInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [sRes, dRes, rRes] = await Promise.all([
        fetch('/api/seller-queue/callable', { credentials: 'include' }),
        fetch('/api/seller-queue/diagnostics', { credentials: 'include' }),
        fetch('/api/seller-queue/reports?days=30', { credentials: 'include' }),
      ])
      const dj = await dRes.json().catch(() => ({}))
      if (!dRes.ok) throw new Error(dj.error ?? 'Erro ao carregar diagnóstico')
      setDevicesByUser(dj.data.devicesByUser ?? {})
      setQueueByUser(dj.data.queueByUser ?? {})
      setSellers(sRes.ok ? ((await sRes.json())?.data ?? []) : [])
      const rj = await rRes.json().catch(() => ({}))
      setComplianceSummary(rRes.ok ? (rj?.data?.complianceSummary ?? null) : null)
      setCompliancePilot(rRes.ok ? (rj?.data?.compliancePilot ?? null) : null)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erro ao carregar') } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900"><Stethoscope size={17} className="text-brand-600" />Diagnóstico dos colaboradores</h2>
          <p className="mt-0.5 text-xs text-gray-500">Dispositivos/push e presença. Para enviar testes, use "Testes da fila".</p>
        </div>
        <button onClick={load} disabled={loading} className="rounded p-1.5 text-gray-400 hover:bg-gray-100"><RefreshCw size={14} className={cn(loading && 'animate-spin')} /></button>
      </div>

      {error && <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle size={15} />{error}</div>}

      {compliancePilot?.enabled && complianceSummary && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-amber-700"><ShieldAlert size={13} />Suspeitas abertas</div>
            <div className="mt-1 text-2xl font-bold text-amber-900">{complianceSummary.openFraudFlags}</div>
            <div className="mt-1 text-[11px] text-amber-800">{complianceSummary.highSeverityFlags} altas / {complianceSummary.mediumSeverityFlags} médias</div>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-blue-700"><Inbox size={13} />Pendências abertas</div>
            <div className="mt-1 text-2xl font-bold text-blue-900">{complianceSummary.openCompliancePendencies}</div>
            <div className="mt-1 text-[11px] text-blue-800">Origem `SELLER_QUEUE_COMPLIANCE`</div>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Pendências resolvidas</div>
            <div className="mt-1 text-2xl font-bold text-emerald-900">{complianceSummary.resolvedCompliancePendencies}</div>
            <div className="mt-1 text-[11px] text-emerald-800">Últimos 30 dias</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">Política do ranking</div>
            <div className="mt-1 text-sm font-semibold text-gray-900">{compliancePilot.requireConfirmedFraudForRanking ? 'Só confirmada desconta' : 'Revisão também pode descontar'}</div>
            <div className="mt-1 text-[11px] text-gray-500">{complianceSummary.latestPendencyAt ? `Última pendência: ${fmtDateTime(complianceSummary.latestPendencyAt)}` : 'Nenhuma pendência de conformidade recente.'}</div>
          </div>
        </div>
      )}

      {loading ? <div className="mt-4 h-40 animate-pulse rounded-lg bg-gray-100" /> : sellers.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50"><tr>{['Colaborador', 'Push / Dispositivos', 'Último acesso', 'Na fila'].map((h) => <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {sellers.map((s) => {
                const devs = devicesByUser[s.sellerId] ?? []
                const activeDevs = devs.filter((d) => d.isActive)
                const lastSeen = devs.map((d) => d.lastSeenAt).filter(Boolean).sort().slice(-1)[0] ?? null
                const q = queueByUser[s.sellerId]
                return (
                  <tr key={s.sellerId}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900">{s.name}</div>
                      <div className="text-[11px] text-gray-400">{s.positionName ?? s.role ?? ''}</div>
                    </td>
                    <td className="px-3 py-2">
                      {activeDevs.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {activeDevs.map((d, i) => (
                            <span key={i} className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700" title={d.deviceName ?? d.platform}>
                              {PLATFORM_ICON(d.platform)}{d.platform === 'ANDROID' ? 'Android' : d.platform === 'IOS' ? 'iPhone' : 'Web'}
                            </span>
                          ))}
                        </div>
                      ) : <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700"><AlertCircle size={12} />Sem push registrado</span>}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-gray-600">{fmtDateTime(lastSeen)}</td>
                    <td className="px-3 py-2">
                      {q ? <span className="text-gray-700">{STATUS_LABEL[q.status] ?? q.status}</span> : <span className="text-gray-400">fora</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="mt-4 text-sm text-gray-500">Nenhum colaborador encontrado nesta unidade.</p>}
    </div>
  )
}
