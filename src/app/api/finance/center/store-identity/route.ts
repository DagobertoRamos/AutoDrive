// =============================================================================
// GET /api/finance/center/store-identity — identidade da loja para o cabeçalho
// das impressões do financeiro (extrato, fluxo de caixa, DRE): logo, razão
// social/nome fantasia, CNPJ, endereço, telefone e e-mail.
// Fonte: Tenant + Documentos › Configurações (cabeçalho) + logo do site da loja
// (mesma prioridade dos contratos da venda).
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { handlePrismaError } from '@/lib/prisma-errors'
import { financeGuard } from '@/lib/finance/access'
import { loadSiteConfig } from '@/lib/site/config'
import { loadDocSettings } from '@/lib/negotiation/contracts/doc-settings'
import { fmtDoc } from '@/lib/negotiation/contracts/contract-data'

export const dynamic = 'force-dynamic'

const digits = (s?: string | null) => String(s ?? '').replace(/\D/g, '')
const join = (parts: Array<string | null | undefined>, sep = ', ') => parts.map((p) => String(p ?? '').trim()).filter(Boolean).join(sep) || null

export async function GET(req: Request) {
  const g = await financeGuard('finance', req)
  if (g.error) return g.error
  const { tenantId } = g
  try {
    const t = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true, razaoSocial: true, nomeFantasia: true, cnpj: true, address: true, logradouro: true, numero: true, complemento: true,
        bairro: true, city: true, state: true, zipCode: true, phone: true, email: true, logoUrl: true,
      },
    })
    if (!t) return NextResponse.json({ success: false, error: 'Loja não encontrada.' }, { status: 404 })
    const [cfg, site] = await Promise.all([loadDocSettings(tenantId).catch(() => null), loadSiteConfig(tenantId).catch(() => null)])
    const cep = digits(t.zipCode)
    const address = join([
      join([t.logradouro ?? t.address, t.numero]), t.complemento, t.bairro, join([t.city, t.state], '/'),
      cep.length === 8 ? `CEP ${cep.slice(0, 5)}-${cep.slice(5)}` : t.zipCode,
    ])
    const razaoSocial = t.razaoSocial || t.name
    const nomeFantasia = t.nomeFantasia && t.nomeFantasia !== razaoSocial ? t.nomeFantasia : null
    return NextResponse.json({
      success: true,
      data: {
        razaoSocial, nomeFantasia,
        cnpj: fmtDoc(t.cnpj),
        address: cfg?.endereco || address,
        phone: cfg?.telefone || t.phone || null,
        email: cfg?.email || t.email || null,
        logoUrl: cfg?.logoUrl || t.logoUrl || site?.identity?.logoUrl || null,
      },
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
