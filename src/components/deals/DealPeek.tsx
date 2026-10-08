'use client'

// =============================================================================
// Resumo da negociação em painel lateral — consulta rápida de qualquer módulo
// sem sair dele. Montado uma vez no DashboardShell (DealPeekProvider).
//   useDealPeek().open(dealId)         → abre o painel
//   <DealPeekLink dealId>…</DealPeekLink> → link que abre o painel; ctrl/cmd/
//       shift/botão do meio continuam abrindo /negociacoes/[id] normalmente.
//       `asButton` para usar dentro de outro link/botão (sem <a> aninhado).
// Consome GET /api/negotiations/[id]/summary.
// =============================================================================

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { AlertCircle, Car, ExternalLink, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HelpHint } from '@/components/ui/help-hint'
import { DEAL_HINTS } from '@/lib/glossary-deals'
import { photoSrc } from '@/lib/partner-photo'

// ── Tipos do payload ──────────────────────────────────────────────────────────

export interface DealPeekData {
  id: string
  dealNumber: string | null
  type: string
  status: string
  source: string | null
  dates: { createdAt: string | null; approvedAt: string | null; saleDate: string | null; deliveryDate: string | null; finalizedAt: string | null; cancelledAt: string | null }
  customer: { name: string | null; document: string | null; phone: string | null; email: string | null; city: string | null; state: string | null } | null
  seller: string | null
  manager: string | null
  vehicles: Array<{ id: string; vehicleId: string | null; role: string; plate: string | null; brand: string | null; model: string | null; year: number | null; color: string | null; agreedValue: number | null; evaluatedValue: number | null; photo: string | null }>
  values: {
    sale: number | null; vehicles: number; discount: number; documentation: number; services: number; debts: number; trade: number
    financed: number | null; total: number; paid: number; paidConfirmed: number; paidPending: number; balance: number; change: number
    paymentStatus: string; reconciliation: string
  }
  payments: Array<{
    id: string; type: string; method: string | null; status: string; value: number; bank: string | null; installments: number | null
    installmentValue: number | null; dueDate: string | null; paidAt: string | null
    fi?: { returnPct: number | null; returnGross: number | null; ila: number | null; iof: number | null; irrf: number | null; returnNet: number | null; plus: number | null; contractNumber: string | null } | null
  }>
  services: Array<{ id: string; name: string; kind: string | null; value: number }>
  warranties: Array<{ id: string; name: string; status: string; value: number }>
  debts: Array<{ id: string; type: string; description: string | null; vehicleRole: string | null; responsavel: string | null; value: number }>
  fi: { returnPct: number | null; returnGross: number | null; ilaPercent: number | null; ila: number | null; iofPercent: number | null; iof: number | null; returnNet: number | null } | null
  canFinance: boolean
}

// ── Contexto ──────────────────────────────────────────────────────────────────

interface DealPeekCtx { open: (dealId: string) => void; close: () => void }
const Ctx = createContext<DealPeekCtx | null>(null)

const dealHref = (id: string) => `/negociacoes/${id}`

/** Abre o resumo lateral. Fora do provider, navega para a negociação. */
export function useDealPeek(): DealPeekCtx {
  const ctx = useContext(Ctx)
  return ctx ?? {
    open: (id: string) => { if (typeof window !== 'undefined') window.location.assign(dealHref(id)) },
    close: () => undefined,
  }
}

export function DealPeekProvider({ children }: { children: ReactNode }) {
  const [dealId, setDealId] = useState<string | null>(null)
  const open = useCallback((id: string) => { if (id) setDealId(id) }, [])
  const close = useCallback(() => setDealId(null), [])
  const value = useMemo(() => ({ open, close }), [open, close])
  return (
    <Ctx.Provider value={value}>
      {children}
      {dealId && <DealPeekDrawer key={dealId} dealId={dealId} onClose={close} />}
    </Ctx.Provider>
  )
}

// ── Link ──────────────────────────────────────────────────────────────────────

const linkCls = 'font-medium text-brand-700 hover:underline'

export function DealPeekLink({ dealId, children, className, title, asButton }: {
  dealId: string | null | undefined
  children: ReactNode
  className?: string
  title?: string
  /** Renderiza sem <a> (para ficar dentro de outro link/botão). */
  asButton?: boolean
}) {
  const { open } = useDealPeek()
  if (!dealId) return <>{children}</>
  const cls = className ?? linkCls
  const label = title ?? 'Resumo da negociação'

  if (asButton) {
    const go = (ev: MouseEvent) => {
      ev.preventDefault(); ev.stopPropagation()
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey) window.open(dealHref(dealId), '_blank')
      else open(dealId)
    }
    return (
      <span role="button" tabIndex={0} title={label} className={cn('cursor-pointer', cls)} onClick={go}
        onAuxClick={(ev) => { if (ev.button === 1) { ev.preventDefault(); ev.stopPropagation(); window.open(dealHref(dealId), '_blank') } }}
        onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); open(dealId) } }}>
        {children}
      </span>
    )
  }

  return (
    <a href={dealHref(dealId)} title={label} className={cls}
      onClick={(ev) => {
        ev.stopPropagation()
        if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return
        ev.preventDefault()
        open(dealId)
      }}
      onAuxClick={(ev) => ev.stopPropagation()}>
      {children}
    </a>
  )
}

// ── Rótulos ───────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: 'Rascunho', EM_PREENCHIMENTO: 'Em preenchimento', AGUARDANDO_LIBERACAO: 'Aguardando liberação',
  AGUARDANDO_APROVACAO: 'Aguardando aprovação', LIBERADA: 'Liberada', APROVADA: 'Aprovada', RECUSADA: 'Recusada',
  DESAPROVADA: 'Desaprovada', DEVOLVIDA_PARA_CORRECAO: 'Devolvida p/ correção', AGUARDANDO_SINAL: 'Aguardando sinal',
  SINAL_RECEBIDO: 'Sinal recebido', RESERVADA: 'Reservada', AGUARDANDO_FINANCEIRO: 'Aguardando financeiro',
  FINANCEIRO_APROVADO: 'Financeiro aprovado', FINANCEIRO_REPROVADO: 'Financeiro reprovado',
  AGUARDANDO_DOCUMENTACAO: 'Aguardando documentação', DOCUMENTACAO_CONCLUIDA: 'Documentação concluída',
  AGUARDANDO_CONTRATO: 'Aguardando contrato', CONTRATO_GERADO: 'Contrato gerado', AGUARDANDO_ASSINATURA: 'Aguardando assinatura',
  ASSINADA: 'Assinada', AGUARDANDO_ENTREGA: 'Aguardando entrega', ENTREGUE: 'Entregue', EM_ANDAMENTO: 'Em andamento',
  FINALIZADA: 'Finalizada', CANCELADA: 'Cancelada', REABERTA: 'Reaberta', BLOQUEADA: 'Bloqueada',
}
function statusTone(s: string): string {
  if (s === 'FINALIZADA' || s === 'ENTREGUE' || s === 'ASSINADA') return 'bg-emerald-100 text-emerald-800'
  if (['CANCELADA', 'RECUSADA', 'DESAPROVADA', 'FINANCEIRO_REPROVADO'].includes(s)) return 'bg-red-100 text-red-700'
  if (s.startsWith('AGUARDANDO') || s === 'DEVOLVIDA_PARA_CORRECAO' || s === 'REABERTA') return 'bg-amber-100 text-amber-800'
  if (s === 'RASCUNHO' || s === 'EM_PREENCHIMENTO' || s === 'BLOQUEADA') return 'bg-gray-100 text-gray-600'
  return 'bg-blue-100 text-blue-800'
}
const TYPE_LABEL: Record<string, string> = { VENDA: 'Venda', COMPRA: 'Compra', TROCA: 'Troca', CONSIGNACAO: 'Consignação' }
const ROLE_LABEL: Record<string, string> = { VENDIDO: 'Vendido', TROCA: 'Troca', COMPRADO: 'Comprado', CONSIGNADO: 'Consignado' }
const PAYMENT_LABEL: Record<string, string> = {
  DINHEIRO: 'Dinheiro', PIX: 'PIX', SINAL: 'Sinal', ENTRADA: 'Entrada', FINANCIAMENTO: 'Financiamento',
  CARTAO_CREDITO: 'Cartão de crédito', CARTAO_DEBITO: 'Cartão de débito', BOLETO: 'Boleto', DUPLICATA: 'Duplicata',
  TRANSFERENCIA: 'Transferência', QUITACAO: 'Quitação', TROCO: 'Troco', TROCA: 'Veículo na troca', OUTRO: 'Outro', OUTROS: 'Outro',
}
const PAY_STATUS: Record<string, [string, string]> = {
  CONFIRMADO: ['Conciliado', 'bg-emerald-100 text-emerald-800'], PAGO: ['Conciliado', 'bg-emerald-100 text-emerald-800'],
  PENDENTE: ['Aguardando', 'bg-amber-100 text-amber-800'], CANCELADO: ['Cancelado', 'bg-gray-100 text-gray-500'],
  ESTORNADO: ['Estornado', 'bg-gray-100 text-gray-500'], RECUSADO: ['Recusado', 'bg-red-100 text-red-700'],
}
const DEBT_LABEL: Record<string, string> = {
  MULTA: 'Multa', IPVA: 'IPVA', LICENCIAMENTO: 'Licenciamento', FINANCIAMENTO: 'Quitação de financiamento',
  DOCUMENTACAO: 'Documentação', DESPACHANTE: 'Despachante', CAUTELAR: 'Cautelar', REPARO: 'Reparo', OUTROS: 'Outros',
}
const RESP_LABEL: Record<string, string> = { COMPRADOR: 'Comprador', CLIENTE: 'Comprador', VENDEDOR: 'Vendedor', LOJA: 'Loja' }
const RECON: Record<string, [string, string]> = {
  CONCILIADO: ['Conciliado', 'text-emerald-700'], AGUARDANDO_CONCILIACAO: ['Aguardando conciliação', 'text-amber-700'],
  FALTA_RECEBER: ['Falta receber', 'text-red-600'], SEM_VALOR: ['Sem valor', 'text-gray-500'],
}

const brl = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const pct = (v: number | null | undefined) => (v == null ? null : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%`)
const dt = (s: string | null | undefined) => {
  if (!s) return null
  const [y, m, d] = s.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
function fmtDoc(doc: string | null): string | null {
  if (!doc) return null
  const x = doc.replace(/\D/g, '')
  if (x.length === 11) return x.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (x.length === 14) return x.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return doc
}
function fmtPhone(p: string | null): string | null {
  if (!p) return null
  const x = p.replace(/\D/g, '')
  if (x.length === 11) return x.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  if (x.length === 10) return x.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  return p
}

// ── Painel ────────────────────────────────────────────────────────────────────

function DealPeekDrawer({ dealId, onClose }: { dealId: string; onClose: () => void }) {
  const [d, setD] = useState<DealPeekData | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    const ctrl = new AbortController()
    fetch(`/api/negotiations/${dealId}/summary`, { credentials: 'include', cache: 'no-store', signal: ctrl.signal })
      .then(async (r) => {
        const j = await r.json().catch(() => null)
        if (j?.success) setD(j.data)
        else setErr(j?.error ?? (r.status === 404 ? 'Negociação não encontrada.' : 'Não foi possível abrir a negociação.'))
      })
      .catch((e) => { if ((e as Error)?.name !== 'AbortError') setErr('Erro de rede.') })
    return () => ctrl.abort()
  }, [dealId])

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [onClose])

  const v = d?.values
  const live = d ? d.payments.filter((p) => !['CANCELADO', 'ESTORNADO', 'RECUSADO'].includes(p.status.toUpperCase())) : []
  const dead = d ? d.payments.filter((p) => ['CANCELADO', 'ESTORNADO', 'RECUSADO'].includes(p.status.toUpperCase())) : []
  const extras = d ? [...d.services.map((s) => ({ ...s, tag: s.kind === 'GARANTIA' ? 'Garantia' : 'Serviço', off: false })), ...d.warranties.map((w) => ({ id: w.id, name: w.name, value: w.value, kind: 'GARANTIA', tag: 'Garantia', off: w.status !== 'ATIVA' }))] : []

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label="Resumo da negociação" onClick={onClose}>
      <div className="flex h-full w-full animate-slide-in-right flex-col bg-gray-50 shadow-2xl sm:max-w-xl" onClick={(ev) => ev.stopPropagation()}>
        {/* Cabeçalho */}
        <div className="border-b border-gray-200 bg-white px-4 py-3.5 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                {d && <span className="rounded-full bg-brand-50 px-2 py-0.5 font-semibold text-brand-700">{TYPE_LABEL[d.type] ?? d.type}</span>}
                {d && <span className={cn('rounded-full px-2 py-0.5 font-semibold', statusTone(d.status))}>{STATUS_LABEL[d.status] ?? d.status}</span>}
              </div>
              <h2 className="truncate text-lg font-bold text-gray-900">Negociação {d?.dealNumber ?? ''}</h2>
              {d?.customer?.name && <p className="truncate text-sm text-gray-600">{d.customer.name}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Link href={dealHref(dealId)} onClick={onClose} className="btn-secondary whitespace-nowrap text-xs"><ExternalLink size={13} />Abrir negociação</Link>
              <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Fechar"><X size={18} /></button>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
          {err && <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle size={15} className="mt-0.5 shrink-0" />{err}</div>}
          {!d && !err && <Skeleton />}

          {d && v && (
            <>
              {/* Totais */}
              <div className="grid grid-cols-3 gap-2">
                <Kpi label="Total" value={brl(v.total)} />
                <Kpi label="Pago" value={brl(v.paid)} sub={v.paidPending > 0.009 ? `${brl(v.paidPending)} aguardando` : undefined} tone="text-emerald-700" />
                <Kpi help={<HelpHint term="SALDO_NEGOCIACAO" size={11} />} label={v.balance < -0.009 ? 'Excedente' : 'Saldo'} value={brl(Math.abs(v.balance))} sub={RECON[v.reconciliation]?.[0]} subTone={RECON[v.reconciliation]?.[1]}
                  tone={v.balance > 0.009 ? 'text-red-600' : v.balance < -0.009 ? 'text-amber-700' : 'text-emerald-700'} />
              </div>

              {/* Cliente */}
              {d.customer && (
                <Section title="Cliente">
                  <Grid>
                    <Info label="Nome" value={d.customer.name} wide />
                    <Info label="CPF/CNPJ" value={fmtDoc(d.customer.document)} mono />
                    <Info label="Telefone" value={fmtPhone(d.customer.phone)} />
                    <Info label="E-mail" value={d.customer.email} wide />
                    <Info label="Cidade/UF" value={[d.customer.city, d.customer.state].filter(Boolean).join('/') || null} />
                  </Grid>
                </Section>
              )}

              {/* Responsáveis e datas */}
              <Section title="Responsáveis e datas">
                <Grid>
                  <Info label="Vendedor" value={d.seller} />
                  <Info label="Gerente" value={d.manager} />
                  <Info label="Criada" value={dt(d.dates.createdAt)} />
                  <Info label="Aprovada" value={dt(d.dates.approvedAt)} />
                  <Info label="Venda" value={dt(d.dates.saleDate)} />
                  <Info label="Entrega" value={dt(d.dates.deliveryDate)} />
                  {d.dates.finalizedAt && <Info label="Finalizada" value={dt(d.dates.finalizedAt)} />}
                  {d.dates.cancelledAt && <Info label="Cancelada" value={dt(d.dates.cancelledAt)} />}
                </Grid>
              </Section>

              {/* Veículos */}
              {d.vehicles.length > 0 && (
                <Section title="Veículos">
                  <ul className="divide-y divide-gray-100">
                    {d.vehicles.map((x) => (
                      <li key={x.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                        <div className="flex h-11 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-100">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {x.photo ? <img src={photoSrc(x.photo, 320)} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Car size={18} className="text-gray-300" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-1.5 text-sm">
                            <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', x.role === 'TROCA' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600')}>{ROLE_LABEL[x.role] ?? x.role}</span>
                            {x.plate && <span className="font-mono text-xs font-bold text-gray-800">{x.plate}</span>}
                          </p>
                          <p className="truncate text-sm text-gray-700">{[x.brand, x.model, x.year].filter(Boolean).join(' ') || '—'}</p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">{brl(x.agreedValue ?? x.evaluatedValue)}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {/* Valores */}
              <Section title="Valores">
                <dl className="space-y-1 text-sm">
                  <Line label="Veículo" value={brl(v.vehicles)} />
                  {v.documentation > 0 && <Line label="Documentação" value={brl(v.documentation)} />}
                  {v.services > 0 && <Line label="Serviços" value={brl(v.services)} />}
                  {v.debts > 0 && <Line label="Débitos" value={brl(v.debts)} help={<HelpHint {...DEAL_HINTS.DEBITOS} size={12} />} />}
                  {v.discount > 0 && <Line label="Desconto" value={`− ${brl(v.discount)}`} tone="text-red-600" />}
                  <Line label="Total" value={brl(v.total)} strong />
                  {v.trade > 0 && <Line label="Veículo na troca" value={brl(v.trade)} muted />}
                  {v.financed != null && v.financed > 0 && <Line label="Financiado" value={brl(v.financed)} muted />}
                  <Line label="Conciliado" value={brl(v.paidConfirmed)} tone="text-emerald-700" help={<HelpHint {...DEAL_HINTS.CONCILIACAO} size={12} />} />
                  {v.paidPending > 0.009 && <Line label="Aguardando conciliação" value={brl(v.paidPending)} tone="text-amber-700" />}
                  <Line label={v.balance < -0.009 ? 'Excedente' : 'Saldo'} value={brl(Math.abs(v.balance))} strong tone={v.balance > 0.009 ? 'text-red-600' : undefined} />
                  {v.change > 0 && <Line label="Troco" value={brl(v.change)} muted />}
                </dl>
              </Section>

              {/* Pagamentos */}
              {d.payments.length > 0 && (
                <Section title="Pagamentos">
                  <ul className="divide-y divide-gray-100">
                    {[...live, ...dead].map((p) => {
                      const st = PAY_STATUS[p.status.toUpperCase()] ?? [p.status, 'bg-gray-100 text-gray-600']
                      const off = dead.includes(p)
                      return (
                        <li key={p.id} className={cn('py-2 first:pt-0 last:pb-0', off && 'opacity-50')}>
                          <div className="flex items-center gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-gray-900">
                                {PAYMENT_LABEL[p.type] ?? p.type}{p.method && p.method !== p.type ? ` · ${PAYMENT_LABEL[p.method] ?? p.method}` : ''}
                              </p>
                              <p className="truncate text-[11px] text-gray-500">
                                {[p.bank, p.installments ? `${p.installments}x${p.installmentValue ? ` de ${brl(p.installmentValue)}` : ''}` : null, p.paidAt ? `pago ${dt(p.paidAt)}` : p.dueDate ? `venc. ${dt(p.dueDate)}` : null].filter(Boolean).join(' · ') || '—'}
                              </p>
                            </div>
                            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', st[1])}>{st[0]}</span>
                            <span className={cn('w-24 shrink-0 text-right text-sm font-semibold tabular-nums text-gray-900', off && 'line-through')}>{brl(p.value)}</span>
                          </div>
                          {p.fi && (p.fi.returnNet != null || p.fi.ila != null || p.fi.iof != null || p.fi.plus != null) && (
                            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 rounded-md bg-gray-50 px-2 py-1 text-[11px] text-gray-600">
                              {p.fi.returnPct != null && <span>Retorno {pct(p.fi.returnPct)}</span>}
                              {p.fi.returnGross != null && <span>Bruto {brl(p.fi.returnGross)}</span>}
                              {p.fi.ila != null && <span>ILA {brl(p.fi.ila)}</span>}
                              {p.fi.iof != null && <span>IOF {brl(p.fi.iof)}</span>}
                              {p.fi.irrf != null && <span>IRRF {brl(p.fi.irrf)}</span>}
                              {p.fi.returnNet != null && <span className="font-semibold text-gray-800">Líquido {brl(p.fi.returnNet)}</span>}
                              {p.fi.plus != null && p.fi.plus > 0 && <span>PLUS {brl(p.fi.plus)}</span>}
                              {p.fi.contractNumber && <span>Contrato {p.fi.contractNumber}</span>}
                            </p>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </Section>
              )}

              {/* F&I da negociação (sem detalhe por pagamento) */}
              {d.fi && (d.fi.returnNet != null || d.fi.ila != null || d.fi.iof != null) && !d.payments.some((p) => p.fi && p.fi.returnNet != null) && (
                <Section title="Retorno financeiro">
                  <Grid>
                    <Info label="Retorno" value={pct(d.fi.returnPct)} />
                    <Info label="Bruto" value={d.fi.returnGross != null ? brl(d.fi.returnGross) : null} />
                    <Info label="ILA" value={d.fi.ila != null ? `${brl(d.fi.ila)}${d.fi.ilaPercent != null ? ` (${pct(d.fi.ilaPercent)})` : ''}` : null} />
                    <Info label="IOF" value={d.fi.iof != null ? `${brl(d.fi.iof)}${d.fi.iofPercent != null ? ` (${pct(d.fi.iofPercent)})` : ''}` : null} />
                    <Info label="Líquido" value={d.fi.returnNet != null ? brl(d.fi.returnNet) : null} />
                  </Grid>
                </Section>
              )}

              {/* Serviços e garantias */}
              {extras.length > 0 && (
                <Section title="Serviços e garantias">
                  <ul className="space-y-1 text-sm">
                    {extras.map((s) => (
                      <li key={s.id} className={cn('flex items-center gap-2', s.off && 'opacity-50')}>
                        <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', s.tag === 'Garantia' ? 'bg-sky-100 text-sky-700' : 'bg-gray-100 text-gray-600')}>{s.tag}</span>
                        <span className={cn('min-w-0 flex-1 truncate text-gray-800', s.off && 'line-through')}>{s.name}</span>
                        <span className="shrink-0 tabular-nums text-gray-900">{brl(s.value)}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {/* Débitos */}
              {d.debts.length > 0 && (
                <Section title="Débitos">
                  <ul className="space-y-1 text-sm">
                    {d.debts.map((x) => (
                      <li key={x.id} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-gray-800">
                          {x.description?.trim() || DEBT_LABEL[x.type] || x.type}
                          <span className="text-[11px] text-gray-500">
                            {x.vehicleRole === 'TROCA' ? ' · troca' : ''}{x.responsavel ? ` · ${RESP_LABEL[x.responsavel.toUpperCase()] ?? x.responsavel}` : ''}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums text-gray-900">{brl(x.value)}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Peças ─────────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3.5 sm:p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
      {children}
    </section>
  )
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-3 gap-y-2">{children}</div>
}

function Info({ label, value, mono, wide }: { label: string; value: string | null | undefined; mono?: boolean; wide?: boolean }) {
  return (
    <div className={cn('min-w-0', wide && 'col-span-2 sm:col-span-1')}>
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className={cn('truncate text-sm text-gray-800', mono && 'font-mono')} title={value ?? undefined}>{value || '—'}</p>
    </div>
  )
}

function Line({ label, value, strong, muted, tone, help }: { label: string; value: string; strong?: boolean; muted?: boolean; tone?: string; help?: ReactNode }) {
  return (
    <div className={cn('flex justify-between gap-3', strong && 'border-t border-gray-100 pt-1 font-semibold')}>
      <dt className={cn('inline-flex items-center gap-1', muted ? 'text-gray-400' : 'text-gray-600')}>{label}{help}</dt>
      <dd className={cn('tabular-nums', muted ? 'text-gray-400' : 'text-gray-900', tone)}>{value}</dd>
    </div>
  )
}

function Kpi({ label, value, sub, tone, subTone, help }: { label: string; value: string; sub?: string; tone?: string; subTone?: string; help?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-gray-200 bg-white px-2.5 py-2">
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-gray-500">{label}{help}</p>
      <p className={cn('truncate text-sm font-bold tabular-nums text-gray-900 sm:text-base', tone)}>{value}</p>
      {sub && <p className={cn('truncate text-[10px] text-gray-500', subTone)}>{sub}</p>}
    </div>
  )
}

function Skeleton() {
  return (
    <div className="space-y-3" aria-busy="true">
      <div className="grid grid-cols-3 gap-2">{[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-200/70" />)}</div>
      {[96, 72, 120, 140].map((h, i) => (
        <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 h-3 w-24 animate-pulse rounded bg-gray-200" />
          <div className="animate-pulse rounded bg-gray-100" style={{ height: h }} />
        </div>
      ))}
    </div>
  )
}
