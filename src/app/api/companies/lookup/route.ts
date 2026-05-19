// =============================================================================
// GET /api/companies/lookup?cnpj=12345678000195
//
// Proxy para consulta CNPJ. Hoje delega ao service central da BrasilAPI
// (com cache 1h), preservando 100% do shape antigo consumido pelo wizard.
//
// Motivo: centralizar a integração externa, evitar CORS no front-end,
// padronizar erros e permitir auditoria/observabilidade futuras.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { normalizeCNPJ, isValidCNPJ } from '@/lib/br-docs/cnpj'
import { getCnpj } from '@/lib/brasilapi/service'

export async function GET(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const raw  = req.nextUrl.searchParams.get('cnpj') ?? ''
  const cnpj = normalizeCNPJ(raw)
  if (!isValidCNPJ(cnpj)) {
    return NextResponse.json({ error: 'CNPJ inválido.' }, { status: 400 })
  }

  const result = await getCnpj(cnpj)

  if (!result.ok) {
    const msg    = result.error ?? 'Erro na consulta do CNPJ.'
    const status = msg.includes('inválido')      ? 400
                 : msg.includes('não encontrado') ? 404
                 : msg.includes('Limite')          ? 429
                 : 502
    return NextResponse.json({ found: false, error: msg }, { status })
  }

  const d = result.data!
  const result_payload = {
    found:         true,
    razaoSocial:   d.razao_social      ?? null,
    nomeFantasia:  d.nome_fantasia     ?? null,
    situacao:      d.descricao_situacao_cadastral ?? null,
    // Endereço
    cep:           String(d.cep ?? '').replace(/\D/g, ''),
    logradouro:    d.logradouro  ?? null,
    numero:        d.numero      ?? null,
    complemento:   d.complemento ?? null,
    bairro:        d.bairro      ?? null,
    cidade:        d.municipio   ?? null,
    estado:        d.uf          ?? null,
    // IE da empresa — BrasilAPI não expõe, mantém compatibilidade retornando null
    inscricaoEstadual: null,
  }

  return NextResponse.json(result_payload)
}
