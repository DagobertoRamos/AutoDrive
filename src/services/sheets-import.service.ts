// =============================================================================
// Google Sheets Import Service (legado)
// Usado por /api/import/sheets/run
// Importa dados da planilha fonte para o banco próprio do sistema
// =============================================================================

import { prisma }                                        from '@/lib/prisma'
import { parseGoogleSheetsCredentials, getSheetsCredsFromDB, getMasterSheetIdFromDB } from '@/lib/google-auth'

interface SheetRow {
  status?: string
  customerName?: string
  plate?: string
  vehicle?: string
  negotiation?: string
  sellerName?: string
  managerName?: string
  description?: string
  priority?: string
  dueDate?: string
  type?: string
  referenceMonth?: string
  [key: string]: string | undefined
}

interface ImportResult {
  success: boolean
  totalRows: number
  newPendencies: number
  updatedPendencies: number
  skipped: number
  errors: string[]
}

class SheetsImportService {
  private async getSheetId(): Promise<string> {
    return (await getMasterSheetIdFromDB()) ?? process.env.GOOGLE_SHEETS_ID ?? ''
  }

  async fetchSheetData(sheetName = 'PENDENCIAS'): Promise<SheetRow[]> {
    // Prioridade: banco de dados > variável de ambiente
    const rawCreds =
      (await getSheetsCredsFromDB()) ??
      process.env.GOOGLE_SHEETS_CREDENTIALS
    const credentials = parseGoogleSheetsCredentials(rawCreds)

    const { google } = await import('googleapis')
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })

    const sheets = google.sheets({ version: 'v4', auth })
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: await this.getSheetId(),
      range: `${sheetName}!A1:ZZ`,
    })

    const rows = response.data.values ?? []
    if (rows.length < 2) return []

    const headers = rows[0].map((h: string) => String(h).trim().toLowerCase())
    return rows.slice(1).map(row => {
      const obj: SheetRow = {}
      headers.forEach((header: string, i: number) => {
        obj[header] = String(row[i] ?? '').trim() || undefined
      })
      return obj
    })
  }

  async run(): Promise<ImportResult> {
    const result: ImportResult = {
      success: false,
      totalRows: 0,
      newPendencies: 0,
      updatedPendencies: 0,
      skipped: 0,
      errors: [],
    }

    // Registra job de importação usando o modelo correto (ImportJob)
    const job = await prisma.importJob.create({
      data: { status: 'PROCESSANDO', startedAt: new Date() },
    })

    try {
      // Buscar status permitidos das configurações
      const statusFilter = await prisma.systemSetting.findUnique({ where: { key: 'import_allowed_statuses' } })
      const allowedStatuses = statusFilter?.value?.split(',').map(s => s.trim().toLowerCase()) ?? []

      const rows = await this.fetchSheetData()
      result.totalRows = rows.length

      // Buscar unidade padrão
      const defaultUnit = await prisma.unit.findFirst({ where: { active: true } })
      if (!defaultUnit) throw new Error('Nenhuma unidade ativa encontrada')

      for (const row of rows) {
        try {
          // Filtrar por status da planilha
          if (allowedStatuses.length > 0 && !allowedStatuses.includes(row.status?.toLowerCase() ?? '')) {
            result.skipped++
            continue
          }

          const customerName = row.customerName ?? row['cliente'] ?? ''
          if (!customerName) {
            result.skipped++
            continue
          }

          const plate       = row.plate       ?? row['placa']                      ?? null
          const vehicle     = row.vehicle     ?? row['veiculo'] ?? row['veículo']  ?? null
          const negotiation = row.negotiation ?? row['negociacao'] ?? row['negociação'] ?? null
          const sellerName  = row.sellerName  ?? row['vendedor']                   ?? null

          // Buscar vendedor pelo nome — obrigatório (responsibleId é NOT NULL)
          if (!sellerName) {
            result.errors.push(`Vendedor não informado (linha: ${customerName})`)
            result.skipped++
            continue
          }

          const seller = await prisma.seller.findFirst({
            where: { fullName: { contains: sellerName, mode: 'insensitive' } },
          })

          if (!seller) {
            result.errors.push(`Vendedor não encontrado: ${sellerName} (linha: ${customerName})`)
            result.skipped++
            continue
          }

          // Verificar se já existe (deduplicação por negociação + vendedor)
          const existing = plate || negotiation
            ? await prisma.pendency.findFirst({
                where: {
                  responsibleId: seller.id,
                  ...(negotiation ? { negotiation } : {}),
                  ...(plate && !negotiation ? { plate } : {}),
                  status: { notIn: ['FINALIZADA', 'CANCELADA'] },
                },
              })
            : null

          if (existing) {
            await prisma.pendency.update({
              where: { id: existing.id },
              data:  { vehicle: vehicle ?? existing.vehicle, source: 'SHEETS' },
            })
            result.updatedPendencies++
          } else {
            await prisma.pendency.create({
              data: {
                customerName,
                plate,
                vehicle,
                negotiation,
                responsibleId:  seller.id,
                unitId:         defaultUnit.id,
                priority:       'MEDIA',
                status:         'ABERTA',
                source:         'SHEETS',
                allowedDays:    [],
                referenceMonth: row.referenceMonth ?? row['mes_referencia'] ?? null,
                description:    row.description    ?? row['descricao']      ?? null,
                type:           row.type           ?? row['tipo']           ?? null,
              },
            })
            result.newPendencies++
          }
        } catch (rowErr) {
          result.errors.push(`Erro na linha: ${String(rowErr)}`)
        }
      }

      result.success = true

      await prisma.importJob.update({
        where: { id: job.id },
        data:  {
          status:        'CONCLUIDO',
          totalRows:     result.totalRows,
          newRecords:    result.newPendencies,
          updatedRecords: result.updatedPendencies,
          errorRows:     result.skipped,
          errors:        result.errors.length > 0 ? result.errors : undefined,
          finishedAt:    new Date(),
        },
      })
    } catch (err) {
      result.errors.push(String(err))
      await prisma.importJob.update({
        where: { id: job.id },
        data:  { status: 'ERRO', errors: result.errors, finishedAt: new Date() },
      })
    }

    return result
  }
}

export const sheetsImport = new SheetsImportService()
