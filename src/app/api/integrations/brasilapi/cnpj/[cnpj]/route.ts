// =============================================================================
// GET /api/integrations/brasilapi/cnpj/[cnpj]
// Proxy seguro à BrasilAPI para consulta de CNPJ.
// Retorna dados normalizados para o frontend; QSA exposto somente para
// roles de gerência+ (evita expor dados sensíveis de sócios para VENDEDOR).
// =============================================================================

import { NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { getCnpj }   from '@/lib/brasilapi/service'
import { logIntegrationCall } from '@/lib/brasilapi/audit'

const MANAGER_PLUS = new Set(['MASTER', 'ADM', 'GERENTE_GERAL', 'GERENTE'])

export async function GET(
  _req: Request,
  { params }: { params: { cnpj: string } },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })

  const cnpjArg = String(params.cnpj ?? '').replace(/\D/g, '')
  const result  = await getCnpj(cnpjArg)

  logIntegrationCall({
    tenantId: session.user.tenantId,
    userId:   session.user.id,
    userName: session.user.name,
    userRole: session.user.role,
    endpoint: 'brasilapi.getCnpj',
    argument: cnpjArg,
    ok:       result.ok,
    message:  result.error,
  })

  if (!result.ok) {
    const status = result.error?.includes('inválido') ? 400
                 : result.error?.includes('não encontrado') ? 404
                 : 502
    return NextResponse.json({ ok: false, found: false, error: result.error ?? 'Falha na consulta.' }, { status })
  }

  const d = result.data!
  const canSeeQsa = MANAGER_PLUS.has(session.user.role)

  return NextResponse.json({
    ok:    true,
    found: true,
    source: result.source,
    data: {
      cnpj:              cnpjArg,
      razaoSocial:       d.razao_social      ?? '',
      nomeFantasia:      d.nome_fantasia     ?? '',
      email:             d.email             ?? '',
      telefone1:         d.ddd_telefone_1    ?? '',
      telefone2:         d.ddd_telefone_2    ?? '',
      situacao:          d.descricao_situacao_cadastral ?? '',
      cnaePrincipal:     d.cnae_fiscal_descricao        ?? '',
      naturezaJuridica:  d.natureza_juridica            ?? '',
      dataAbertura:      d.data_inicio_atividade        ?? '',
      // Endereço
      cep:         String(d.cep ?? '').replace(/\D/g, ''),
      logradouro:  d.logradouro  ?? '',
      numero:      d.numero      ?? '',
      complemento: d.complemento ?? '',
      bairro:      d.bairro      ?? '',
      cidade:      d.municipio   ?? '',
      estado:      d.uf          ?? '',
      // Sócios apenas para gerência+
      qsa:         canSeeQsa ? (d.qsa ?? []) : undefined,
    },
  })
}
