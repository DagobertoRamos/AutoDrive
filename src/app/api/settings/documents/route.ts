// /api/settings/documents — Documentos › Configurações (por loja).
//   GET  → { settings, defaults }  (defaults = logo/endereço/contatos do cadastro da loja)
//   PUT  → salva cabeçalho, outorgados e validade da procuração
//   POST multipart logo → guarda um logo próprio para os documentos
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, assertTenantId, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-guards'
import { canAccessModule } from '@/lib/permissions'
import { loadDocSettings, saveDocSettings } from '@/lib/negotiation/contracts/doc-settings'
import { loadSiteConfig } from '@/lib/site/config'
import { ImageRejected, storeTenantImage } from '@/lib/site/assets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function guard(write: boolean) {
  const user = await getSessionUser()
  if (!user) return { error: unauthorizedResponse() }
  const ok = write ? canAccessModule(user.role, 'documents.pdf') : canAccessModule(user.role, 'documents') || canAccessModule(user.role, 'negotiations')
  if (!ok) return { error: forbiddenResponse() }
  const tenantId = assertTenantId(user.tenantId, user.role)
  if (!tenantId) return { error: NextResponse.json({ error: 'Escolha uma loja.' }, { status: 400 }) }
  return { user, tenantId }
}

export async function GET() {
  const g = await guard(false)
  if ('error' in g) return g.error
  const [settings, t, site] = await Promise.all([
    loadDocSettings(g.tenantId),
    prisma.tenant.findUnique({ where: { id: g.tenantId }, select: { razaoSocial: true, nomeFantasia: true, name: true, cnpj: true, logradouro: true, numero: true, complemento: true, bairro: true, city: true, state: true, zipCode: true, phone: true, email: true, logoUrl: true } }),
    loadSiteConfig(g.tenantId).catch(() => null),
  ])
  const endereco = [[t?.logradouro, t?.numero].filter(Boolean).join(', '), t?.complemento, t?.bairro, [t?.city, t?.state].filter(Boolean).join('/'), t?.zipCode ? `CEP ${t.zipCode.replace(/^(\d{5})(\d{3})$/, '$1-$2')}` : ''].filter(Boolean).join(', ')
  return NextResponse.json({
    success: true, settings, canEdit: canAccessModule(g.user.role, 'documents.pdf'),
    defaults: { nome: t?.razaoSocial || t?.nomeFantasia || t?.name || '', cnpj: t?.cnpj ?? '', logoUrl: t?.logoUrl || site?.identity?.logoUrl || '', endereco, telefone: t?.phone ?? '', email: t?.email ?? '', cidade: t?.city ?? '', uf: t?.state ?? '' },
  })
}

export async function PUT(req: NextRequest) {
  const g = await guard(true)
  if ('error' in g) return g.error
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 })
  const settings = await saveDocSettings(g.tenantId, body, g.user.id)
  return NextResponse.json({ success: true, settings })
}

export async function POST(req: NextRequest) {
  const g = await guard(true)
  if ('error' in g) return g.error
  const form = await req.formData().catch(() => null)
  const file = form?.get('logo')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Envie a imagem do logo.' }, { status: 400 })
  if (file.size > 3_000_000) return NextResponse.json({ error: 'Logo grande demais (até 3 MB).' }, { status: 400 })
  try {
    const r = await storeTenantImage(g.tenantId, 'DOC_LOGO', new Uint8Array(await file.arrayBuffer()))
    return NextResponse.json({ success: true, url: r.url })
  } catch (e) {
    if (e instanceof ImageRejected) return NextResponse.json({ error: e.message }, { status: 400 })
    return NextResponse.json({ error: 'Não foi possível guardar o logo.' }, { status: 500 })
  }
}
