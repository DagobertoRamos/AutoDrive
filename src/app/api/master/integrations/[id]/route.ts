// =============================================================================
// /api/master/integrations/[id] — Gerenciar credencial de integração (MASTER only)
//
// GET    — detalhes (valores sensíveis mascarados)
// PATCH  — atualizar campos
// DELETE — excluir credencial
// POST   — ações especiais: test, rotate
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireMaster, logMasterAction } from '@/lib/master-guards'
import { handlePrismaError } from '@/lib/prisma-errors'
import { prisma } from '@/lib/prisma'
import { getBanks, getCep, getCnpj, clearBrasilApiCache } from '@/lib/brasilapi/service'
import { isAnyPlateProviderConfigured, clearPlateProviderCache } from '@/lib/plate-lookup/service'
import { getReferences as getFipeReferences, clearFipeConfigCache } from '@/lib/fipe/parallelum'
import { getServiceDef } from '@/lib/integrations/catalog'
import { clearActiveCredentialCache } from '@/lib/integrations/active'

const MASKED = '••••••••'
const SENSITIVE_KEYS = ['apiKey', 'apiSecret', 'token', 'webhookSecret']

function maskSensitive(cred: Record<string, unknown>): Record<string, unknown> {
  const masked = { ...cred }
  for (const key of SENSITIVE_KEYS) {
    if (masked[key]) masked[key] = MASKED
  }
  return masked
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { error } = await requireMaster()
  if (error) return error

  try {
    const cred = await prisma.integrationCredential.findUnique({ where: { id: params.id } })
    if (!cred) {
      return NextResponse.json({ success: false, error: 'Credencial não encontrada.' }, { status: 404 })
    }
    return NextResponse.json({ success: true, data: maskSensitive(cred as unknown as Record<string, unknown>) })
  } catch (err) {
    console.error('[GET /api/master/integrations/:id]', err)
    return handlePrismaError(err)
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const cred = await prisma.integrationCredential.findUnique({ where: { id: params.id } })
    if (!cred) {
      return NextResponse.json({ success: false, error: 'Credencial não encontrada.' }, { status: 404 })
    }

    const body = await req.json()
    const { name, description, apiUrl, apiKey, apiSecret, token, username, webhookSecret, isDefault, active, notes } = body

    // ── Whitelist por serviço (catálogo) ──────────────────────────────────────
    // Garante que campos indevidos enviados acidentalmente não sejam persistidos
    // (ex: PATCH com username vindo do auto-complete do browser para FIPE).
    const def = getServiceDef(cred.service)
    const allowsField = (k: string) => !def || def.fields.includes(k as never)

    // ── Validação de URL específica do serviço ────────────────────────────────
    // Bloqueia trocar para uma URL que não pertence ao provedor (ex: cadastrar
    // PlacaFipe como BrasilAPI).
    if (def?.validateUrl && apiUrl != null) {
      const urlError = def.validateUrl(String(apiUrl).trim())
      if (urlError) {
        return NextResponse.json({ success: false, error: urlError }, { status: 400 })
      }
    }

    const data: Record<string, unknown> = {}
    if (name          != null) data.name        = String(name).trim()
    if (description   != null) data.description = String(description).trim() || null
    if (active        != null) data.active      = Boolean(active)
    if (isDefault     != null) data.isDefault   = Boolean(isDefault)
    if (notes         != null) data.notes       = String(notes).trim()       || null

    if (apiUrl   != null && allowsField('apiUrl'))   data.apiUrl   = String(apiUrl).trim()   || null
    if (username != null && allowsField('username')) data.username = String(username).trim() || null

    // ── Secrets: regra rigorosa ──────────────────────────────────────────────
    // - Não veio no body → não altera (preserva valor atual)
    // - Veio === MASKED  → ignora (placeholder, preserva valor atual)
    // - Veio com string  → atualiza
    // - Veio === ''      → limpa o valor
    // Também respeita whitelist: campos indevidos para o serviço são ignorados.
    for (const key of ['apiKey', 'apiSecret', 'token', 'webhookSecret']) {
      if (!(key in body)) continue
      if (!allowsField(key)) continue
      const val = body[key]
      if (val === MASKED || val == null) continue
      const s = String(val).trim()
      data[key] = s || null
    }

    // Limpa campos que NÃO são permitidos pelo serviço atual (cleanup defensivo)
    // — só faz isso se o usuário não estiver trocando de serviço (geralmente não pode).
    for (const k of ['apiKey', 'apiSecret', 'token', 'webhookSecret', 'username', 'apiUrl']) {
      if (!allowsField(k) && cred[k as keyof typeof cred]) {
        data[k] = null
      }
    }

    // Se isDefault=true, desmarcar outros do mesmo serviço
    if (data.isDefault === true) {
      await prisma.integrationCredential.updateMany({
        where: { service: cred.service, isDefault: true, id: { not: params.id } },
        data:  { isDefault: false },
      })
    }

    const updated = await prisma.integrationCredential.update({
      where: { id: params.id },
      data,
    })
    clearActiveCredentialCache()
    // Limpa caches de service-specific (FIPE/Brasil/Plate) que possam ter
    // memorizado credencial antiga.
    if (cred.service === 'FIPE_PROVIDER' || cred.service === 'FIPE') clearFipeConfigCache()
    if (cred.service === 'PLATE_LOOKUP') clearPlateProviderCache()
    if (cred.service === 'BRASILAPI')    clearBrasilApiCache()

    await logMasterAction(session, 'UPDATE_INTEGRATION', 'IntegrationCredential', params.id, {
      beforeData: { active: cred.active, isDefault: cred.isDefault },
      afterData:  { active: updated.active, isDefault: updated.isDefault },
      req,
    })

    return NextResponse.json({
      success: true,
      data: maskSensitive(updated as unknown as Record<string, unknown>),
      message: 'Credencial atualizada com sucesso.',
    })
  } catch (err) {
    console.error('[PATCH /api/master/integrations/:id]', err)
    return handlePrismaError(err)
  }
}

// ── DELETE ─────────────────────────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const cred = await prisma.integrationCredential.findUnique({ where: { id: params.id } })
    if (!cred) {
      return NextResponse.json({ success: false, error: 'Credencial não encontrada.' }, { status: 404 })
    }

    await prisma.integrationCredential.delete({ where: { id: params.id } })
    clearActiveCredentialCache()
    if (cred.service === 'FIPE_PROVIDER' || cred.service === 'FIPE') clearFipeConfigCache()
    if (cred.service === 'PLATE_LOOKUP') clearPlateProviderCache()
    if (cred.service === 'BRASILAPI')    clearBrasilApiCache()

    await logMasterAction(session, 'DELETE_INTEGRATION', 'IntegrationCredential', params.id, {
      beforeData: { service: cred.service, name: cred.name },
      req,
    })

    return NextResponse.json({ success: true, message: 'Credencial excluída com sucesso.' })
  } catch (err) {
    console.error('[DELETE /api/master/integrations/:id]', err)
    return handlePrismaError(err)
  }
}

// ── POST — ações especiais ────────────────────────────────────────────────────
// Ações: test (testa conexão), rotate (regenera token)

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const { action } = await req.json()

    const cred = await prisma.integrationCredential.findUnique({ where: { id: params.id } })
    if (!cred) {
      return NextResponse.json({ success: false, error: 'Credencial não encontrada.' }, { status: 404 })
    }

    if (action === 'TEST') {
      // ── Teste real por tipo de serviço ─────────────────────────────────────
      let ok      = false
      let message = ''
      const started = Date.now()

      try {
        switch (cred.service) {
          case 'BRASILAPI': {
            // Testa os 3 endpoints reais (bancos, CEP, CNPJ) para validar a
            // integração de fato. Não considera OK só porque um endpoint
            // (bancos) está cacheado.
            clearBrasilApiCache()
            const tBanks = Date.now()
            const banks  = await getBanks()
            const banksMs = Date.now() - tBanks
            const banksOk = banks.ok && Array.isArray(banks.data) && banks.data.length > 0

            const tCep = Date.now()
            const cep  = await getCep('01310100')   // Av. Paulista — sempre válido
            const cepMs = Date.now() - tCep
            const cepOk = cep.ok && !!cep.data?.cep

            const tCnpj = Date.now()
            const cnpj  = await getCnpj('00000000000191')   // Banco do Brasil — sempre válido
            const cnpjMs = Date.now() - tCnpj
            const cnpjOk = cnpj.ok && !!cnpj.data?.razao_social

            ok = banksOk && cepOk && cnpjOk
            const tag = (label: string, status: boolean, ms: number, err?: string) =>
              `${label}: ${status ? `OK (${ms}ms)` : `FALHOU${err ? ` — ${err}` : ''}`}`

            message = ok
              ? `BrasilAPI OK — Bancos: ${banks.data!.length} (${banksMs}ms) | CEP: OK (${cepMs}ms) | CNPJ: OK (${cnpjMs}ms)`
              : [
                  tag('Bancos', banksOk, banksMs, banks.error),
                  tag('CEP',    cepOk,   cepMs,   cep.error),
                  tag('CNPJ',   cnpjOk,  cnpjMs,  cnpj.error),
                ].join(' | ')
            break
          }
          case 'PLATE_LOOKUP': {
            clearPlateProviderCache()
            const configured = await isAnyPlateProviderConfigured()
            ok      = configured
            message = configured
              ? 'Provedor de placa configurado. O teste real depende de placa válida — verifique no módulo de Avaliação.'
              : 'Nenhum provedor de placa pôde ser carregado. Verifique apiUrl/apiKey.'
            break
          }
          case 'FIPE_PROVIDER': {
            // Limpa cache da credencial para forçar re-resolução com a nova chave
            clearFipeConfigCache()
            const r  = await getFipeReferences(true)
            const ms = Date.now() - started
            ok       = r.ok && Array.isArray(r.data) && r.data.length > 0
            message  = ok
              ? `FIPE/Parallelum OK — ${r.data!.length} tabelas de referência em ${ms}ms.`
              : `FIPE/Parallelum falhou: ${r.error ?? 'sem retorno'}.`
            break
          }
          case 'CEP':
          case 'CNPJ_LOOKUP':
          case 'FIPE': {
            // Esses serviços hoje rodam via BrasilAPI internamente
            clearBrasilApiCache()
            const r = await getBanks()  // proxy de saúde: se BrasilAPI está OK, todos esses funcionam
            ok      = r.ok
            message = ok
              ? 'Provedor responde normalmente (validado via BrasilAPI).'
              : `Falha de conexão: ${r.error ?? 'desconhecido'}.`
            break
          }
          default:
            ok      = false
            message = `Teste de conexão para "${cred.service}" ainda não implementado.`
        }
      } catch (e) {
        ok      = false
        message = e instanceof Error ? e.message : 'Erro inesperado no teste.'
      }

      await prisma.integrationCredential.update({
        where: { id: params.id },
        data: {
          lastTestedAt: new Date(),
          lastTestOk:   ok,
          lastTestMsg:  message.slice(0, 500),
        },
      })

      await logMasterAction(session, 'TEST_INTEGRATION', 'IntegrationCredential', params.id, {
        afterData: { service: cred.service, testResult: ok ? 'OK' : 'FAIL', message },
        req,
      })

      return NextResponse.json({
        success: ok,
        ok,
        message,
        lastTestedAt: new Date().toISOString(),
      })
    }

    return NextResponse.json({ success: false, error: `Ação desconhecida: ${action}` }, { status: 400 })
  } catch (err) {
    console.error('[POST /api/master/integrations/:id]', err)
    return handlePrismaError(err)
  }
}
