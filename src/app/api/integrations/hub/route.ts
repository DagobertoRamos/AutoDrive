// GET /api/integrations/hub — canais da loja: capacidades, disponibilidade e estado real.
import { NextResponse } from 'next/server'
import { hubGuard } from '@/lib/integrations/hub/guard'
import { hubStatus } from '@/lib/integrations/hub/status'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const g = await hubGuard(req)
  if (!g.ok) return g.response
  return NextResponse.json({ success: true, data: await hubStatus(g.tenantId) })
}
