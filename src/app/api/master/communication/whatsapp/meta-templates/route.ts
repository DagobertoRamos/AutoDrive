// =============================================================================
// GET  /api/master/communication/whatsapp/meta-templates
// Lista os templates aprovados na Meta usando WABA ID + token configurados.
// Também faz upsert local em WhatsappTemplate para manter sincronizado.
// Apenas MASTER.
// =============================================================================

import { NextResponse } from 'next/server'
import { requireMaster } from '@/lib/master-guards'
import { prisma }        from '@/lib/prisma'
import { getWhatsAppConfig } from '../route'

interface MetaComponent {
  type:       string
  format?:    string
  text?:      string
  buttons?:   unknown[]
  example?:   { body_text?: string[][]; header_handle?: string[] }
}

interface MetaTemplate {
  id:          string
  name:        string
  status:      string
  category:    string
  language:    string
  components:  MetaComponent[]
  quality_score?: { score: string }
}

interface MetaTemplatesResponse {
  data?:   MetaTemplate[]
  error?:  { message: string; code: number; type?: string }
  paging?: { cursors?: { after?: string }; next?: string }
}

function countBodyVariables(components: MetaComponent[]): number {
  const body = components.find(c => c.type === 'BODY')
  if (!body?.text) return 0
  const matches = body.text.match(/\{\{(\d+)\}\}/g)
  return matches ? Math.max(...matches.map(m => parseInt(m.replace(/\D/g, ''), 10))) : 0
}

function extractHeaderType(components: MetaComponent[]): string {
  const header = components.find(c => c.type === 'HEADER')
  return header?.format?.toLowerCase() ?? 'none'
}

export async function GET() {
  const { session, error } = await requireMaster()
  if (error) return error

  const cfg = await getWhatsAppConfig().catch(() => null)

  if (!cfg?.token) {
    return NextResponse.json({ success: false, error: 'Token de acesso não configurado.', errorCode: 'NO_TOKEN' }, { status: 400 })
  }
  if (!cfg?.businessAccountId) {
    return NextResponse.json({ success: false, error: 'WABA ID (Business Account ID) não configurado.', errorCode: 'NO_WABA_ID' }, { status: 400 })
  }

  const apiVersion = cfg.apiVersion || 'v20.0'
  const baseUrl    = (cfg.apiUrl || 'https://graph.facebook.com').replace(/\/$/, '')
  const url        = `${baseUrl}/${apiVersion}/${cfg.businessAccountId}/message_templates?limit=100&fields=name,status,category,language,components,quality_score`

  try {
    const res  = await fetch(url, { headers: { Authorization: `Bearer ${cfg.token}` } })
    const json = await res.json() as MetaTemplatesResponse

    if (!res.ok || json.error) {
      const e = json.error
      return NextResponse.json(
        {
          success:      false,
          error:        e?.message ?? `HTTP ${res.status}`,
          errorCode:    e?.code ? String(e.code) : String(res.status),
        },
        { status: 502 },
      )
    }

    const templates = json.data ?? []

    // Upsert local — só APPROVED
    const approved = templates.filter(t => t.status === 'APPROVED')
    await Promise.all(
      approved.map(t =>
        prisma.whatsappTemplate.upsert({
          where:  { id: t.id },
          create: {
            id:                 t.id,
            name:               t.name,
            templateName:       t.name,
            bodyText:           t.components.find(c => c.type === 'BODY')?.text ?? null,
            variables:          [],
            expectedParamsCount: countBodyVariables(t.components),
            hasHeaderImage:     extractHeaderType(t.components) === 'image',
            active:             true,
          },
          update: {
            bodyText:           t.components.find(c => c.type === 'BODY')?.text ?? undefined,
            expectedParamsCount: countBodyVariables(t.components),
            hasHeaderImage:     extractHeaderType(t.components) === 'image',
          },
        }).catch(() => null),
      ),
    )

    // Registra no audit log
    void prisma.auditLog.create({
      data: {
        userId:   session.id,
        userName: session.name,
        userRole: 'MASTER',
        action:   'LIST_META_TEMPLATES',
        entity:   'WhatsappTemplate',
        afterData:{ count: templates.length, approved: approved.length },
        status:   'SUCCESS',
      },
    }).catch(() => {})

    // Monta resposta amigável
    const formatted = templates.map(t => ({
      id:            t.id,
      name:          t.name,
      status:        t.status,
      category:      t.category,
      language:      t.language,
      headerType:    extractHeaderType(t.components),
      bodyText:      t.components.find(c => c.type === 'BODY')?.text ?? null,
      variableCount: countBodyVariables(t.components),
      hasButtons:    t.components.some(c => c.type === 'BUTTONS'),
      qualityScore:  t.quality_score?.score ?? null,
    }))

    return NextResponse.json({ success: true, data: formatted, total: formatted.length })
  } catch (err) {
    const e = err as { message?: string; code?: string }
    return NextResponse.json(
      { success: false, error: e.message ?? 'Erro ao buscar templates.', errorCode: e.code ?? 'FETCH_ERROR' },
      { status: 500 },
    )
  }
}
