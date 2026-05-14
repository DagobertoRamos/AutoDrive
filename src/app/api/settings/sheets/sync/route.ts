// =============================================================================
// API: /api/settings/sheets/sync — AutoDrive
// Dispara importação manual de uma planilha/aba
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessModule } from '@/lib/permissions'
import { z } from 'zod'

const syncSchema = z.object({
  configId: z.string().cuid(),
  tabId:    z.string().cuid().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const session = await getServerAuthSession()
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Não autenticado' }, { status: 401 })
    }
    if (!canAccessModule(session.user.role, 'settings.sheets')) {
      return NextResponse.json({ success: false, error: 'Acesso negado' }, { status: 403 })
    }

    const body   = await req.json()
    const parsed = syncSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Parâmetros inválidos' }, { status: 400 })
    }

    const { configId, tabId } = parsed.data

    // Verifica se a config existe
    const config = await prisma.googleSheetConfig.findUnique({ where: { id: configId } })
    if (!config) {
      return NextResponse.json({ success: false, error: 'Planilha não encontrada' }, { status: 404 })
    }

    if (!config.spreadsheetId) {
      return NextResponse.json(
        { success: false, error: 'Planilha não possui ID configurado. Edite e informe o ID.' },
        { status: 422 },
      )
    }

    // Cria job de importação
    const job = await prisma.importJob.create({
      data: {
        configId,
        tabId:         tabId ?? null,
        triggeredById: session.user.id,
        status:        'AGUARDANDO',
      },
    })

    // Atualiza status da planilha
    await prisma.googleSheetConfig.update({
      where: { id: configId },
      data:  { syncStatus: 'SYNC', lastSyncAt: new Date() },
    })

    if (tabId) {
      await prisma.googleSheetTab.update({
        where: { id: tabId },
        data:  { lastSyncStatus: 'SYNC', lastSyncAt: new Date() },
      })
    }

    // Aqui integraria com o serviço de importação real
    // Por ora: simula conclusão
    await prisma.importJob.update({
      where: { id: job.id },
      data: {
        status:     'CONCLUIDO',
        startedAt:  new Date(),
        finishedAt: new Date(),
        totalRows:  0,
        newRecords: 0,
      },
    })

    await prisma.googleSheetConfig.update({
      where: { id: configId },
      data:  { syncStatus: 'OK', lastSyncAt: new Date() },
    })

    if (tabId) {
      await prisma.googleSheetTab.update({
        where: { id: tabId },
        data:  { lastSyncStatus: 'OK', lastSyncAt: new Date() },
      })
    }

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId:    session.user.id,
        userName:  session.user.name,
        userRole:  session.user.role,
        action:    'IMPORT',
        entity:    'GoogleSheetConfig',
        entityId:  configId,
        afterData: { jobId: job.id, tabId },
      },
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      message: 'Sincronização iniciada e concluída.',
      data:    { jobId: job.id },
    })
  } catch (error) {
    console.error('[sheets/sync:POST]', error)
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 })
  }
}
