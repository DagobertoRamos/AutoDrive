// Renomeia colunas snake_case → camelCase em deal_payments (Prisma default).
const { Pool, neonConfig } = require('@neondatabase/serverless')
const ws = require('ws')
neonConfig.webSocketConstructor = ws
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const RENAMES = [
  ['installment_value',         'installmentValue'],
  ['installment_interval_days', 'installmentIntervalDays'],
  ['paid_at',                   'paidAt'],
  ['pix_key',                   'pixKey'],
  ['return_pct',                'returnPct'],
  ['vehicle_plate',             'vehiclePlate'],
]

;(async () => {
  for (const [from, to] of RENAMES) {
    try {
      await pool.query(`ALTER TABLE deal_payments RENAME COLUMN ${from} TO "${to}"`)
      console.log(`  ✓ ${from} → ${to}`)
    } catch (e) {
      console.log(`  · ${from}: ${e.message}`)
    }
  }
  const cols = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name='deal_payments' ORDER BY column_name",
  )
  console.log('\nColunas finais:', cols.rows.map((r) => r.column_name).join(', '))
  await pool.end()
})()
