// =============================================================================
// GET /api/integrations/plate/[plate]
// Proxy seguro à integração de placa configurada via IntegrationCredential
// (service=PLATE_LOOKUP). Se nenhuma integração estiver ativa, retorna 503
// pedindo preenchimento manual — NÃO usa BrasilAPI para placa.
// =============================================================================

import { NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { lookupPlate, isAnyPlateProviderConfigured } from '@/lib/plate-lookup/service'
import { logIntegrationCall } from '@/lib/brasilapi/audit'

export async function GET(
  _req: Request,
  { params }: { params: { plate: string } },
) {
  const session = await getServerAuthSession()
  if (!session) return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })

  const plate = String(params.plate ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

  // Se nenhum provedor configurado, retorna 503 amigável.
  if (!(await isAnyPlateProviderConfigured())) {
    return NextResponse.json(
      {
        ok:        false,
        configured:false,
        error:     'Nenhuma integração de placa configurada. Cadastre uma credencial em /master/integrations com serviço PLATE_LOOKUP.',
      },
      { status: 503 },
    )
  }

  const result = await lookupPlate(plate)

  // Auditoria reusa o helper do BrasilAPI (mesmo formato em AuditLog)
  logIntegrationCall({
    tenantId: session.user.tenantId,
    userId:   session.user.id,
    userName: session.user.name,
    userRole: session.user.role,
    endpoint: 'plateLookup',
    argument: plate,
    ok:       result.ok,
    message:  result.error,
  })

  if (!result.ok) {
    const status = result.error?.includes('inválida') ? 400
                 : result.error?.includes('não encontrada') ? 404
                 : result.error?.includes('Credencial')      ? 502
                 : 502
    return NextResponse.json({ ok: false, found: false, source: result.source, error: result.error }, { status })
  }

  // Sucesso (encontrado ou não-encontrado-validamente)
  return NextResponse.json({
    ok:        true,
    found:     result.found,
    source:    result.source,
    data:      result.data,
  })
}
