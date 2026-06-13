// =============================================================================
// POST /api/master/sheets/[id]/process-deals
// Lê a planilha diretamente e converte cada linha em uma Negociação (Deal)
// real do AutoDrive — com Customer, Vehicle, Contract e Pendências.
//
// Não requer staging pré-existente: lê, salva no staging e processa tudo
// em um único passo. Idempotente: reprocessar não duplica negociações.
//
// Body: { dryRun?: boolean, tabId?: string, maxRows?: number }
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireMaster }              from '@/lib/master-guards'
import { prisma }                     from '@/lib/prisma'
import { handlePrismaError }          from '@/lib/prisma-errors'
import { runDealProcessorFromSheet }  from '@/lib/sheets-deal-processor'

export async function POST(req: NextRequest, ctxArg: { params: { id: string } | Promise<{ id: string }> }) {
  /* ASYNC_PARAMS_FIXED */ const params = await Promise.resolve(ctxArg.params)
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const body    = await req.json().catch(() => ({}))
    const dryRun  = body.dryRun  === true
    const tabId   = body.tabId   as string | undefined
    const maxRows = Number(body.maxRows ?? 0)

    // Valida configuração
    const config = await prisma.googleSheetConfig.findUnique({
      where:   { id: params.id },
      include: { tabs: { where: { active: true } } },
    })

    if (!config) {
      return NextResponse.json({ success: false, error: 'Importador não encontrado.' }, { status: 404 })
    }
    if (!config.tenantId) {
      return NextResponse.json(
        { success: false, error: 'Importador sem tenant vinculado. Configure o tenant na aba Configurações.' },
        { status: 400 },
      )
    }
    if (!config.unitId) {
      return NextResponse.json(
        { success: false, error: 'Importador sem unidade vinculada. Configure a unidade na aba Configurações.' },
        { status: 400 },
      )
    }
    if (!config.tabs || config.tabs.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Nenhuma aba ativa cadastrada. Adicione e ative pelo menos uma aba.' },
        { status: 400 },
      )
    }

    // Executa: lê planilha + processa cada linha em Deal
    const summary = await runDealProcessorFromSheet({
      configId:      params.id,
      tabId,
      dryRun,
      maxRows:       maxRows > 0 ? maxRows : undefined,
      triggeredById: session.id,
    })

    const hasErrors = summary.errors > 0
    const success   = summary.totalRows > 0
      ? (summary.dealsCreated + summary.dealsUpdated) > 0 || dryRun
      : true  // 0 linhas = ok (planilha vazia ou sem linhas válidas)

    return NextResponse.json({
      success,
      message: dryRun
        ? `Simulação concluída — ${summary.totalRows} linhas avaliadas sem gravação.`
        : summary.totalRows === 0
          ? 'Nenhuma linha válida encontrada nas abas ativas da planilha.'
          : `${summary.dealsCreated} negociações criadas · ${summary.dealsUpdated} atualizadas · ${summary.provisionalSellers} vendedores provisórios.`,
      ...summary,
      dryRun,  // garante prioridade do dryRun do request
      ...(hasErrors ? { warning: `${summary.errors} linha(s) com erro — verifique os detalhes.` } : {}),
    })
  } catch (err) {
    return handlePrismaError(err)
  }
}
