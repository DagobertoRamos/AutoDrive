'use client'

// =============================================================================
// Ficha de financiamento — tela principal do F&I.
// Responde de cara: quem é, qual veículo, qual a situação, o que fazer agora.
// Bancos em tabela; detalhes em abas; ações em modais/painel lateral.
// Enquanto algum banco está "Enviando"/"Verificando", atualiza sozinha.
// =============================================================================

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ChevronDown, ChevronRight, MoreHorizontal, RefreshCw, Send, SlidersHorizontal } from 'lucide-react'
import type { MoneyEntry, ProposalView } from '@/lib/finance/fi/read-model'
import { HelpHint } from '@/components/ui/help-hint'
import { Alert, api, brlOrDash, btnPrimary, btnSecondary, dateTimeBR, pct, Section, StatusBadge, toneText } from './ui'
import { AdjustModal, CancelModal, PortalModal, RespondModal, SendModal } from './FichaModals'
import { useSession } from 'next-auth/react'
import { CadastroForm, internalEndpoints } from './CadastroForm'
import { PostApproval } from './PostApproval'
import { DetailsPanel, DocumentsPanel, TechLogs, Timeline } from './FichaTabs'
import { Modal } from './ui'

type Perms = Record<string, boolean>
type ModalKind = null | 'send' | 'adjust' | 'portal' | 'cancel' | 'complete' | { respond: string }
type Tab = 'historico' | 'cadastro' | 'documentos' | 'detalhes' | 'logs'

export default function FichaView({ id }: { id: string }) {
  const [view, setView] = useState<ProposalView | null>(null)
  const [perms, setPerms] = useState<Perms>({})
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalKind>(null)
  const [tab, setTab] = useState<Tab>('historico')
  const [menu, setMenu] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const role = useSession().data?.user?.role

  const load = useCallback(async () => {
    const r = await api<ProposalView>(`/api/financing/proposals/${id}/overview`)
    if (!r.ok || !r.data) { setError(r.error); return }
    setView(r.data); setPerms((r.json?.permissions as Perms) ?? {}); setError(null)
  }, [id])
  useEffect(() => { const t = setTimeout(() => void load(), 0); return () => clearTimeout(t) }, [load])

  const waitingBank = !!view?.banks.some((b) => ['ENVIANDO', 'VERIFICANDO'].includes(b.current.status))
  useEffect(() => {
    if (!waitingBank) return
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [waitingBank, load])

  const run = async (key: string, url: string, body: unknown) => {
    setBusy(key); setActionError(null)
    const r = await api(url, { method: 'POST', body })
    setBusy(null)
    if (!r.ok) setActionError(r.error)
    await load()
  }

  const ranked = useMemo(() => {
    const m = new Map<string, string[]>()
    if (!view) return m
    for (const [k, sid] of Object.entries(view.ranking)) if (sid) m.set(sid, [...(m.get(sid) ?? []), view.rankingLabels[k as keyof typeof view.rankingLabels]])
    return m
  }, [view])

  if (error && !view) return <div className="mx-auto max-w-5xl p-6"><Alert tone="danger">{error}</Alert></div>
  if (!view) return <div className="mx-auto max-w-5xl space-y-4 p-6">{[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />)}</div>

  const v = view
  const canSend = !!perms.enviarFicha && v.status !== 'CANCELADA' && !v.selectedSubmissionId
  const hasAttempts = v.banks.length > 0
  const selected = v.banks.find((b) => b.current.id === v.selectedSubmissionId)
  const seeReturn = !!perms.verRetorno

  const primary = (() => {
    switch (v.nextAction.key) {
      case 'COMPLETAR_FICHA': return { label: 'Completar ficha', on: () => setModal('complete') }
      case 'ENVIAR_BANCOS': return canSend ? { label: 'Enviar aos bancos', on: () => setModal('send') } : null
      case 'REGISTRAR_RESPOSTA': { const a = v.banks.find((b) => b.current.status === 'ENVIADA' && b.current.mode === 'MANUAL'); return a && perms.aprovar ? { label: 'Registrar resposta', on: () => setModal({ respond: a.current.id }) } : null }
      case 'SOLICITAR_DOCUMENTOS': return perms.acessarDocumentos ? { label: 'Solicitar ao cliente', on: () => setModal('portal') } : null
      case 'AJUSTAR_PROPOSTA': return canSend ? { label: 'Ajustar proposta', on: () => setModal('adjust') } : null
      case 'ESCOLHER_PROPOSTA': return { label: 'Ver propostas', on: () => document.getElementById('fi-bancos')?.scrollIntoView({ behavior: 'smooth' }) }
      default: return null
    }
  })()

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <Link href="/financiamento/fichas" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"><ArrowLeft size={15} />Fichas</Link>

      {/* Cabeçalho: onde estou e qual a situação */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-500">{v.code}</p>
          <h1 className="truncate text-xl font-bold text-gray-900">{v.customer.name}</h1>
          <p className="text-sm text-gray-600">{[v.vehicle.description, v.terms.amount != null ? `${brlOrDash(v.terms.amount)} financiados` : null, v.terms.installments ? `${v.terms.installments}x` : null].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge meta={v.statusMeta} size="md" />
          <div className="relative">
            <button className={btnSecondary} onClick={() => setMenu(!menu)} aria-label="Mais ações" aria-expanded={menu}><MoreHorizontal size={16} /></button>
            {menu && (
              <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-lg" onMouseLeave={() => setMenu(false)}>
                {perms.acessarDocumentos && v.status !== 'CANCELADA' && <button className="block w-full px-3 py-2 text-left hover:bg-gray-50" onClick={() => { setMenu(false); setModal('portal') }}>Solicitar ao cliente</button>}
                {canSend && hasAttempts && <button className="block w-full px-3 py-2 text-left hover:bg-gray-50" onClick={() => { setMenu(false); setModal('adjust') }}>Ajustar proposta</button>}
                {perms.cancelarProposta && v.status !== 'CANCELADA' && v.postApproval.funding.status !== 'PAGO' && <button className="block w-full px-3 py-2 text-left text-red-700 hover:bg-red-50" onClick={() => { setMenu(false); setModal('cancel') }}>Cancelar ficha</button>}
                <button className="block w-full px-3 py-2 text-left hover:bg-gray-50" onClick={() => { setMenu(false); load() }}>Atualizar</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Próxima ação */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
        <div>
          <p className="text-xs text-gray-500">Próxima ação</p>
          <p className={`text-sm font-semibold ${toneText(v.nextAction.tone)}`}>{v.nextAction.label}{v.nextAction.key === 'VERIFICAR_RESPOSTA' && <HelpHint term="SEM_RESPOSTA_BANCO" size={12} className="ml-1" />}</p>
        </div>
        {primary && <button className={btnPrimary} onClick={primary.on}>{primary.label}</button>}
      </div>

      {actionError && <Alert tone="danger">{actionError}</Alert>}

      {/* Bancos */}
      <div id="fi-bancos">
        <Section title="Bancos" actions={<>
          {canSend && <button className={btnSecondary} onClick={() => setModal('send')}><Send size={15} />Enviar a bancos</button>}
          {canSend && hasAttempts && <button className={btnSecondary} onClick={() => setModal('adjust')}><SlidersHorizontal size={15} />Ajustar proposta</button>}
        </>}>
          {!hasAttempts ? <p className="text-sm text-gray-500">A ficha ainda não foi enviada a nenhum banco.</p> : (
            <div className="-mx-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Banco</th><th className="px-4 py-2 font-medium">Situação</th>
                    <th className="px-4 py-2 text-right font-medium">Entrada</th><th className="px-4 py-2 text-right font-medium">Parcela</th>
                    <th className="px-4 py-2 text-right font-medium">Taxa</th><th className="px-4 py-2 text-right font-medium"><span className="inline-flex items-center gap-1">CET<HelpHint term="CET" size={11} /></span></th>
                    <th className="px-4 py-2 text-right font-medium"><span className="inline-flex items-center gap-1">Financiado<HelpHint term="VALOR_FINANCIADO" size={11} /></span></th>
                    {seeReturn && <th className="px-4 py-2 text-right font-medium"><span className="inline-flex items-center gap-1">Retorno<HelpHint term="RETORNO_PREVISTO" size={11} /></span></th>}
                    <th className="px-4 py-2 font-medium">Resposta</th><th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {v.banks.map((b) => {
                    const a = b.current
                    const o = a.offer
                    const tags = ranked.get(a.id) ?? []
                    const isSelected = a.id === v.selectedSubmissionId
                    return (
                      <Fragment key={b.bankId}>
                        <tr className={isSelected ? 'bg-green-50/40' : ''}>
                          <td className="min-w-[190px] px-4 py-2.5 align-top">
                            <button className="flex items-center gap-1 whitespace-nowrap text-left font-medium text-gray-900" onClick={() => setExpanded(expanded === b.bankId ? null : b.bankId)} aria-expanded={expanded === b.bankId}>
                              {b.history.length > 0 ? (expanded === b.bankId ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span className="w-3.5" />}{b.bankName}
                            </button>
                            {tags.length > 0 && <p className="ml-5 max-w-[220px] text-[11px] leading-snug text-green-700">{tags.join(' · ')}</p>}
                            {a.version > 1 && <p className="ml-5 text-[11px] text-gray-500">Versão {a.version}</p>}
                          </td>
                          <td className="px-4 py-2.5"><StatusBadge meta={a.meta} />{a.reason && <p className="mt-0.5 max-w-[220px] text-[11px] text-gray-500">{a.reason}</p>}{isSelected && <p className="mt-0.5 text-[11px] font-medium text-green-700">Proposta escolhida</p>}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{brlOrDash(o?.downPayment)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{o?.installmentValue ? `${o.installments ?? ''}x ${brlOrDash(o.installmentValue)}` : '—'}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{pct(o?.rateMonthly)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{pct(o?.cetMonthly)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{brlOrDash(o?.approvedAmount)}</td>
                          {seeReturn && <td className="px-4 py-2.5 text-right tabular-nums">{a.returnPercent != null ? `${pct(a.returnPercent)} · ${brlOrDash(a.returnValue)}` : '—'}</td>}
                          <td className="px-4 py-2.5 text-xs text-gray-500">{a.responseMinutes != null ? `${a.responseMinutes} min` : dateTimeBR(a.submittedAt)}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right">
                            {a.status === 'VERIFICANDO' && a.mode === 'API' && <button className="text-xs font-medium text-brand-700 hover:underline disabled:opacity-50" disabled={busy === a.id} onClick={() => run(a.id, `/api/financing/submissions/${a.id}`, { action: 'VERIFICAR' })}><RefreshCw size={12} className="mr-1 inline" />Verificar agora</button>}
                            {perms.aprovar && a.active && ['ENVIADA', 'EM_ANALISE', 'PENDENTE', 'PRE_APROVADA', 'VERIFICANDO'].includes(a.status) && (a.mode === 'MANUAL' || a.status === 'VERIFICANDO') && <button className="ml-2 text-xs font-medium text-brand-700 hover:underline" onClick={() => setModal({ respond: a.id })}>Registrar resposta</button>}
                            {perms.enviarFicha && a.status === 'APROVADA' && !v.selectedSubmissionId && <button className="ml-2 rounded-md bg-green-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50" disabled={busy === `sel-${a.id}`} onClick={() => run(`sel-${a.id}`, `/api/financing/proposals/${v.id}/select`, { submissionId: a.id })}>Escolher</button>}
                          </td>
                        </tr>
                        {expanded === b.bankId && b.history.map((h) => (
                          <tr key={h.id} className="bg-gray-50/60 text-xs text-gray-600">
                            <td className="px-4 py-1.5 pl-10">Versão {h.version}</td>
                            <td className="px-4 py-1.5"><StatusBadge meta={h.meta} /></td>
                            <td className="px-4 py-1.5 text-right">{brlOrDash((h.terms as { downPayment?: number } | null)?.downPayment ?? null)}</td>
                            <td className="px-4 py-1.5 text-right">{h.offer?.installmentValue ? `${h.offer.installments ?? ''}x ${brlOrDash(h.offer.installmentValue)}` : `${(h.terms as { installments?: number } | null)?.installments ?? '—'}x`}</td>
                            <td colSpan={seeReturn ? 6 : 5} className="px-4 py-1.5">{dateTimeBR(h.submittedAt)}{h.reason ? ` · ${h.reason}` : ''}</td>
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {v.missing.common.length > 0 && !hasAttempts && <p className="mt-3 text-sm text-amber-800">Faltam {v.missing.common.length} informações para enviar. <button className="font-medium underline" onClick={() => setModal('complete')}>Completar ficha</button></p>}
        </Section>
      </div>

      {/* Pós-aprovação */}
      {v.selectedSubmissionId && (
        <Section title={`Formalização — ${selected?.bankName ?? 'banco'}`} actions={perms.formalizar && v.postApproval.formalization.status === 'NAO_INICIADA' ? <button className="text-xs font-medium text-gray-600 hover:underline disabled:opacity-50" disabled={busy === 'unsel'} onClick={async () => { setBusy('unsel'); const r = await api(`/api/financing/proposals/${v.id}/select`, { method: 'DELETE' }); setBusy(null); if (!r.ok) setActionError(r.error); load() }}>Desfazer escolha</button> : undefined}>
          <PostApproval view={v} canFormalize={!!perms.formalizar} onChanged={load} />
          {!v.deal && <p className="mt-3 text-xs text-amber-800">Ficha sem negociação: vincule-a a uma negociação para gerar o recebimento no financeiro.</p>}
          {v.money && (
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
              <MoneyItem label="Recebimento do banco" item={v.money.funding} />
              {seeReturn && <MoneyItem label="Retorno" hint item={v.money.return} />}
              {seeReturn && <MoneyItem label="Estorno do banco" item={v.money.chargeback} negative />}
              {seeReturn && typeof v.money.netReturn === 'number' && <div className="rounded-lg bg-gray-50 px-3 py-2"><dt className="text-xs text-gray-500">Retorno líquido recebido</dt><dd className="font-semibold">{brlOrDash(v.money.netReturn)}</dd></div>}
            </dl>
          )}
        </Section>
      )}

      {/* Abas */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex gap-1 overflow-x-auto border-b border-gray-100 px-2" role="tablist">
          {([['historico', 'Histórico'], ['cadastro', `Cadastro${v.missing.common.length ? ` (faltam ${v.missing.common.length})` : ''}`], ['documentos', `Documentos${v.documents.length ? ` (${v.documents.length})` : ''}`], ['detalhes', 'Detalhes'], ...(perms.verLogsTecnicos ? [['logs', 'Logs técnicos']] : [])] as [Tab, string][]).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm ${tab === k ? 'border-brand-600 font-semibold text-brand-700' : 'border-transparent text-gray-600 hover:text-gray-900'}`}>{label}</button>
          ))}
        </div>
        <div className="p-4">
          {tab === 'historico' && <Timeline items={v.timeline} />}
          {tab === 'cadastro' && <CadastroTab view={v} role={role} onSaved={load} />}
          {tab === 'documentos' && <DocumentsPanel view={v} onChanged={load} canEdit={!!perms.acessarDocumentos} />}
          {tab === 'detalhes' && <DetailsPanel view={v} />}
          {tab === 'logs' && perms.verLogsTecnicos && <TechLogs proposalId={v.id} />}
        </div>
      </div>

      {modal === 'send' && <SendModal view={v} onClose={() => setModal(null)} onDone={load} />}
      {modal === 'adjust' && <AdjustModal view={v} onClose={() => setModal(null)} onDone={load} />}
      {modal === 'portal' && <PortalModal view={v} onClose={() => setModal(null)} onDone={load} />}
      {modal === 'cancel' && <CancelModal view={v} onClose={() => setModal(null)} onDone={load} />}
      {modal && typeof modal === 'object' && <RespondModal view={v} attemptId={modal.respond} onClose={() => setModal(null)} onDone={load} canSeeReturn={seeReturn} />}
      {modal === 'complete' && (
        <Modal title={`Ficha cadastral — ${v.customer.name}`} onClose={() => { setModal(null); load() }} xl>
          <CadastroPane proponentId={v.customer.proponentId} role={role} onSaved={load} highlight />
        </Modal>
      )}
    </div>
  )
}

const MONEY_META: Record<string, { label: string; tone: string; icon: string }> = {
  PREVISTO: { label: 'Previsto', tone: 'info', icon: 'clock' }, RECEBIDO: { label: 'Recebido', tone: 'success', icon: 'wallet' },
  CONCILIADO: { label: 'Conciliado', tone: 'success', icon: 'check-double' }, ESTORNADO: { label: 'Estornado', tone: 'danger', icon: 'refresh' },
}
function MoneyItem({ label, item, hint, negative }: { label: string; item: MoneyEntry | null | undefined; hint?: boolean; negative?: boolean }) {
  if (!item) return null
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <dt className="flex items-center gap-1 text-xs text-gray-500">{label}{hint && <HelpHint term="RETORNO_PREVISTO" size={11} />}</dt>
      <dd className="mt-0.5 flex items-center justify-between gap-2"><span className="font-semibold">{negative ? '−' : ''}{brlOrDash(item.amount)}</span><StatusBadge meta={MONEY_META[item.status]} /></dd>
    </div>
  )
}

function CadastroPane({ proponentId, role, onSaved, highlight }: { proponentId: string; role: string | undefined; onSaved: () => void; highlight?: boolean }) {
  const endpoints = useMemo(() => internalEndpoints(proponentId, role), [proponentId, role])
  return <CadastroForm key={proponentId} endpoints={endpoints} onSaved={onSaved} highlight={highlight} />
}

function CadastroTab({ view, role, onSaved }: { view: ProposalView; role: string | undefined; onSaved: () => void }) {
  const [who, setWho] = useState<'cliente' | 'co'>('cliente')
  const id = who === 'co' && view.coBuyer ? view.coBuyer.id : view.customer.proponentId
  return (
    <div className="space-y-4">
      {view.coBuyer && (
        <div className="flex gap-2" role="radiogroup" aria-label="Pessoa">
          {([['cliente', view.customer.name], ['co', `Co-comprador: ${view.coBuyer.name}`]] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setWho(k)} aria-pressed={who === k} className={`rounded-full px-3 py-1 text-xs font-medium ${who === k ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-700'}`}>{label}</button>
          ))}
        </div>
      )}
      <CadastroPane proponentId={id} role={role} onSaved={onSaved} highlight={who === 'cliente'} />
    </div>
  )
}
