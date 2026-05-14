// =============================================================================
// Tipos do sistema de consulta veicular por placa
// =============================================================================

export type VehicleCategory = 'CAR' | 'MOTORCYCLE' | 'TRUCK'

/** Dados normalizados retornados por qualquer provedor */
export interface VehicleLookupData {
  plate:               string
  vehicleType?:        VehicleCategory
  brand?:              string
  model?:              string
  version?:            string             // versão completa / trim
  fullModel?:          string             // marca + modelo + versão concatenados
  manufactureYear?:    number
  modelYear?:          number
  fuel?:               string
  color?:              string
  chassi?:             string             // somente se autorizado e disponível
  renavam?:            string             // somente se autorizado e disponível
  engine?:             string             // ex: "1.0 Turbo Flex"
  displacement?:       string             // ex: "999 cc"
  power?:              string             // ex: "116 cv"
  transmission?:       string
  doors?:              number
  bodyType?:           string             // ex: "Sedan", "SUV", "Hatch"
  fipeCode?:           string
  fipeValue?:          number
  fipeReferenceMonth?: string
  restrictions?:       string[]           // apenas se provedor autorizado
  raw?:                Record<string, unknown>  // payload bruto (nunca expor no frontend)
}

export interface VehicleLookupResult {
  success:  boolean
  found:    boolean
  source?:  string                        // nome do provedor que encontrou
  data?:    VehicleLookupData
  message?: string
  error?:   string
}

/** Interface que todo provedor deve implementar */
export interface VehicleLookupProvider {
  /** Nome do provedor (para audit e logs) */
  readonly name: string
  /**
   * Consulta veículo pela placa normalizada (sem hífen, maiúsculo).
   * Deve retornar VehicleLookupResult dentro de um timeout aceitável.
   * Jamais deve lançar exceção não tratada.
   */
  lookupByPlate(plate: string): Promise<VehicleLookupResult>
}

// ── FIPE types ──────────────────────────────────────────────────────────────

export interface FipeBrand {
  code:  string
  name:  string
  type:  VehicleCategory
}

export interface FipeModel {
  code:    string
  name:    string
  brandCode: string
  type:    VehicleCategory
}

export interface FipeVersion {
  code:        string  // ex: "2022-1"
  yearLabel:   string  // ex: "2022 Flex"
  modelYear:   number
  fuelCode:    string  // "1" = Gasolina, "2" = Álcool, "3" = Diesel
  fuelLabel:   string
}

export interface FipePrice {
  fipeCode:    string
  brand:       string
  model:       string
  modelYear:   number
  fuel:        string
  value:       number           // R$
  referenceMonth: string        // ex: "maio/2026"
}
