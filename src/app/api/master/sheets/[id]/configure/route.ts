// POST /api/master/sheets/[id]/configure
// Salva toda a configuração do importador de uma vez:
// planilha + abas + mapeamentos de colunas + auto-sync

import { NextRequest, NextResponse } from 'next/server'
import { requireMaster }          from '@/lib/master-guards'
import { handlePrismaError }      from '@/lib/prisma-errors'
import { prisma }                 from '@/lib/prisma'

interface ColumnMapIn {
  columnLetter: string
  columnHeader?: string | null
  fieldName:    string
  fieldLabel?:  string | null
  required?:    boolean
  transform?:   string | null
  defaultValue?: string | null
  active?:      boolean
}

interface TabIn {
  id?:            string   // se presente → atualiza; se ausente → cria
  sheetName:      string
  internalName?:  string
  gid?:           string | null
  monthReference?: string | null
  tabType?:       string
  sortOrder?:     number
  active?:        boolean
  headerRow?:     number
  columnMaps?:    ColumnMapIn[]
}

interface AutoSyncIn {
  enabled:             boolean
  mode?:               string
  frequencyMinutes?:   number
  allowedDays?:        number[]
  startTime?:          string
  endTime?:            string
  selectedTabs?:       string[] | null
  actionAfterDownload?: string
  notifyOnNewRecords?: boolean
  notifyOnError?:      boolean
  errorNotifyTarget?:  string | null
  maxRowsPerRun?:      number
  timeoutSeconds?:     number
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { session, error } = await requireMaster()
  if (error) return error

  try {
    const body: {
      name?:         string
      spreadsheetId?: string
      description?:  string | null
      active?:       boolean
      tabs?:         TabIn[]
      tabsToDelete?: string[]    // IDs de abas removidas pelo usuário
      autoSync?:     AutoSyncIn | null
    } = await req.json()

    // ── 1. Garante que o importer existe ──────────────────────────────────────
    const existing = await prisma.googleSheetConfig.findUnique({ where: { id: params.id } })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Importador não encontrado.' }, { status: 404 })
    }

    // ── 2. Monta operações num único transaction ───────────────────────────────
    await prisma.$transaction(async (tx) => {

      // 2a. Atualiza o importer
      if (body.name !== undefined || body.spreadsheetId !== undefined || body.active !== undefined) {
        await tx.googleSheetConfig.update({
          where: { id: params.id },
          data: {
            ...(body.name          !== undefined ? { name:          body.name          } : {}),
            ...(body.spreadsheetId !== undefined ? { spreadsheetId: body.spreadsheetId } : {}),
            ...(body.description   !== undefined ? { description:   body.description   } : {}),
            ...(body.active        !== undefined ? { active:        body.active        } : {}),
          },
        })
      }

      // 2b. Remove abas deletadas pelo usuário
      if (Array.isArray(body.tabsToDelete) && body.tabsToDelete.length > 0) {
        await tx.googleSheetTab.deleteMany({
          where: { id: { in: body.tabsToDelete }, configId: params.id },
        })
      }

      // 2c. Upsert abas
      const savedTabIds: string[] = []
      for (const tab of (body.tabs ?? [])) {
        let tabId: string

        if (tab.id) {
          // Atualiza aba existente
          const updated = await tx.googleSheetTab.update({
            where: { id: tab.id, configId: params.id },
            data: {
              sheetName:      tab.sheetName,
              internalName:   tab.internalName ?? tab.sheetName,
              gid:            tab.gid            ?? null,
              monthReference: tab.monthReference ?? null,
              tabType:        (tab.tabType as any) ?? 'PERSONALIZADO',
              sortOrder:      tab.sortOrder      ?? 0,
              active:         tab.active         ?? true,
              headerRow:      tab.headerRow      ?? 1,
            },
          })
          tabId = updated.id
        } else {
          // Cria nova aba
          const created = await tx.googleSheetTab.create({
            data: {
              configId:       params.id,
              sheetName:      tab.sheetName,
              internalName:   tab.internalName ?? tab.sheetName,
              gid:            tab.gid            ?? null,
              monthReference: tab.monthReference ?? null,
              tabType:        (tab.tabType as any) ?? 'PERSONALIZADO',
              sortOrder:      tab.sortOrder      ?? 0,
              active:         tab.active         ?? true,
              headerRow:      tab.headerRow      ?? 1,
            },
          })
          tabId = created.id
        }

        savedTabIds.push(tabId)

        // 2d. Salva mapeamentos de colunas da aba
        if (Array.isArray(tab.columnMaps)) {
          await tx.googleSheetColumnMap.deleteMany({ where: { tabId } })
          const validMaps = tab.columnMaps.filter(m => m.columnLetter && m.fieldName)
          if (validMaps.length > 0) {
            await tx.googleSheetColumnMap.createMany({
              data: validMaps.map(m => ({
                tabId,
                columnLetter: m.columnLetter,
                columnHeader: m.columnHeader ?? null,
                fieldName:    m.fieldName,
                fieldLabel:   m.fieldLabel   ?? null,
                required:     m.required     ?? false,
                transform:    m.transform    ?? null,
                defaultValue: m.defaultValue ?? null,
                active:       m.active       ?? true,
              })),
            })
          }
        }
      }

      // 2e. Upsert auto-sync
      if (body.autoSync !== undefined) {
        if (body.autoSync === null) {
          // Desativa auto-sync
          await tx.googleSheetsAutoSyncConfig.updateMany({
            where: { importerId: params.id },
            data:  { enabled: false },
          })
        } else {
          const as = body.autoSync
          const existing = await tx.googleSheetsAutoSyncConfig.findUnique({
            where: { importerId: params.id },
          })

          if (existing) {
            await tx.googleSheetsAutoSyncConfig.update({
              where: { importerId: params.id },
              data: {
                enabled:             as.enabled,
                mode:                (as.mode as any)               ?? existing.mode,
                frequencyMinutes:    as.frequencyMinutes             ?? existing.frequencyMinutes,
                allowedDays:         (as.allowedDays ?? existing.allowedDays) as never,
                startTime:           as.startTime                    ?? existing.startTime,
                endTime:             as.endTime                      ?? existing.endTime,
                selectedTabs:        (as.selectedTabs ?? existing.selectedTabs ?? undefined) as never,
                actionAfterDownload: (as.actionAfterDownload as any) ?? existing.actionAfterDownload,
                notifyOnNewRecords:  as.notifyOnNewRecords           ?? existing.notifyOnNewRecords,
                notifyOnError:       as.notifyOnError                ?? existing.notifyOnError,
                errorNotifyTarget:   as.errorNotifyTarget            ?? existing.errorNotifyTarget,
                maxRowsPerRun:       as.maxRowsPerRun                ?? existing.maxRowsPerRun,
                timeoutSeconds:      as.timeoutSeconds               ?? existing.timeoutSeconds,
                status:              as.enabled ? 'AGUARDANDO' : 'PAUSADO',
              },
            })
          } else {
            await tx.googleSheetsAutoSyncConfig.create({
              data: ({
                importerId:          params.id,
                createdById:         session.id,
                enabled:             as.enabled,
                mode:                (as.mode as any)               ?? 'SIMULATION',
                frequencyMinutes:    as.frequencyMinutes             ?? 30,
                allowedDays:         as.allowedDays                  ?? [1, 2, 3, 4, 5],
                startTime:           as.startTime                    ?? '08:00',
                endTime:             as.endTime                      ?? '18:00',
                selectedTabs:        (as.selectedTabs ?? undefined) as never,
                actionAfterDownload: (as.actionAfterDownload as any) ?? 'IMPORTAR_PENDENCIAS',
                notifyOnNewRecords:  as.notifyOnNewRecords           ?? false,
                notifyOnError:       as.notifyOnError                ?? true,
                errorNotifyTarget:   as.errorNotifyTarget            ?? null,
                maxRowsPerRun:       as.maxRowsPerRun                ?? 500,
                timeoutSeconds:      as.timeoutSeconds               ?? 120,
                status:              as.enabled ? 'AGUARDANDO' : 'PAUSADO',
              }) as never,
            })
          }
        }
      }
    })

    // ── 3. Retorna o importer atualizado completo ──────────────────────────────
    const updated = await prisma.googleSheetConfig.findUnique({
      where: { id: params.id },
      include: {
        tabs: {
          include: { columnMaps: { orderBy: { columnLetter: 'asc' } } },
          orderBy: { sortOrder: 'asc' },
        },
        autoSync: true,
      },
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (err) {
    return handlePrismaError(err)
  }
}
