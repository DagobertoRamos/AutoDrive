// =============================================================================
// Cadastro do cliente (Person) a partir do assistente de negociação.
// Grava ao avançar da etapa Cliente — fica disponível para as próximas
// negociações (busca por CPF/CNPJ). Cria ou atualiza pelo documento;
// atualização só preenche/troca campos informados (nunca apaga com vazio).
// =============================================================================

import type { Prisma, PrismaClient } from '@prisma/client'

type Db = PrismaClient | Prisma.TransactionClient

export interface PersonInput {
  type?: 'FISICA' | 'JURIDICA' | string | null
  cpf?: string | null; cnpj?: string | null; nomeCompleto?: string | null
  rg?: string | null; dataNascimento?: string | null; nomeMae?: string | null
  razaoSocial?: string | null; nomeFantasia?: string | null; inscricaoEstadual?: string | null
  socioAdmNome?: string | null; socioAdmCpf?: string | null; socioAdmPhone?: string | null
  socioAdmNomeMae?: string | null; socioAdmEmail?: string | null; socioAdmWhatsapp?: boolean | null
  socioAdmRg?: string | null; socioAdmDataNascimento?: string | null; socioAdmCep?: string | null
  socioAdmLogradouro?: string | null; socioAdmNumero?: string | null; socioAdmComplemento?: string | null
  socioAdmBairro?: string | null; socioAdmCidade?: string | null; socioAdmEstado?: string | null
  email?: string | null; phone?: string | null; whatsapp?: boolean | null
  cep?: string | null; logradouro?: string | null; numero?: string | null; complemento?: string | null
  bairro?: string | null; cidade?: string | null; estado?: string | null
}

const txt = (v: unknown, max = 200) => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s.slice(0, max) : null
}
const digits = (v: unknown) => (typeof v === 'string' ? v.replace(/\D/g, '') : '') || null

/** Campos do Person informados no formulário (só os preenchidos). PURO. */
export function personFields(p: PersonInput): Record<string, unknown> {
  const isPJ = p.type === 'JURIDICA'
  const out: Record<string, unknown> = {
    type: isPJ ? 'JURIDICA' : 'FISICA',
    cpf: isPJ ? null : digits(p.cpf),
    cnpj: isPJ ? digits(p.cnpj) : null,
    nomeCompleto: txt(isPJ ? p.razaoSocial ?? p.nomeCompleto : p.nomeCompleto),
    rg: txt(p.rg, 30), nomeMae: txt(p.nomeMae),
    dataNascimento: p.dataNascimento && !isNaN(Date.parse(p.dataNascimento)) ? new Date(p.dataNascimento) : null,
    razaoSocial: txt(p.razaoSocial), nomeFantasia: txt(p.nomeFantasia), inscricaoEstadual: txt(p.inscricaoEstadual, 40),
    socioAdmNome: txt(p.socioAdmNome), socioAdmCpf: digits(p.socioAdmCpf), socioAdmPhone: digits(p.socioAdmPhone),
    socioAdmNomeMae: txt(p.socioAdmNomeMae), socioAdmEmail: txt(p.socioAdmEmail),
    email: txt(p.email), phone: digits(p.phone),
    cep: digits(p.cep), logradouro: txt(p.logradouro), numero: txt(p.numero, 20), complemento: txt(p.complemento),
    bairro: txt(p.bairro), cidade: txt(p.cidade), estado: txt(p.estado, 2),
  }
  // Remove vazios: atualização nunca apaga o que já estava cadastrado.
  for (const k of Object.keys(out)) if (out[k] == null || out[k] === '') delete out[k]
  if (typeof p.whatsapp === 'boolean') out.whatsapp = p.whatsapp
  if (isPJ && typeof p.socioAdmWhatsapp === 'boolean') out.socioAdmWhatsapp = p.socioAdmWhatsapp
  return out
}

/** Extras do sócio administrador (sem coluna própria: vão para notes, como na criação da negociação). */
function socioExtrasNotes(p: PersonInput): string | null {
  if (p.type !== 'JURIDICA') return null
  const extras = {
    socioAdmRg: p.socioAdmRg ?? null, socioAdmDataNascimento: p.socioAdmDataNascimento ?? null, socioAdmCep: p.socioAdmCep ?? null,
    socioAdmLogradouro: p.socioAdmLogradouro ?? null, socioAdmNumero: p.socioAdmNumero ?? null, socioAdmComplemento: p.socioAdmComplemento ?? null,
    socioAdmBairro: p.socioAdmBairro ?? null, socioAdmCidade: p.socioAdmCidade ?? null, socioAdmEstado: p.socioAdmEstado ?? null,
  }
  return Object.values(extras).some((v) => v != null && v !== '') ? `__socioAdmExtras__=${JSON.stringify(extras)}` : null
}

/**
 * Cria ou atualiza o cliente da loja. Ordem: id informado (da mesma loja) →
 * mesmo CPF/CNPJ na loja → novo cadastro. Retorna o id e se foi criado.
 */
export async function upsertPerson(db: Db, tenantId: string | null, input: PersonInput, personId?: string | null):
  Promise<{ id: string; created: boolean } | { error: string }> {
  const data = personFields(input)
  const notes = socioExtrasNotes(input)
  if (notes) data.notes = notes
  const doc = data.cpf ? { cpf: data.cpf as string } : data.cnpj ? { cnpj: data.cnpj as string } : null

  let existing = personId
    ? await db.person.findFirst({ where: { id: personId, tenantId: tenantId ?? undefined }, select: { id: true } })
    : null
  if (!existing && doc) existing = await db.person.findFirst({ where: { tenantId: tenantId ?? undefined, ...doc }, select: { id: true } })

  if (existing) {
    // Documento de outro cadastro da loja? não troca (evita duplicar/“roubar” CPF).
    if (doc) {
      const clash = await db.person.findFirst({ where: { tenantId: tenantId ?? undefined, ...doc, id: { not: existing.id } }, select: { id: true } })
      if (clash) { delete data.cpf; delete data.cnpj }
    }
    await db.person.update({ where: { id: existing.id }, data: data as Prisma.PersonUpdateInput })
    return { id: existing.id, created: false }
  }
  if (!data.nomeCompleto) return { error: 'Informe o nome do cliente.' }
  const row = await db.person.create({ data: { ...(data as Prisma.PersonUncheckedCreateInput), tenantId }, select: { id: true } })
  return { id: row.id, created: true }
}
