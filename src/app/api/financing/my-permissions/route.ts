// =============================================================================
// /api/financing/my-permissions — capacidades F&I efetivas do usuário atual
// (RBAC base + Permissões F&I da loja). Só para a interface esconder o que não
// pode; o bloqueio real é no servidor de cada rota.
// =============================================================================

import { NextResponse } from 'next/server'
import { canAccessModule } from '@/lib/permissions'
import { fiPermissionsFor } from '@/lib/finance/fi-permissions'
import { fiAuth, fiErrorResponse } from '@/lib/finance/fi/route'

export async function GET(req: Request) {
  const auth = await fiAuth(req)
  if (!auth.ok) return auth.res
  try {
    const caps = await fiPermissionsFor(auth.tenantId, auth.user.role)
    const canManage = canAccessModule(auth.user.role, 'financing.manage')
    const canConfig = canAccessModule(auth.user.role, 'financing.config')
    const data = {
      ...caps,
      criarFicha: canManage && caps.criarFicha,
      editarFicha: canManage && caps.editarFicha,
      enviarFicha: canManage && caps.enviarFicha,
      aprovar: canManage && caps.aprovar,
      formalizar: canManage && caps.formalizar,
      cancelarProposta: canManage && caps.cancelarProposta,
      alterarRetorno: canConfig && caps.alterarRetorno,
      configurarBancos: canManage && caps.configurarBancos,
    }
    return NextResponse.json({ success: true, data })
  } catch (err) { return fiErrorResponse(err) }
}
