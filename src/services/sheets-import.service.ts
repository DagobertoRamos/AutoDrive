// =============================================================================
// Google Sheets Import Service
// Importa dados da planilha fonte para o banco próprio do sistema
// =============================================================================

import { prisma }                         from '@/lib/prisma'
import { parseGoogleSheetsCredentials }  from '@/lib/google-auth'

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
  private get sheetId() {
    return process.env.GOOGLE_SHEETS_ID ?? ''
  }

  async fetchSheetData(sheetName = 'PENDENCIAS'): Promise<SheetRow[]> {
    const credentials = parseGoogleSheetsCredentials(process.env.GOOGLE_SHEETS_CREDENTIALS)

    const { google } = await import('googleapis')
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })

    const sheets = google.sheets({ version: 'v4', auth })
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: this.sheetId,
      range: `${sheetName}!A1:Z`,
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

    const importLog = await prisma.importLog.create({
      data: { sheetId: this.sheetId, status: 'RUNNING', totalRows: 0, newPendencies: 0, updatedPendencies: 0 },
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

          if (!row.customerName && !row['cliente']) {
            result.skipped++
            continue
          }

          const customerName = row.customerName ?? row['cliente'] ?? ''
          const plate = row.plate ?? row['placa'] ?? null
          const vehicle = row.vehicle ?? row['veiculo'] ?? row['veículo'] ?? null
          const negotiation = row.negotiation ?? row['negociacao'] ?? row['negociação'] ?? null

          // Buscar vendedor pelo nome
          let responsibleId: string | null = null
          const sellerName = row.sellerName ?? row['vendedor'] ?? null
          if (sellerName) {
            const seller = await prisma.seller.findFirst({
              where: { fullName: { contains: sellerName, mode: 'insensitive' } },
            })
            responsibleId = seller?.id ?? null
          }

          if (!responsibleId) {
            result.errors.push(`Vendedor não encontrado: ${sellerName} (linha: ${customerName})`)
            result.skipped++
            continue
          }

          // Verificar se já existe (deduplicação por placa + negociação)
          const existing = await prisma.pendency.findFirst({
            where: {
              plate: plate ?? undefined,
              negotiation: negotiation ?? undefined,
              responsibleId,
              status: { in: ['ABERTA', 'EM_ANDAMENTO', 'VENCIDA'] },
            },
          })

          if (existing) {
            await prisma.pendency.update({
              where: { id: existing.id },
              data: { vehicle: vehicle ?? existing.vehicle, source: 'SHEETS' },
            })
            result.updatedPendencies++
          } else {
            const pendency = await prisma.pendency.create({
              data: {
                customerName,
                plate,
                vehicle,
                negotiation,
                responsibleId,
                unitId: defaultUnit.id,
                priority: 'MEDIA',
                status: 'ABERTA',
                source: 'SHEETS',
                referenceMonth: row.referenceMonth ?? row['mes_referencia'] ?? null,
                description: row.description ?? row['descricao'] ?? null,
                type: row.type ?? row['tipo'] ?? null,
                initialDate: new Date(),
              },
            })

            // Notificar sobre nova pendência importada
            const delay = parseInt(
              (await prisma.systemSetting.findUnique({ where: { key: 'import_delay_seconds' } }))?.value ?? '5'
            )
            setTimeout(async () => {
              await prisma.notification.create({
                data: {
                  userId: (await prisma.user.findFirst({ where: { role: { in: ['MASTER', 'ADM'] } } }))?.id ?? '',
                  type: 'NOVA_PENDENCIA',
                  title: 'Nova pendência importada',
                  message: `Cliente: ${customerName} | Placa: ${plate ?? '—'} | Vendedor: ${sellerName}`,
                  actionUrl: '/pendencias/gerencia',
                },
              }).catch(() => { /* silent */ })
            }, delay * 1000)

            result.newPendencies++
          }
        } catch (rowErr) {
          result.errors.push(`Erro na linha: ${String(rowErr)}`)
        }
      }

      result.success = true

      await prisma.importLog.update({
        where: { id: importLog.id },
        data: {
          status: 'SUCCESS',
          totalRows: result.totalRows,
          newPendencies: result.newPendencies,
          updatedPendencies: result.updatedPendencies,
          errors: result.errors,
        },
      })
    } catch (err) {
      result.errors.push(String(err))
      await prisma.importLog.update({
        where: { id: importLog.id },
        data: { status: 'ERROR', errors: result.errors },
      })
    }

    return result
  }
}

export const sheetsImport = new SheetsImportService()
