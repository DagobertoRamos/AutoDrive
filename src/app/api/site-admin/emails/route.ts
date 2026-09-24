// =============================================================================
// /api/site-admin/emails — e-mails de aviso de lead do site.
//   GET : configuração, se há servidor de e-mail disponível e o histórico. Gate: site.
//   POST: { to } envia um e-mail de teste. Gate: site.manage.
// O servidor (SMTP) é o da loja ou, sem ele, o da plataforma (MASTER).
// =============================================================================

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { forbiddenResponse, getSessionUser, unauthorizedResponse } from '@/lib/auth-guards'
import { resolveActingTenant, actingTenantError } from '@/lib/acting-tenant'
import { canAccessModuleForUser } from '@/lib/tenant-modules'
import { sendMail } from '@/lib/mailer'
import { loadSiteConfig } from '@/lib/site/config'
import { appendEmailLog, readEmailLog } from '@/lib/site/lead-email'
import { EMAIL_RE, esc } from '@/lib/site/lead-email-core'

export const dynamic = 'force-dynamic'

async function mailServer(tenantId: string): Promise<'LOJA' | 'PLATAFORMA' | null> {
  const where = { active: true, purpose: { in: ['TRANSACTIONAL', 'SYSTEM'] as ('TRANSACTIONAL' | 'SYSTEM')[] } }
  const [own, global, legacy] = await Promise.all([
    prisma.emailConfig.count({ where: { ...where, tenantId } }),
    prisma.emailConfig.count({ where: { ...where, tenantId: null } }),
    prisma.systemSetting.count({ where: { group: 'email', key: { in: ['email.provider', 'provider'] } } }),
  ]).catch(() => [0, 0, 0])
  return own ? 'LOJA' : global || legacy ? 'PLATAFORMA' : null
}

export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'site')) return forbiddenResponse('Sem acesso ao site da loja.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const [config, server, log] = await Promise.all([loadSiteConfig(tenantId), mailServer(tenantId), readEmailLog(tenantId)])
  return NextResponse.json({ success: true, data: { settings: config.emails, server, log, canManage: await canAccessModuleForUser(user, 'site.manage'), userEmail: user.email ?? '' } })
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return unauthorizedResponse()
  if (!await canAccessModuleForUser(user, 'site.manage')) return forbiddenResponse('Sem permissão para configurar o site.')
  const tenantId = await resolveActingTenant(user, req)
  if (!tenantId) return forbiddenResponse(actingTenantError(user))
  const to = String((await req.json().catch(() => ({})) as { to?: unknown }).to ?? '').trim()
  if (!EMAIL_RE.test(to)) return NextResponse.json({ success: false, error: 'Informe um e-mail válido.' }, { status: 400 })
  const config = await loadSiteConfig(tenantId)
  const subject = `Teste de e-mail — site ${config.identity.name}`
  const r = await sendMail({
    to, subject, text: 'Se você recebeu esta mensagem, os avisos de lead do site estão prontos para chegar neste endereço.',
    html: `<p>Se você recebeu esta mensagem, os avisos de lead do site <b>${esc(config.identity.name)}</b> estão prontos para chegar neste endereço.</p>`,
  }, { tenantId, purpose: 'TRANSACTIONAL' })
  await appendEmailLog(tenantId, [{ at: new Date().toISOString(), kind: 'TESTE', to, subject, status: r.success ? 'ENVIADO' : 'FALHOU', ...(r.success ? {} : { error: r.errorMessage?.slice(0, 200) }) }])
  return r.success
    ? NextResponse.json({ success: true })
    : NextResponse.json({ success: false, error: r.errorCode === 'NO_CONFIG' ? 'Não há servidor de e-mail configurado na plataforma.' : r.errorMessage ?? 'Falha no envio.' }, { status: 502 })
}
