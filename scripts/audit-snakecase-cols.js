// =============================================================================
// scripts/audit-snakecase-cols.js
// Lista colunas snake_case em tabelas do schema. Cruza com nome esperado
// pelo Prisma (camelCase do campo, a menos que tenha @map). Reporta órfãos.
// READ-ONLY: não altera nada — só reporta.
// =============================================================================
const { Pool, neonConfig } = require('@neondatabase/serverless')
const ws = require('ws')
neonConfig.webSocketConstructor = ws
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

;(async () => {
  const tables = await pool.query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
  )

  const suspects = []
  for (const { tablename } of tables.rows) {
    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1
       ORDER BY column_name`,
      [tablename],
    )
    for (const { column_name } of cols.rows) {
      // Snake_case quando tem '_' no meio (não no começo). FKs PG-standard
      // tipo "user_id" são suspeitos a menos que casem com @map no schema.
      if (column_name.includes('_') && !column_name.startsWith('_')) {
        suspects.push({ table: tablename, column: column_name })
      }
    }
  }

  await pool.end()

  if (suspects.length === 0) {
    console.log('Nenhuma coluna snake_case encontrada.')
    return
  }

  // Agrupa por tabela
  const byTable = {}
  for (const s of suspects) {
    if (!byTable[s.table]) byTable[s.table] = []
    byTable[s.table].push(s.column)
  }

  console.log(`Colunas snake_case detectadas em ${Object.keys(byTable).length} tabela(s):\n`)
  for (const [t, cols] of Object.entries(byTable)) {
    console.log(`  ${t}`)
    for (const c of cols) console.log(`    · ${c}`)
  }
  console.log(`\nTotal: ${suspects.length} colunas.`)
  console.log(`\nNOTA: muitas podem estar OK se o schema.prisma tem @map("snake_case").`)
  console.log(`Cruze manualmente com o schema antes de renomear.`)
})()
