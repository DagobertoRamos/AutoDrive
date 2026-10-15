import { describe, expect, it } from 'vitest'
import { driveMonthFolder, drivePath, drivePersonLabel, driveQ, driveSafeName, driveVehicleLabel } from './drive-core'

describe('drive-core', () => {
  it('nomes seguros: sem barras/controle, espaços únicos, fallback', () => {
    expect(driveSafeName('  Auto/Drive\\ Loja\n 1 ')).toBe('Auto-Drive- Loja 1')
    expect(driveSafeName('', 'Loja')).toBe('Loja')
    expect(driveSafeName('x'.repeat(150))).toHaveLength(100)
  })

  it('mês no fuso de São Paulo', () => {
    expect(driveMonthFolder(new Date('2026-10-14T12:00:00Z'))).toBe('10-2026')
    // 00:30 UTC de 01/11 ainda é 31/10 em São Paulo
    expect(driveMonthFolder(new Date('2026-11-01T00:30:00Z'))).toBe('10-2026')
  })

  it('veículo e pessoa', () => {
    expect(driveVehicleLabel({ brand: 'Fiat', model: 'Argo', plate: 'abc-1d23' })).toBe('Fiat Argo - ABC1D23')
    expect(driveVehicleLabel({})).toBe('Veículo - SEM PLACA')
    expect(drivePersonLabel('João da Silva', { brand: 'VW', model: 'Gol', plate: 'XYZ9A87' })).toBe('João da Silva - VW Gol - XYZ9A87')
  })

  it('caminho por área', () => {
    const base = { store: 'AutoDrive Veiculos', date: new Date('2026-10-14T12:00:00Z'), vehicle: { brand: 'Fiat', model: 'Argo', plate: 'ABC1D23' } }
    expect(drivePath({ ...base, area: 'EVALUATION' })).toEqual(['AutoDrive Veiculos', 'Avaliações', '10-2026', 'Fiat Argo - ABC1D23'])
    expect(drivePath({ ...base, area: 'VEHICLE_DOCS' })).toEqual(['AutoDrive Veiculos', 'Documentos dos veículos', '10-2026', 'Fiat Argo - ABC1D23'])
    expect(drivePath({ ...base, area: 'PERSONAL_DOCS', personName: 'Maria' })).toEqual(['AutoDrive Veiculos', 'Documentos pessoais', '10-2026', 'Maria - Fiat Argo - ABC1D23'])
    expect(drivePath({ ...base, area: 'NEGOTIATIONS', personName: 'José' })).toEqual(['AutoDrive Veiculos', 'Negociações', '10-2026', 'José - Fiat Argo - ABC1D23'])
    expect(drivePath({ ...base, area: 'FINANCE' })).toEqual(['AutoDrive Veiculos', 'Financeiro', '10-2026'])
    expect(drivePath({ ...base, area: 'STOCK_PHOTOS' })).toEqual(['AutoDrive Veiculos', 'Fotos do estoque', '10-2026', 'Fiat Argo - ABC1D23'])
    expect(drivePath({ ...base, area: 'SITE', leaf: 'Banners' })).toEqual(['AutoDrive Veiculos', 'Site', 'Banners'])
    expect(drivePath({ ...base, area: 'NEGOTIATIONS', leaf: 'Comprovantes aguardando vínculo' })).toEqual(['AutoDrive Veiculos', 'Negociações', '10-2026', 'Comprovantes aguardando vínculo'])
  })

  it('escapa a busca do Drive', () => {
    expect(driveQ("D'Ávila \\ x")).toBe("D\\'Ávila \\\\ x")
  })
})
