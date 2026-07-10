// =============================================================================
// src/lib/crlv/types.ts
//
// Definições canônicas de tipos e interfaces para o leitor de CRLV do AutoDrive.
// Garantem que frontend e backend utilizem a mesma estrutura de dados tipada.
// =============================================================================

export type ExtractionSource =
  | 'NATIVE_PDF_TEXT'
  | 'LOCAL_OCR'
  | 'LOCAL_QR'
  | 'VIO_VERIFIED'
  | 'EXTERNAL_AI'
  | 'CATALOG_DERIVED'
  | 'USER_CONFIRMED'
  | 'MANUAL'

export type ValidationStatus =
  | 'VALID'
  | 'INVALID'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'NEEDS_REVIEW'
  | 'CONFIRMED'

export type VehicleCategory = 'CAR' | 'MOTORCYCLE' | 'TRUCK' | 'OTHER' | 'UNKNOWN'

export interface VehicleExtractedField<T = string | number | null> {
  field: string
  rawValue: string | null
  normalizedValue: T
  displayValue: string
  source: ExtractionSource
  provider: string
  confidence: number // 0.0 a 1.0
  requiresReview: boolean
  validationStatus: ValidationStatus
  evidenceText?: string
  page?: number
  boundingBox?: number[] // [x1, y1, x2, y2]
  alternatives?: string[]
}

export interface ExtractedVehicle {
  plate?: string | null
  vehicleGroup?: VehicleCategory | null // CAR | MOTORCYCLE | TRUCK | etc
  officialSpeciesType?: string | null
  brandModelVersionRaw?: string | null
  brand?: string | null
  model?: string | null
  version?: string | null
  color?: string | null
  manufactureYear?: number | null
  modelYear?: number | null
  renavam?: string | null
  chassis?: string | null
  bodyType?: string | null
  powerCv?: number | null
  displacementCc?: number | null
  engineCommercialLabel?: string | null
  fuelType?: string | null
  transmissionType?: string | null
  condition?: string | null
  options?: string[]
  ownerName?: string | null
  ownerDocument?: string | null

  // Propriedades legadas para compatibilidade retroativa
  predominantColor?: string | null
  fuel?: string | null
  power?: string | null
  displacement?: string | null
  vehicleType?: 'CARRO' | 'MOTO' | 'CAMINHAO' | null
}

export interface VehicleDocumentExtractionResult {
  id?: string
  tenantId?: string | null
  documentId?: string | null
  documentType: string // "CRLV" | "ATPV-e" | etc
  documentHash: string // SHA-256
  extractionRunId: string // UUID da execução
  status: 'PENDING' | 'SUCCESS' | 'PARTIAL' | 'FAILED'
  providersAttempted: string[]
  fields: Record<string, VehicleExtractedField<any>>
  warnings: string[]
  errors: string[]
  processingTimeMs: number
  createdAt: string
}

export type ExtractionConfidence = 'low' | 'medium' | 'high'

export interface ExtractionResult {
  success: boolean
  extracted: boolean
  confidence: ExtractionConfidence
  source: ExtractionSource
  vehicle: ExtractedVehicle
  missingFields: string[]
  warnings: string[]
  message: string
}

