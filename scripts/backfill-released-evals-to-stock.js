// Backfill: pra cada avaliação LIBERADA sem vehicleId, cria Vehicle EM_PRECIFICACAO
// e vincula. Usa SQL raw pra evitar atritos com relations Prisma (unit/tenant).
const { Pool, neonConfig } = require('@neondatabase/serverless')
const ws = require('ws')
const { randomBytes } = require('node:crypto')
neonConfig.webSocketConstructor = ws

function cuid() {
  // cuid-lite (ordem temporal + random) — suficiente pra script
  const t = Date.now().toString(36)
  const r = randomBytes(8).toString('hex')
  return `c${t}${r}`
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

;(async () => {
  const client = await pool.connect()
  try {
    const { rows: liberadas } = await client.query(`
      SELECT id, "vehicleId", "tenantId", "unitId", plate, brand, model, version,
             "modelYear", "manufactureYear", color, km, fuel, transmission,
             chassi, renavam, "vehicleType", "conditionType",
             "evaluatedValue", "suggestedSalePrice", "fipeValue", "fipeCode",
             "releasedByUserId"
      FROM vehicle_evaluations
      WHERE status = 'LIBERADA' OR result = 'APROVADO'
    `)
    console.log(`Liberadas: ${liberadas.length}`)

    let created = 0, updated = 0, linked = 0
    for (const ev of liberadas) {
      const year      = ev.manufactureYear ?? ev.modelYear ?? null
      const salePrice = ev.suggestedSalePrice ?? ev.evaluatedValue ?? null

      if (ev.vehicleId) {
        // Atualiza
        await client.query(`
          UPDATE vehicles
          SET "stockStatus" = 'EM_PRECIFICACAO',
              active = true,
              "isAvailableForSale" = false,
              "salePrice" = COALESCE($1, "salePrice"),
              "purchasePrice" = COALESCE($2, "purchasePrice"),
              "updatedAt" = NOW()
          WHERE id = $3
        `, [salePrice, ev.evaluatedValue, ev.vehicleId])
        updated++
        continue
      }

      // Tenta achar por placa+tenant
      let existingId = null
      if (ev.plate) {
        const { rows: ex } = await client.query(`
          SELECT id FROM vehicles
          WHERE UPPER(plate) = UPPER($1)
            AND ($2::text IS NULL OR "tenantId" = $2)
          LIMIT 1
        `, [ev.plate, ev.tenantId])
        existingId = ex[0]?.id ?? null
      }

      if (existingId) {
        await client.query(`
          UPDATE vehicles
          SET "stockStatus" = 'EM_PRECIFICACAO',
              active = true,
              "isAvailableForSale" = false,
              "salePrice" = COALESCE($1, "salePrice"),
              "updatedAt" = NOW()
          WHERE id = $2
        `, [salePrice, existingId])
        updated++
      } else {
        const id = cuid()
        await client.query(`
          INSERT INTO vehicles (
            id, "tenantId", "unitId", plate, brand, model, version,
            "modelYear", year, color, km, fuel, transmission, chassi, renavam,
            "vehicleType", "conditionType", "fipeCode", "fipeValue",
            "purchasePrice", "salePrice",
            "stockStatus", active, "isAvailableForSale",
            "entryDate", "pricedById", "pricedAt",
            "createdAt", "updatedAt"
          ) VALUES (
            $1, $2, $3, UPPER($4), $5, $6, $7,
            $8, $9, $10, $11, $12, $13, $14, $15,
            $16::"VehicleType", $17::"VehicleCondition", $18, $19,
            $20, $21,
            'EM_PRECIFICACAO', true, false,
            NOW(), $22, NOW(),
            NOW(), NOW()
          )
        `, [
          id, ev.tenantId, ev.unitId, ev.plate, ev.brand, ev.model, ev.version,
          ev.modelYear, year, ev.color, ev.km, ev.fuel, ev.transmission, ev.chassi, ev.renavam,
          ev.vehicleType, ev.conditionType, ev.fipeCode, ev.fipeValue,
          ev.evaluatedValue, salePrice,
          ev.releasedByUserId,
        ])
        existingId = id
        created++
      }

      // Vincula vehicleId à avaliação
      await client.query(
        `UPDATE vehicle_evaluations SET "vehicleId" = $1 WHERE id = $2`,
        [existingId, ev.id],
      )
      linked++
    }
    console.log(`\n  ✓ ${created} criado(s)  ${updated} atualizado(s)  ${linked} vinculado(s)`)
  } catch (e) {
    console.error('Falha:', e.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
})()
