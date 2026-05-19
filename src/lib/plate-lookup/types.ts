// =============================================================================
// Plate Lookup — Tipos compartilhados
// =============================================================================

export interface PlateLookupData {
  plate:        string
  brand?:       string
  model?:       string
  version?:     string
  manufactureYear?: number
  modelYear?:   number
  color?:       string
  fuel?:        string
  chassi?:      string
  renavam?:     string
  bodyType?:    string
  doors?:       number
  fipeCode?:    string
  fipeValue?:   number
  // Provedor adicional
  category?:    string
  vehicleType?: string
  raw?:         unknown
}

export interface PlateLookupResult {
  ok:        boolean
  found:     boolean
  source:    string                    // 'mock' | 'authorized' | 'cache' | etc.
  data?:     PlateLookupData
  error?:    string
}

export interface PlateLookupProvider {
  name: string
  /** Executa o lookup. Nunca lança — devolve `{ ok: false, error }` em falha. */
  lookupByPlate(plate: string): Promise<PlateLookupResult>
  /** Identifica se está pronto para usar (env / IntegrationCredential ativo). */
  isConfigured(): Promise<boolean>
}
