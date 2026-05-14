// =============================================================================
// /api/master/communication/email
// GET  — carrega configuração global do e-mail transacional
// POST — salva/atualiza configuração
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireMaster, logMasterAction, upsertSystemSetting, getSettingGroup } from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'

const GROUP = 'email'

const KEYS = [
  'email.provider',      // smtp | sendgrid | ses | mailgun | resend
  'email.smtpHost',
  'email.smtpPort',
  'email.smtpSecure',   // true | false
  'email.smtpUser',
  'email.smtpPass',     // ⚠️ armazenado em texto — produção deve usar vault/encrypt
  'email.fromName',
  'email.fromEmail',
  'email.replyTo',
  'email.apiKey',       // para provedores API-based
  'email.domain',       // domínio de envio
  'email.monthlyLimit', // limite global de e-mails/mês
  'email.active',
]

export async function GET() {
  const { error } = await requireMaster()
  if (error) return error

  try {
    const settings = await getSettingGroup(GROUP)
    const clean: Record<string, string> = {}
    for (const [k, v] of Object.entries(settings)) {
      // Nunca expõe senha/apiKey no GET
      if (k === 'email.smtpPass' || k === 'email.apiKey') {
        clean[k.replace(`${GROUP}.`, '')] = v ? '••••••••' : ''
      } else {
        clean[k.replace(`${GROUP}.`, '')] = v
      }
    }
    return NextResponse.json({ success: true, data: clean })
  } catch (err) {
    return handlePrismaError(err)
  }
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const body = await req.json() as Record<string, string>
    const saves: Promise<void>[] = []

    for (const key of KEYS) {
      const shortKey = key.replace(`${GROUP}.`, '')
      if (shortKey in body && body[shortKey] != null) {
        // Não sobrescreve senha mascarada
        if ((shortKey === 'smtpPass' || shortKey === 'apiKey') && body[shortKey] === '••••••••') {
          continue
        }
        saves.push(upsertSystemSetting(key, String(body[shortKey]), GROUP, session.id, key))
      }
    }
    await Promise.all(saves)

    await logMasterAction(session, 'UPDATE_EMAIL_CONFIG', 'SystemSetting', null, {
      afterData: { provider: body.provider }, req,
    })

    return NextResponse.json({
      success: true,
      message: 'Configurações de e-mail salvas com sucesso.',
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
