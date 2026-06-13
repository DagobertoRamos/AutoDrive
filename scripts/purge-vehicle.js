// Hard-delete de um veículo + tudo que o referencia.
// Uso: node --env-file=.env scripts/purge-vehicle.js <plate-ou-id>
const { Pool, neonConfig } = require('@neondatabase/serverless')
const ws = require('ws')
neonConfig.webSocketConstructor = ws

const arg = process.argv[2]
if (!arg) {
  console.error('Uso: node --env-file=.env scripts/purge-vehicle.js <plate-ou-id>')
  process.exit(1)
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

;(async () => {
  const client = await pool.connect()
  try {
    // Localiza
    const find = await client.query(
      `SELECT id, plate, brand, model FROM vehicles
       WHERE id = $1 OR UPPER(plate) = UPPER($1)`,
      [arg],
    )
    if (find.rows.length === 0) {
      console.log(`Nenhum veículo encontrado para "${arg}".`)
      return
    }

    for (const v of find.rows) {
      console.log(`\nPurgando ${v.id} (${v.plate} · ${v.brand} ${v.model})...`)
      await client.query('BEGIN')
      try {
        // Tabelas que referenciam Vehicle — em ordem segura
        const ops = [
          // SET NULL (manter histórico): vehicle_evaluations.vehicleId
          [`UPDATE vehicle_evaluations SET "vehicleId" = NULL WHERE "vehicleId" = $1`, 'evals SET NULL'],
          // DELETE em filhos diretos:
          [`DELETE FROM vehicle_pricing_history WHERE "vehicleId" = $1`, 'pricing_history'],
          [`DELETE FROM vehicle_photos          WHERE "vehicleId" = $1`, 'photos'],
          [`DELETE FROM vehicle_stock_pendencies WHERE "vehicleId" = $1`, 'stock_pendencies'],
          // DealVehicle: deleta a linha (não cascade no DB sem ser pelo Deal)
          [`DELETE FROM deal_vehicles           WHERE "vehicleId" = $1`, 'deal_vehicles'],
          // Por fim, o vehicle
          [`DELETE FROM vehicles WHERE id = $1`, 'VEHICLE'],
        ]
        for (const [sql, label] of ops) {
          const r = await client.query(sql, [v.id])
          console.log(`  ${label.padEnd(20)} ${r.rowCount} linha(s)`)
        }
        await client.query('COMMIT')
        console.log(`  ✓ ${v.plate} purgado.`)
      } catch (e) {
        await client.query('ROLLBACK')
        console.error(`  ✗ rollback:`, e.message)
      }
    }
  } finally {
    client.release()
    await pool.end()
  }
})()
