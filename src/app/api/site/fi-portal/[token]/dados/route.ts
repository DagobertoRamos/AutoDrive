// =============================================================================
// /api/site/fi-portal/[token]/dados — ficha cadastral completa pelo CLIENTE.
// PÚBLICO: o token do link seguro é a chave (expira, morre com a ficha).
//   GET            : tipo (PF/PJ) + QUAIS campos já estão informados (sem
//                    devolver os valores — quem tem o link não lê dado pessoal)
//                    e só as respostas que abrem seções (ocupação, estado civil…).
//   GET ?cep= / ?cnpj= : busca de endereço / empresa para autopreencher.
//   PATCH { fields } : completa SÓ o que está vazio; valida campo a campo.
// =============================================================================

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getCep, getCnpj } from '@/lib/brasilapi/service'
import { findByPortalToken } from '@/lib/finance/fi/orchestrator'
import { addTimeline, reflectOnCrm } from '@/lib/finance/fi/events'
import { FIELDS, FIELD_BY_KEY, isFilled } from '@/lib/finance/fi/fields-core'
import { monthsSince, normalizeField } from '@/lib/finance/fi/field-input'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }
const gone = () => NextResponse.json({ success: false, error: 'Link inválido ou vencido. Peça um novo link à loja.' }, { status: 404, headers: NO_STORE })
/** Respostas sem dado pessoal que decidem quais seções aparecem. */
const PUBLIC_KEYS = ['occupation', 'estadoCivil', 'tipoResidencia'] as const
/** Nunca pelo link: dados que identificam o cliente/empresa na ficha. */
const BLOCKED = new Set(['cpf', 'cnpj', 'nomeCompleto', 'razaoSocial'])

const plain = (v: unknown) => (v instanceof Prisma.Decimal ? Number(v) : v instanceof Date ? v.toISOString().slice(0, 10) : v)

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const p = await findByPortalToken(token)
  if (!p) return gone()
  const sp = new URL(req.url).searchParams
  const cep = sp.get('cep')?.replace(/\D/g, '')
  if (cep) {
    const r = cep.length === 8 ? await getCep(cep) : null
    const d = r?.ok ? r.data : null
    return NextResponse.json({ success: !!d, data: d ? { logradouro: d.street ?? '', bairro: d.neighborhood ?? '', cidade: d.city ?? '', estado: d.state ?? '' } : null }, { headers: NO_STORE })
  }
  const cnpj = sp.get('cnpj')?.replace(/\D/g, '')
  if (cnpj) {
    const r = cnpj.length === 14 ? await getCnpj(cnpj) : null
    const d = r?.ok ? r.data : null
    return NextResponse.json({
      success: !!d,
      data: d ? {
        razaoSocial: d.razao_social ?? null, nomeFantasia: d.nome_fantasia ?? null, cep: String(d.cep ?? '').replace(/\D/g, ''), logradouro: d.logradouro ?? null,
        numero: d.numero ?? null, complemento: d.complemento ?? null, bairro: d.bairro ?? null, cidade: d.municipio ?? null, estado: d.uf ?? null,
        dataAbertura: d.data_inicio_atividade ?? null, naturezaJuridica: d.natureza_juridica ?? null, atividade: d.cnae_fiscal_descricao ?? null,
        capitalSocial: typeof d.capital_social === 'number' ? d.capital_social : null, telefone: String(d.ddd_telefone_1 ?? '').replace(/\D/g, '') || null,
        socios: (d.qsa ?? []).map((s) => ({ nome: s.nome_socio ?? '', cargo: s.qualificacao_socio ?? '' })).filter((s) => s.nome),
      } : null,
    }, { headers: NO_STORE })
  }
  const person = await prisma.financeProponent.findUniqueOrThrow({ where: { id: p.proponentId } })
  const rec = person as unknown as Record<string, unknown>
  const filled = FIELDS.map((f) => f.key).filter((k) => isFilled(k, plain(rec[k])) || BLOCKED.has(k))
  const values = Object.fromEntries(PUBLIC_KEYS.map((k) => [k, rec[k] ?? null]))
  return NextResponse.json({ success: true, data: { personType: person.personType === 'PJ' ? 'PJ' : 'PF', filled, values, editable: p.status === 'SIMULACAO' || p.status === 'PREENCHENDO' } }, { headers: NO_STORE })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const p = await findByPortalToken(token)
  if (!p) return gone()
  if (p.status !== 'SIMULACAO' && p.status !== 'PREENCHENDO') return NextResponse.json({ success: false, error: 'A ficha já foi enviada para análise. Fale com a loja para alterar.' }, { status: 409 })
  const recent = await prisma.financeProposalEvent.count({ where: { proposalId: p.id, source: 'PORTAL', createdAt: { gte: new Date(Date.now() - 3_600_000) } } })
  if (recent >= 30) return NextResponse.json({ success: false, error: 'Muitas alterações em pouco tempo. Tente mais tarde.' }, { status: 429 })
  const parsed = z.object({ fields: z.record(z.string().max(40), z.unknown()) }).safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ success: false, error: 'Dados inválidos.' }, { status: 400 })

  const person = await prisma.financeProponent.findUniqueOrThrow({ where: { id: p.proponentId } })
  const rec = person as unknown as Record<string, unknown>
  const data: Record<string, unknown> = {}
  const errors: Record<string, string> = {}
  for (const [k, v] of Object.entries(parsed.data.fields).slice(0, FIELDS.length)) {
    const def = FIELD_BY_KEY[k]
    if (!def || BLOCKED.has(k)) continue
    if (def.for !== 'AMBOS' && def.for !== (person.personType === 'PJ' ? 'PJ' : 'PF')) continue
    if (isFilled(k, plain(rec[k]))) continue // nunca troca o que já foi informado
    const r = normalizeField(k, v)
    if (!r.ok) { errors[k] = r.error; continue }
    if (r.value != null) data[k] = r.value
  }
  if (Object.keys(errors).length) return NextResponse.json({ success: false, error: Object.values(errors)[0], fieldErrors: errors }, { status: 422 })
  if (data.dataAdmissao instanceof Date) data.tempoEmpregoMeses = monthsSince(data.dataAdmissao)
  if (Array.isArray(data.socios) && !person.representanteNome && !person.representanteCpf && !data.representanteNome) {
    const rep = (data.socios as Record<string, unknown>[]).find((s) => s.assina === 'SIM' && String(s.documento ?? '').length === 11)
    if (rep) { data.representanteNome = rep.nome; data.representanteCpf = rep.documento }
  }
  const n = Object.keys(data).length
  if (!n) return NextResponse.json({ success: true, data: { updated: 0 } })
  await prisma.financeProponent.update({ where: { id: person.id }, data: data as Prisma.FinanceProponentUpdateInput })
  await prisma.financeProposal.update({ where: { id: p.id }, data: { status: 'PREENCHENDO', revision: { increment: 1 } } })
  await addTimeline(prisma, { tenantId: p.tenantId, proposalId: p.id, type: 'PORTAL', source: 'PORTAL', message: `Cliente completou ${n} ${n === 1 ? 'informação' : 'informações'} da ficha pelo link.` })
  await reflectOnCrm(p.id, 'FICHA_PREENCHIDA')
  return NextResponse.json({ success: true, data: { updated: n } })
}
