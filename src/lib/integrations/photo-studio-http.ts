// Resposta e autenticação comuns às rotas /api/integrations/photos/*.
// Auth: header `x-autoconf-token` — o token de integração da loja, o mesmo que
// a extensão já usa para as negociações. Resolve a loja (tenant) pelo token.

import { NextResponse } from 'next/server'
import { resolveTenantByToken } from './autoconf'
import { StudioError } from './photo-studio'

export async function tenantFromToken(req: Request): Promise<string | NextResponse> {
  const token = req.headers.get('x-autoconf-token')?.trim() ?? ''
  const tenantId = await resolveTenantByToken(token)
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Token de integração inválido. Confira o "Token do AutoDrive" na extensão.' },
      { status: 401 },
    )
  }
  return tenantId
}

export function studioErrorResponse(err: unknown): NextResponse {
  if (err instanceof StudioError) return NextResponse.json({ success: false, error: err.message }, { status: err.status })
  console.error('[photo-studio]', err)
  const message = err instanceof Error ? err.message : 'Erro inesperado'
  return NextResponse.json({ success: false, error: `Falha no AutoDrive: ${message}` }, { status: 500 })
}
