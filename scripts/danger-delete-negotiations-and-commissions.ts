// =============================================================================
// DANGER: hard-delete negotiations and commissions.
//
// Dry-run is the default. Real deletion requires:
//   --execute
//   CONFIRM_DELETE_NEGOTIATIONS_AND_COMMISSIONS=DELETE_REAL_NEGOTIATIONS_COMMISSIONS
//
// Tenant scope is mandatory by default:
//   --tenantId=<tenant-id>
//
// All tenants require:
//   --all-tenants
//   CONFIRM_ALL_TENANTS=YES_DELETE_ALL_TENANTS
//
// Production also requires:
//   CONFIRM_PRODUCTION_DELETE=YES_I_UNDERSTAND_THIS_IS_PRODUCTION
// =============================================================================

import { Prisma, PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DELETE_CONFIRMATION = 'DELETE_REAL_NEGOTIATIONS_COMMISSIONS'
const ALL_TENANTS_CONFIRMATION = 'YES_DELETE_ALL_TENANTS'
const PRODUCTION_CONFIRMATION = 'YES_I_UNDERSTAND_THIS_IS_PRODUCTION'
const DERIVED_FINANCE_SOURCES = ['VENDA', 'COMISSAO', 'RETORNO', 'GARANTIA']

type Db = PrismaClient | Prisma.TransactionClient

interface Args {
  tenantId: string | null
  allTenants: boolean
  execute: boolean
  dryRunFlag: boolean
  help: boolean
  includeFiWarrantyRules: boolean
}

interface Scope {
  tenantId: string | null
  allTenants: boolean
  // Por padrão NÃO apaga WarrantyRule/ReturnPercentRule: são catálogo de garantia
  // e config de F&I/retorno, não `CommissionRule`. Só apaga com a flag explícita.
  includeFiWarrantyRules: boolean
}

interface CountRow {
  label: string
  count: number
  action: 'delete' | 'unlink' | 'preserve'
}

interface MutationResult {
  label: string
  count: number
  action: 'deleted' | 'unlinked'
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    tenantId: null,
    allTenants: false,
    execute: false,
    dryRunFlag: false,
    help: false,
    includeFiWarrantyRules: false,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') out.help = true
    else if (arg === '--execute') out.execute = true
    else if (arg === '--dry-run') out.dryRunFlag = true
    else if (arg === '--all-tenants') out.allTenants = true
    else if (arg === '--include-fi-warranty-rules') out.includeFiWarrantyRules = true
    else if (arg.startsWith('--tenantId=')) out.tenantId = arg.slice('--tenantId='.length).trim()
    else if (arg === '--tenantId') {
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        out.tenantId = next.trim()
        i++
      }
    }
  }

  return out
}

function printUsage() {
  console.log(`
Uso:
  npm run danger:delete-negotiations-commissions -- --dry-run --tenantId=<tenant-id>

Delete real por tenant:
  CONFIRM_DELETE_NEGOTIATIONS_AND_COMMISSIONS="${DELETE_CONFIRMATION}" npm run danger:delete-negotiations-commissions -- --execute --tenantId=<tenant-id>

Delete real em todos os tenants:
  CONFIRM_DELETE_NEGOTIATIONS_AND_COMMISSIONS="${DELETE_CONFIRMATION}" CONFIRM_ALL_TENANTS="${ALL_TENANTS_CONFIRMATION}" npm run danger:delete-negotiations-commissions -- --execute --all-tenants

Producao exige tambem:
  CONFIRM_PRODUCTION_DELETE="${PRODUCTION_CONFIRMATION}"

Opcional (padrao NAO apaga): tambem apagar regras de garantia (WarrantyRule) e
de retorno F&I (ReturnPercentRule) — nao sao CommissionRule, sao catalogo/F&I:
  ... --include-fi-warranty-rules
`)
}

function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production'
}

function validateArgs(args: Args): { dryRun: boolean; scope: Scope } {
  if (args.help) {
    printUsage()
    process.exit(0)
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL nao encontrada. Configure o banco antes de rodar.')
  }

  if (args.tenantId && args.allTenants) {
    throw new Error('Use --tenantId OU --all-tenants, nunca os dois juntos.')
  }

  if (!args.tenantId && !args.allTenants) {
    throw new Error('Escopo obrigatorio: informe --tenantId=<tenant-id> ou --all-tenants.')
  }

  if (args.execute && args.dryRunFlag) {
    throw new Error('Use --execute ou --dry-run, nunca os dois juntos.')
  }

  if (args.allTenants && process.env.CONFIRM_ALL_TENANTS !== ALL_TENANTS_CONFIRMATION) {
    throw new Error(`--all-tenants bloqueado. Defina CONFIRM_ALL_TENANTS="${ALL_TENANTS_CONFIRMATION}".`)
  }

  if (isProductionEnvironment() && args.execute && process.env.CONFIRM_PRODUCTION_DELETE !== PRODUCTION_CONFIRMATION) {
    throw new Error(`Ambiente de producao detectado. Operacao bloqueada sem CONFIRM_PRODUCTION_DELETE="${PRODUCTION_CONFIRMATION}".`)
  }

  const dryRun = !args.execute || process.env.CONFIRM_DELETE_NEGOTIATIONS_AND_COMMISSIONS !== DELETE_CONFIRMATION
  return {
    dryRun,
    scope: {
      tenantId: args.tenantId,
      allTenants: args.allTenants,
      includeFiWarrantyRules: args.includeFiWarrantyRules,
    },
  }
}

function tenantWhere(scope: Scope): Record<string, string> {
  return scope.allTenants ? {} : { tenantId: scope.tenantId as string }
}

function dealWhere(scope: Scope): Prisma.DealWhereInput {
  return scope.allTenants ? {} : { tenantId: scope.tenantId }
}

function derivedFinancialWhere(scope: Scope): Prisma.FinancialEntryWhereInput {
  return {
    ...tenantWhere(scope),
    OR: [
      { dealId: { not: null } },
      { commissionCalculationId: { not: null } },
      { source: { in: DERIVED_FINANCE_SOURCES } },
    ],
  }
}

function commissionCalculationWhere(scope: Scope): Prisma.CommissionCalculationWhereInput {
  return scope.allTenants ? {} : { tenantId: scope.tenantId }
}

function commissionAdjustmentWhere(scope: Scope): Prisma.CommissionAdjustmentWhereInput {
  return scope.allTenants ? {} : { calculation: { tenantId: scope.tenantId } }
}

function contractLinkedToDealWhere(scope: Scope): Prisma.ContractWhereInput {
  return {
    ...tenantWhere(scope),
    dealId: { not: null },
  }
}

function contractParseResultWhere(scope: Scope): Prisma.ContractParseResultWhereInput {
  return { contract: { is: contractLinkedToDealWhere(scope) } }
}

async function countRows(db: Db, scope: Scope): Promise<CountRow[]> {
  const dw = dealWhere(scope)
  const rows: CountRow[] = [
    { label: 'FinancialEntry derivado de venda/comissao', action: 'delete', count: await db.financialEntry.count({ where: derivedFinancialWhere(scope) }) },
    { label: 'CommissionAdjustment', action: 'delete', count: await db.commissionAdjustment.count({ where: commissionAdjustmentWhere(scope) }) },
    { label: 'CommissionExtract', action: 'delete', count: await db.commissionExtract.count({ where: tenantWhere(scope) }) },
    { label: 'CommissionCalculation', action: 'delete', count: await db.commissionCalculation.count({ where: commissionCalculationWhere(scope) }) },
    { label: 'CommissionRule', action: 'delete', count: await db.commissionRule.count({ where: tenantWhere(scope) }) },
    { label: 'WarrantyRule (F&I/garantia)', action: scope.includeFiWarrantyRules ? 'delete' : 'preserve', count: await db.warrantyRule.count({ where: tenantWhere(scope) }) },
    { label: 'ReturnPercentRule (F&I/retorno)', action: scope.includeFiWarrantyRules ? 'delete' : 'preserve', count: await db.returnPercentRule.count({ where: tenantWhere(scope) }) },
    { label: 'RankingScore', action: 'delete', count: await db.rankingScore.count({ where: tenantWhere(scope) }) },
    { label: 'GoalProgress', action: 'delete', count: await db.goalProgress.count({ where: tenantWhere(scope) }) },
    { label: 'Pendency.dealId', action: 'unlink', count: await db.pendency.count({ where: { ...tenantWhere(scope), dealId: { not: null } } }) },
    { label: 'Pendency.contractId de contratos da negociacao', action: 'unlink', count: await db.pendency.count({ where: { ...tenantWhere(scope), contract: { is: contractLinkedToDealWhere(scope) } } }) },
    { label: 'Appointment.dealId', action: 'unlink', count: await db.appointment.count({ where: { ...tenantWhere(scope), dealId: { not: null } } }) },
    { label: 'FinanceProposal.dealId', action: 'unlink', count: await db.financeProposal.count({ where: { ...tenantWhere(scope), dealId: { not: null } } }) },
    { label: 'MarketingLead.convertedDealId', action: 'unlink', count: await db.marketingLead.count({ where: { ...tenantWhere(scope), convertedDealId: { not: null } } }) },
    { label: 'SheetImportRow vinculada a Deal', action: 'delete', count: await db.sheetImportRow.count({ where: { deal: { is: dw } } }) },
    { label: 'ContractParseResult de contrato da negociacao', action: 'delete', count: await db.contractParseResult.count({ where: contractParseResultWhere(scope) }) },
    { label: 'Contract vinculado a Deal', action: 'delete', count: await db.contract.count({ where: contractLinkedToDealWhere(scope) }) },
    { label: 'DealVehicle', action: 'delete', count: await db.dealVehicle.count({ where: { deal: dw } }) },
    { label: 'DealService', action: 'delete', count: await db.dealService.count({ where: { deal: dw } }) },
    { label: 'DealAuditLog', action: 'delete', count: await db.dealAuditLog.count({ where: { deal: dw } }) },
    { label: 'DealDebt', action: 'delete', count: await db.dealDebt.count({ where: { deal: dw } }) },
    { label: 'DealPayment', action: 'delete', count: await db.dealPayment.count({ where: { deal: dw } }) },
    { label: 'DealDiscountRequest', action: 'delete', count: await db.dealDiscountRequest.count({ where: { deal: dw } }) },
    { label: 'DealChange', action: 'delete', count: await db.dealChange.count({ where: { deal: dw } }) },
    { label: 'DealReopenLog', action: 'delete', count: await db.dealReopenLog.count({ where: { deal: dw } }) },
    { label: 'DealAttachment', action: 'delete', count: await db.dealAttachment.count({ where: { deal: dw } }) },
    { label: 'DealDocument', action: 'delete', count: await db.dealDocument.count({ where: { deal: dw } }) },
    { label: 'DealStatusHistory', action: 'delete', count: await db.dealStatusHistory.count({ where: { deal: dw } }) },
    { label: 'DealReleaseRequest', action: 'delete', count: await db.dealReleaseRequest.count({ where: { deal: dw } }) },
    { label: 'WarrantySale', action: 'delete', count: await db.warrantySale.count({ where: { deal: dw } }) },
    { label: 'Deal', action: 'delete', count: await db.deal.count({ where: dw }) },
    { label: 'Tenant', action: 'preserve', count: await db.tenant.count({ where: scope.allTenants ? {} : { id: scope.tenantId as string } }) },
    { label: 'User', action: 'preserve', count: await db.user.count({ where: tenantWhere(scope) }) },
    { label: 'Unit', action: 'preserve', count: await db.unit.count({ where: tenantWhere(scope) }) },
    { label: 'Seller', action: 'preserve', count: await db.seller.count({ where: scope.allTenants ? {} : { unit: { tenantId: scope.tenantId } } }) },
    { label: 'Manager', action: 'preserve', count: await db.manager.count({ where: scope.allTenants ? {} : { unit: { tenantId: scope.tenantId } } }) },
  ]
  return rows
}

async function runMutations(db: Db, scope: Scope): Promise<MutationResult[]> {
  const dw = dealWhere(scope)
  const results: MutationResult[] = []

  async function del(label: string, fn: () => Promise<{ count: number }>) {
    const result = await fn()
    results.push({ label, count: result.count, action: 'deleted' })
  }

  async function unlink(label: string, fn: () => Promise<{ count: number }>) {
    const result = await fn()
    results.push({ label, count: result.count, action: 'unlinked' })
  }

  await del('FinancialEntry derivado de venda/comissao', () => db.financialEntry.deleteMany({ where: derivedFinancialWhere(scope) }))
  await del('CommissionAdjustment', () => db.commissionAdjustment.deleteMany({ where: commissionAdjustmentWhere(scope) }))
  await del('CommissionExtract', () => db.commissionExtract.deleteMany({ where: tenantWhere(scope) }))
  await del('CommissionCalculation', () => db.commissionCalculation.deleteMany({ where: commissionCalculationWhere(scope) }))
  await del('CommissionRule', () => db.commissionRule.deleteMany({ where: tenantWhere(scope) }))
  if (scope.includeFiWarrantyRules) {
    await del('WarrantyRule (F&I/garantia)', () => db.warrantyRule.deleteMany({ where: tenantWhere(scope) }))
    await del('ReturnPercentRule (F&I/retorno)', () => db.returnPercentRule.deleteMany({ where: tenantWhere(scope) }))
  }
  await del('RankingScore', () => db.rankingScore.deleteMany({ where: tenantWhere(scope) }))
  await del('GoalProgress', () => db.goalProgress.deleteMany({ where: tenantWhere(scope) }))

  await unlink('Pendency.dealId', () => db.pendency.updateMany({ where: { ...tenantWhere(scope), dealId: { not: null } }, data: { dealId: null } }))
  await unlink('Pendency.contractId de contratos da negociacao', () => db.pendency.updateMany({ where: { ...tenantWhere(scope), contract: { is: contractLinkedToDealWhere(scope) } }, data: { contractId: null } }))
  await unlink('Appointment.dealId', () => db.appointment.updateMany({ where: { ...tenantWhere(scope), dealId: { not: null } }, data: { dealId: null } }))
  await unlink('FinanceProposal.dealId', () => db.financeProposal.updateMany({ where: { ...tenantWhere(scope), dealId: { not: null } }, data: { dealId: null } }))
  await unlink('MarketingLead.convertedDealId', () => db.marketingLead.updateMany({ where: { ...tenantWhere(scope), convertedDealId: { not: null } }, data: { convertedDealId: null, convertedAt: null } }))

  await del('SheetImportRow vinculada a Deal', () => db.sheetImportRow.deleteMany({ where: { deal: { is: dw } } }))
  await del('ContractParseResult de contrato da negociacao', () => db.contractParseResult.deleteMany({ where: contractParseResultWhere(scope) }))
  await del('Contract vinculado a Deal', () => db.contract.deleteMany({ where: contractLinkedToDealWhere(scope) }))

  await del('DealVehicle', () => db.dealVehicle.deleteMany({ where: { deal: dw } }))
  await del('DealService', () => db.dealService.deleteMany({ where: { deal: dw } }))
  await del('DealAuditLog', () => db.dealAuditLog.deleteMany({ where: { deal: dw } }))
  await del('DealDebt', () => db.dealDebt.deleteMany({ where: { deal: dw } }))
  await del('DealPayment', () => db.dealPayment.deleteMany({ where: { deal: dw } }))
  await del('DealDiscountRequest', () => db.dealDiscountRequest.deleteMany({ where: { deal: dw } }))
  await del('DealChange', () => db.dealChange.deleteMany({ where: { deal: dw } }))
  await del('DealReopenLog', () => db.dealReopenLog.deleteMany({ where: { deal: dw } }))
  await del('DealAttachment', () => db.dealAttachment.deleteMany({ where: { deal: dw } }))
  await del('DealDocument', () => db.dealDocument.deleteMany({ where: { deal: dw } }))
  await del('DealStatusHistory', () => db.dealStatusHistory.deleteMany({ where: { deal: dw } }))
  await del('DealReleaseRequest', () => db.dealReleaseRequest.deleteMany({ where: { deal: dw } }))
  await del('WarrantySale', () => db.warrantySale.deleteMany({ where: { deal: dw } }))
  await del('Deal', () => db.deal.deleteMany({ where: dw }))

  return results
}

function printBackupWarning() {
  console.log('\n====================================================================')
  console.log('BACKUP OBRIGATORIO')
  console.log('Faca backup do banco antes de executar. Esta operacao apaga negociacoes, comissoes e regras de comissao definitivamente.')
  console.log('Para PostgreSQL/Neon, use um backup/dump externo antes do --execute.')
  console.log('====================================================================\n')
}

function printCounts(title: string, rows: CountRow[]) {
  const deleteRows = rows.filter((r) => r.action !== 'preserve')
  const preserveRows = rows.filter((r) => r.action === 'preserve')
  const total = deleteRows.reduce((sum, row) => sum + row.count, 0)

  console.log(title)
  for (const row of deleteRows) {
    const verb = row.action === 'unlink' ? 'desvincular' : 'apagar'
    console.log(`- ${row.label}: ${row.count} (${verb})`)
  }
  console.log(`Total estimado afetado: ${total}`)
  console.log('\nPreservados:')
  for (const row of preserveRows) {
    console.log(`- ${row.label}: ${row.count}`)
  }
}

function printMutationResults(rows: MutationResult[]) {
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  console.log('\nResultado da execucao real:')
  for (const row of rows) {
    const verb = row.action === 'unlinked' ? 'desvinculado(s)' : 'apagado(s)'
    console.log(`- ${row.label}: ${row.count} ${verb}`)
  }
  console.log(`Total afetado: ${total}`)
}

async function assertTenantExists(scope: Scope) {
  if (scope.allTenants || !scope.tenantId) return
  const tenant = await prisma.tenant.findUnique({ where: { id: scope.tenantId }, select: { id: true, name: true } })
  if (!tenant) throw new Error(`Tenant nao encontrado: ${scope.tenantId}`)
  console.log(`Tenant: ${tenant.id} (${tenant.name})`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const { dryRun, scope } = validateArgs(args)

  printBackupWarning()
  await assertTenantExists(scope)
  if (scope.allTenants) console.log('Escopo: TODOS OS TENANTS')
  if (dryRun) {
    console.log('Modo: DRY-RUN — nada sera apagado.')
  } else {
    console.log('Modo: DELETE REAL — operacao destrutiva confirmada.')
  }

  const before = await countRows(prisma, scope)
  printCounts('\nContagem inicial:', before)

  if (dryRun) {
    console.log('\nDRY-RUN concluido. Nada foi apagado.')
    printUsage()
    return
  }

  const results = await prisma.$transaction(
    async (tx) => runMutations(tx, scope),
    { maxWait: 10_000, timeout: 120_000 },
  )

  printMutationResults(results)

  const after = await countRows(prisma, scope)
  printCounts('\nValidacao pos-delete:', after)
}

main()
  .catch((error) => {
    console.error('\nFalha:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
