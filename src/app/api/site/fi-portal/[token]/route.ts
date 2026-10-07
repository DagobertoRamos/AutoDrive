// =============================================================================
// GET /api/site/fi-portal/[token] — portal do cliente (link seguro do F&I).
// PÚBLICO: o token (24 bytes aleatórios; no banco só o hash SHA-256) é a chave.
// Expira, morre com a ficha cancelada e devolve só a visão do cliente.
// =============================================================================

import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { findByPortalToken } from '@/lib/finance/fi/orchestrator'
import { addTimeline, reflectOnCrm } from '@/lib/finance/fi/events'
import { buildPortalView } from '@/lib/finance/fi/portal'

export const dynamic = 'force-dynamic'

// Campos que o próprio cliente pode completar pelo link (só os que estão vazios).
const COMPLEMENT = ['email', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'estado', 'occupation', 'profissao', 'empresaNome', 'renda', 'tempoEmpregoMeses', 'tempoResidenciaMeses', 'estadoCivil', 'nomeMae'] as const
const OCCUPATIONS = ['AUTONOMO', 'CLT', 'EMPRESARIO', 'APOSENTADO_PENSIONISTA']

/** PATCH — cliente completa a ficha. Nunca troca o que já foi informado. */
export async function PATCH(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const p = await findByPortalToken(token)
  if (!p) return NextResponse.json({ success: false, error: 'Link inválido ou vencido. Peça um novo link à loja.' }, { status: 404 })
  if (p.status !== 'SIMULACAO' && p.status !== 'PREENCHENDO') return NextResponse.json({ success: false, error: 'A ficha já foi enviada para análise.' }, { status: 409 })
  const recent = await prisma.financeProposalEvent.count({ where: { proposalId: p.id, source: 'PORTAL', createdAt: { gte: new Date(Date.now() - 3_600_000) } } })
  if (recent >= 30) return NextResponse.json({ success: false, error: 'Muitas alterações em pouco tempo. Tente mais tarde.' }, { status: 429 })
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const person = await prisma.financeProponent.findUniqueOrThrow({ where: { id: p.proponentId } })
  const data: Record<string, unknown> = {}
  for (const k of COMPLEMENT) {
    const raw = b[k]
    if (raw == null || raw === '') continue
    const current = (person as Record<string, unknown>)[k]
    if (current != null && current !== '') continue
    if (k === 'renda') { const n = Number(String(raw).replace(/\./g, '').replace(',', '.')); if (n > 0 && n < 10_000_000) data.renda = new Prisma.Decimal(Math.round(n * 100) / 100); continue }
    if (k === 'tempoEmpregoMeses' || k === 'tempoResidenciaMeses') { const n = Math.trunc(Number(raw)); if (n >= 0 && n < 1200) data[k] = n; continue }
    if (k === 'occupation') { if (OCCUPATIONS.includes(String(raw))) data.occupation = raw; continue }
    if (k === 'estado') { const uf = String(raw).trim().toUpperCase(); if (/^[A-Z]{2}$/.test(uf)) data.estado = uf; continue }
    if (k === 'cep') { const c = String(raw).replace(/\D/g, ''); if (c.length === 8) data.cep = c; continue }
    if (k === 'email') { const e = String(raw).trim().toLowerCase(); if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) data.email = e.slice(0, 160); continue }
    data[k] = String(raw).trim().slice(0, 160)
  }
  if (!Object.keys(data).length) return NextResponse.json({ success: true, data: { updated: 0 } })
  await prisma.financeProponent.update({ where: { id: person.id }, data })
  await prisma.financeProposal.update({ where: { id: p.id }, data: { status: 'PREENCHENDO', revision: { increment: 1 } } })
  await addTimeline(prisma, { tenantId: p.tenantId, proposalId: p.id, type: 'PORTAL', source: 'PORTAL', message: `Cliente completou ${Object.keys(data).length} informação(ões) da ficha.` })
  await reflectOnCrm(p.id, 'FICHA_PREENCHIDA')
  return NextResponse.json({ success: true, data: { updated: Object.keys(data).length } })
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const p = await findByPortalToken(token)
  if (!p) return NextResponse.json({ success: false, error: 'Link inválido ou vencido. Peça um novo link à loja.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  const view = await buildPortalView(p.id)
  return NextResponse.json({ success: true, data: view }, { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } })
}
