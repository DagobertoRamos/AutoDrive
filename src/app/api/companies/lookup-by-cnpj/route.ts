// =============================================================================
// GET /api/companies/lookup-by-cnpj?cnpj=12345678000190
//
// Consulta dados empresariais via adapter de providers.
// - MASTER only
// - Toda consulta ocorre no backend (nunca expõe API keys)
// - Aceita fontes autorizadas configuráveis via env vars
// - Fallback para BrasilAPI (dados públicos da Receita Federal)
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { normalizeCNPJ, isValidCNPJ } from '@/lib/br-docs/cnpj'
import { lookupCNPJ } from '@/lib/cnpj-lookup'
import { createSafeAuditLog } from '@/lib/auth-guards'

export async function GET(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session || session.user.role !== 'MASTER') {
    return NextResponse.json({ success: false, error: 'Acesso negado.' }, { status: 403 })
  }

  const raw  = req.nextUrl.searchParams.get('cnpj') ?? ''
  const cnpj = normalizeCNPJ(raw)

  if (!isValidCNPJ(cnpj)) {
    return NextResponse.json(
      { success: false, error: 'CNPJ inválido.' },
      { status: 400 },
    )
  }

  const result = await lookupCNPJ(cnpj)

  // Audit não bloqueante — não falha a requisição se o log falhar
  void createSafeAuditLog({
    userId:   session.user.id,
    tenantId: null,
    action:   'LOOKUP_CNPJ',
    entity:   'Company',
    entityId: cnpj,
    userName: session.user.name,
    userRole: session.user.role,
    status:   result.success ? 'SUCCESS' : 'ERROR',
  })

  // ── Erro técnico (timeout, URL inválida, credencial errada, rede caída) ──
  // Distingue claramente do "CNPJ não existe na Receita" (404 lógico).
  if (!result.success) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[lookup-by-cnpj] CNPJ=${cnpj} fonte=${result.source} erro=`, result.error)
    }
    return NextResponse.json(
      {
        success:       false,
        found:         false,
        ok:            false,
        source:        result.source ?? 'brasilapi',
        error:         result.error ?? 'Não foi possível consultar a BrasilAPI neste momento.',
        technicalCode: 'BRASILAPI_CNPJ_FAILED',
        retryable:     true,
      },
      { status: 502 },
    )
  }

  // ── Sucesso (encontrado ou não-encontrado validado pela API) ────────────
  return NextResponse.json({
    success:  true,
    ok:       true,
    found:    result.found,
    source:   result.source,
    data:     result.data ?? null,
    message:  result.found
      ? 'Dados da empresa carregados automaticamente.'
      : (result.message ?? 'CNPJ não encontrado na Receita Federal. Preencha os dados manualmente.'),
  })
}
