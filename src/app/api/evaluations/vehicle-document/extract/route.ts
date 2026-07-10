// =============================================================================
// src/app/api/evaluations/vehicle-document/extract/route.ts
//
// POST /api/evaluations/vehicle-document/extract
//
// Implementa:
// 1. Upload de documento (primeira passada): calcula hash SHA-256. Se já existir
//    uma extração com esse hash e for de alta confiança, reutiliza imediatamente.
// 2. Se for PDF nativo, extrai o texto com ordenamento visual (Y ±5px, X crescente),
//    valida formatos (placa, chassi, renavam), gera campos com confidence, e
//    persiste em `VehicleDocumentExtraction`.
// 3. Se for imagem ou scanned PDF de baixa confiança, retorna indicando
//    necessidade de OCR local (`requiresOcr: true`).
// 4. Segunda passada (JSON POST com `isClientResult: true`): recebe observações
//    brutas de OCR/QR calculadas no frontend, cruza dados com o PDF nativo (consenso),
//    aplica regras de validação no backend, calcula confiança final, atualiza
//    a transação, gera auditoria, e devolve o resultado final canônico.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getServerAuthSession } from '@/lib/auth'
import { requireModule } from '@/lib/permissions'
import { assertModuleEnabled } from '@/lib/tenant-modules'
import { getConsolidatedSettings } from '@/lib/crlv/settings'
import {
  validatePlate,
  validateChassis,
  validateRenavam,
  parseCrlvText,
  buildExtractedField,
  extractNativePdfText,
} from '@/lib/crlv/parser'
import {
  classifyVehicleCategory,
  getEngineCommercialLabel,
  resolveTransmissionType,
} from '@/lib/crlv/deterministic'
import { VehicleExtractedField, ExtractedVehicle } from '@/lib/crlv/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Mapeia os campos da extração para um objeto simplificado ExtractedVehicle
 */
function toVehicleObject(fields: Record<string, VehicleExtractedField<any>>): ExtractedVehicle {
  const v: ExtractedVehicle = {}
  if (fields.plate?.validationStatus === 'VALID') v.plate = fields.plate.normalizedValue
  if (fields.renavam?.validationStatus === 'VALID') v.renavam = fields.renavam.normalizedValue
  if (fields.chassis?.validationStatus === 'VALID') v.chassis = fields.chassis.normalizedValue
  v.brand = fields.brand?.normalizedValue ?? null
  v.model = fields.model?.normalizedValue ?? null
  v.version = fields.version?.normalizedValue ?? null
  v.color = fields.color?.normalizedValue ?? null
  v.fuelType = fields.fuelType?.normalizedValue ?? null
  v.manufactureYear = fields.manufactureYear?.normalizedValue ?? null
  v.modelYear = fields.modelYear?.normalizedValue ?? null
  v.powerCv = fields.powerCv?.normalizedValue ?? null
  v.displacementCc = fields.displacementCc?.normalizedValue ?? null
  v.officialSpeciesType = fields.officialSpeciesType?.normalizedValue ?? null
  v.bodyType = fields.bodyType?.normalizedValue ?? null
  v.ownerName = fields.ownerName?.normalizedValue ?? null
  v.ownerDocument = fields.ownerDocument?.normalizedValue ?? null
  
  // Determinísticos
  v.vehicleGroup = fields.vehicleGroup?.normalizedValue ?? null
  v.engineCommercialLabel = fields.engineCommercialLabel?.normalizedValue ?? null
  v.transmissionType = fields.transmissionType?.normalizedValue ?? null

  // Propriedades legadas para compatibilidade retroativa
  v.predominantColor = fields.color?.normalizedValue ?? null
  v.fuel = fields.fuelType?.normalizedValue ?? null
  v.power = fields.powerCv?.normalizedValue ? String(fields.powerCv.normalizedValue) : null
  v.displacement = fields.displacementCc?.normalizedValue ? String(fields.displacementCc.normalizedValue) : null

  const group = fields.vehicleGroup?.normalizedValue
  let vehicleTypePt: 'CARRO' | 'MOTO' | 'CAMINHAO' | null = null
  if (group === 'CAR') vehicleTypePt = 'CARRO'
  else if (group === 'MOTORCYCLE') vehicleTypePt = 'MOTO'
  else if (group === 'TRUCK') vehicleTypePt = 'CAMINHAO'
  v.vehicleType = vehicleTypePt

  return v
}

/**
 * Retorna os campos críticos que estão ausentes ou inválidos
 */
function getMissingCriticalFields(fields: Record<string, VehicleExtractedField<any>>): string[] {
  const critical = ['plate', 'chassis', 'renavam', 'model', 'manufactureYear', 'modelYear']
  const missing: string[] = []
  for (const f of critical) {
    const fieldObj = fields[f]
    if (!fieldObj || fieldObj.validationStatus === 'NOT_FOUND' || fieldObj.validationStatus === 'INVALID') {
      missing.push(f)
    }
  }
  return missing
}

export async function POST(req: NextRequest) {
  const session = await getServerAuthSession()
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  try {
    requireModule(session.user.role, 'stock.evaluate')
  } catch {
    return NextResponse.json({ error: 'Sem permissão para avaliar estoque.' }, { status: 403 })
  }

  const gate = await assertModuleEnabled(session.user, 'stock.evaluate')
  if (gate) return gate

  const settings = await getConsolidatedSettings()
  if (!settings.general.active) {
    return NextResponse.json({ error: 'Leitor de CRLV temporariamente inativo.' }, { status: 400 })
  }

  const contentType = (req.headers.get('content-type') ?? '').toLowerCase()

  // ───────────────────────────────────────────────────────────────────────────
  // FLUXO B: Processar Observações de OCR / QR do Cliente (Segunda Passada)
  // ───────────────────────────────────────────────────────────────────────────
  if (contentType.includes('application/json')) {
    const json = await req.json().catch(() => null)
    if (json?.isClientResult) {
      const { documentId, documentHash, extractionRunId, ocrText, qrContent } = json
      if (!documentHash || !extractionRunId) {
        return NextResponse.json({ error: 'Parâmetros obrigatórios ausentes.' }, { status: 400 })
      }

      // 1. Busca a transação iniciada
      const extraction = await prisma.vehicleDocumentExtraction.findUnique({
        where: { documentHash },
      })
      if (!extraction) {
        return NextResponse.json({ error: 'Transação de extração não localizada.' }, { status: 404 })
      }

      // 2. Executa o parser sobre o texto OCR recebido
      const ocrVehicle = ocrText ? parseCrlvText(ocrText, settings.mappings) : {}
      
      // 3. Executa o parser sobre o texto PDF nativo que guardamos
      const pdfVehicle = extraction.nativeText ? parseCrlvText(extraction.nativeText, settings.mappings) : {}

      // 4. Executa o consenso campo a campo
      const fields: Record<string, VehicleExtractedField<any>> = {}
      
      // Mapeamento padrão dos campos estruturados
      const standardKeys = [
        'plate', 'chassis', 'renavam', 'manufactureYear', 'modelYear',
        'brand', 'model', 'version', 'color', 'fuelType', 'powerCv',
        'displacementCc', 'officialSpeciesType', 'bodyType', 'ownerName', 'ownerDocument'
      ]

      for (const k of standardKeys) {
        fields[k] = buildExtractedField(
          k,
          (pdfVehicle as any)[k],
          (ocrVehicle as any)[k],
          extraction.nativeText ? 'NATIVE_PDF_TEXT' : 'LOCAL_OCR',
          settings.fieldRules
        )
      }

      // 5. Calcula as derivações catalográficas/determinísticas com consenso
      const officialSpecies = fields.officialSpeciesType?.normalizedValue
      const displacement = fields.displacementCc?.normalizedValue
      const versionStr = fields.version?.normalizedValue || fields.model?.normalizedValue || ''
      
      const vehicleCategory = classifyVehicleCategory(officialSpecies, fields.bodyType?.normalizedValue, settings.mappings?.speciesTypes)
      fields['vehicleGroup'] = {
        field: 'vehicleGroup',
        rawValue: vehicleCategory,
        normalizedValue: vehicleCategory,
        displayValue: vehicleCategory,
        source: 'CATALOG_DERIVED',
        provider: 'autodrive-catalog',
        confidence: 0.9,
        requiresReview: false,
        validationStatus: 'VALID',
      }

      const engineResult = getEngineCommercialLabel(displacement, settings.mappings?.displacements)
      const engineLabel = engineResult.label
      fields['engineCommercialLabel'] = {
        field: 'engineCommercialLabel',
        rawValue: engineLabel,
        normalizedValue: engineLabel,
        displayValue: engineLabel ?? '',
        source: 'CATALOG_DERIVED',
        provider: 'autodrive-catalog',
        confidence: 0.8,
        requiresReview: engineResult.requiresReview,
        validationStatus: 'VALID',
      }

      const transmissionResult = resolveTransmissionType(versionStr, settings.mappings?.transmissions)
      const transmission = transmissionResult.type
      fields['transmissionType'] = {
        field: 'transmissionType',
        rawValue: transmission,
        normalizedValue: transmission,
        displayValue: transmission ?? '',
        source: 'CATALOG_DERIVED',
        provider: 'autodrive-catalog',
        confidence: 0.8,
        requiresReview: transmissionResult.requiresReview,
        validationStatus: 'VALID',
      }

      // 6. Armazena QR Code como metadados adicionais brutos, sem consensus (sem VIO)
      const qrData = qrContent ? {
        found: true,
        contentHash: crypto.createHash('sha256').update(qrContent).digest('hex'),
        rawLength: qrContent.length,
      } : { found: false }

      // 7. Determina o status final e campos ausentes
      const missing = getMissingCriticalFields(fields)
      const hasConflicts = Object.values(fields).some((f) => f.validationStatus === 'CONFLICT')
      const hasInvalid = Object.values(fields).some((f) => f.validationStatus === 'INVALID')
      
      const status = missing.length === 0 && !hasConflicts && !hasInvalid ? 'SUCCESS' : 'PARTIAL'
      const confidence = missing.length === 0 ? 'high' : (fields.plate?.validationStatus === 'VALID' && (fields.chassis?.validationStatus === 'VALID' || fields.renavam?.validationStatus === 'VALID')) ? 'medium' : 'low'

      const finalExtractedData = {
        status,
        confidence,
        missingFields: missing,
        fields,
        qrCode: qrData,
        ocrLength: ocrText?.length ?? 0,
      }

      // 8. Atualiza a transação de extração no DB
      await prisma.vehicleDocumentExtraction.update({
        where: { id: extraction.id },
        data: {
          extractedData: finalExtractedData as any,
        },
      })

      // 9. Registra log de auditoria
      await prisma.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: session.user.id,
          userName: session.user.name,
          userRole: session.user.role,
          action: 'UPDATE',
          entity: 'VehicleDocumentExtraction',
          entityId: extraction.id,
          status: 'SUCCESS',
          afterData: {
            documentHash,
            extractionRunId,
            status,
            confidence,
            missingCount: missing.length,
            qrDetected: qrData.found,
          } as any,
        },
      }).catch(() => {})

      return NextResponse.json({
        extracted: true,
        confidence,
        source: extraction.nativeText ? 'pdf-text' : 'ocr',
        vehicle: toVehicleObject(fields),
        missingFields: missing,
        message: status === 'SUCCESS' ? 'Documento lido e cruzado com sucesso!' : 'Documento lido parcialmente — revise os campos sob pendência.',
        extractionRunId,
        documentId,
        documentHash,
      })
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // FLUXO A: Recebimento do Arquivo Físico (Primeira Passada)
  // ───────────────────────────────────────────────────────────────────────────
  let buffer: Buffer | null = null
  let mimeType: string = ''
  let filename: string = 'documento.pdf'

  try {
    if (contentType.startsWith('multipart/form-data')) {
      const form = await req.formData()
      const f = form.get('file')
      if (!(f instanceof File)) {
        return NextResponse.json({ error: 'Arquivo ausente (campo "file" obrigatório).' }, { status: 400 })
      }
      const maxSize = settings.general.maxSizeMb * 1024 * 1024
      if (f.size > maxSize) {
        return NextResponse.json({ error: `Arquivo maior que o limite de ${settings.general.maxSizeMb}MB.` }, { status: 413 })
      }
      buffer = Buffer.from(await f.arrayBuffer())
      mimeType = f.type || 'application/octet-stream'
      filename = f.name || filename
    } else {
      const json = await req.json().catch(() => null)
      if (!json?.base64) {
        return NextResponse.json({ error: 'Corpo inválido. Esperado multipart ou JSON com base64.' }, { status: 400 })
      }
      const base64 = json.base64.includes(',') ? json.base64.split(',').pop()! : json.base64
      buffer = Buffer.from(base64, 'base64')
      const maxSize = settings.general.maxSizeMb * 1024 * 1024
      if (buffer.byteLength > maxSize) {
        return NextResponse.json({ error: `Arquivo maior que o limite de ${settings.general.maxSizeMb}MB.` }, { status: 413 })
      }
      mimeType = (json.mimeType ?? 'application/pdf').toLowerCase()
      filename = json.filename ?? filename
    }
  } catch (err) {
    return NextResponse.json({ error: 'Falha ao processar o payload do arquivo.', details: (err as Error)?.message }, { status: 400 })
  }

  if (!buffer || buffer.byteLength === 0) {
    return NextResponse.json({ error: 'Arquivo vazio.' }, { status: 400 })
  }

  const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  if (!allowed.includes(mimeType)) {
    return NextResponse.json({ error: `MIME tipo não suportado: ${mimeType}` }, { status: 415 })
  }

  // 1. Calcula hash SHA-256 do arquivo original recebido
  const documentHash = crypto.createHash('sha256').update(buffer).digest('hex')
  const extractionRunId = crypto.randomUUID()
  const documentId = crypto.randomUUID()

  // 2. Consulta se este arquivo exato já foi processado com sucesso
  const existing = await prisma.vehicleDocumentExtraction.findUnique({
    where: { documentHash },
  })

  if (existing && existing.extractedData) {
    const data = existing.extractedData as any
    if (data.status === 'SUCCESS' && data.fields) {
      // Reutiliza o resultado de alta confiança diretamente
      return NextResponse.json({
        extracted: true,
        confidence: data.confidence ?? 'high',
        source: existing.nativeText ? 'pdf-text' : 'ocr',
        vehicle: toVehicleObject(data.fields),
        missingFields: data.missingFields ?? [],
        message: 'Leitura de documento recuperada do cache local (SHA-256).',
        extractionRunId: existing.id,
        documentId,
        documentHash,
      })
    }
  }

  // 3. Se for PDF, tenta extrair o texto de forma nativa e estruturada
  if (mimeType === 'application/pdf') {
    const nativeText = await extractNativePdfText(buffer)
    if (nativeText) {
      // Faz o parsing das regexes sobre o texto nativo
      const parsed = parseCrlvText(nativeText, settings.mappings)

      // Monta os campos iniciais
      const fields: Record<string, VehicleExtractedField<any>> = {}
      const keys = [
        'plate', 'chassis', 'renavam', 'manufactureYear', 'modelYear',
        'brand', 'model', 'version', 'color', 'fuelType', 'powerCv',
        'displacementCc', 'officialSpeciesType', 'bodyType', 'ownerName', 'ownerDocument'
      ]

      for (const k of keys) {
        fields[k] = buildExtractedField(
          k,
          (parsed as any)[k],
          undefined, // sem OCR por enquanto
          'NATIVE_PDF_TEXT',
          settings.fieldRules
        )
      }

      // Derivações
      const officialSpecies = fields.officialSpeciesType?.normalizedValue
      const displacement = fields.displacementCc?.normalizedValue
      const versionStr = fields.version?.normalizedValue || fields.model?.normalizedValue || ''

      const vehicleCategory = classifyVehicleCategory(officialSpecies, fields.bodyType?.normalizedValue, settings.mappings?.speciesTypes)
      fields['vehicleGroup'] = {
        field: 'vehicleGroup',
        rawValue: vehicleCategory,
        normalizedValue: vehicleCategory,
        displayValue: vehicleCategory,
        source: 'CATALOG_DERIVED',
        provider: 'autodrive-catalog',
        confidence: 0.9,
        requiresReview: false,
        validationStatus: 'VALID',
      }

      const engineResult = getEngineCommercialLabel(displacement, settings.mappings?.displacements)
      const engineLabel = engineResult.label
      fields['engineCommercialLabel'] = {
        field: 'engineCommercialLabel',
        rawValue: engineLabel,
        normalizedValue: engineLabel,
        displayValue: engineLabel ?? '',
        source: 'CATALOG_DERIVED',
        provider: 'autodrive-catalog',
        confidence: 0.8,
        requiresReview: engineResult.requiresReview,
        validationStatus: 'VALID',
      }

      const transmissionResult = resolveTransmissionType(versionStr, settings.mappings?.transmissions)
      const transmission = transmissionResult.type
      fields['transmissionType'] = {
        field: 'transmissionType',
        rawValue: transmission,
        normalizedValue: transmission,
        displayValue: transmission ?? '',
        source: 'CATALOG_DERIVED',
        provider: 'autodrive-catalog',
        confidence: 0.8,
        requiresReview: transmissionResult.requiresReview,
        validationStatus: 'VALID',
      }

      const missing = getMissingCriticalFields(fields)
      const hasInvalid = Object.values(fields).some((f) => f.validationStatus === 'INVALID')
      const status = missing.length === 0 && !hasInvalid ? 'SUCCESS' : 'PARTIAL'
      const confidence = missing.length === 0 ? 'high' : (fields.plate?.validationStatus === 'VALID' && (fields.chassis?.validationStatus === 'VALID' || fields.renavam?.validationStatus === 'VALID')) ? 'medium' : 'low'

      const extractedData = {
        status,
        confidence,
        missingFields: missing,
        fields,
      }

      // Cria a transação de extração no banco
      const record = await prisma.vehicleDocumentExtraction.upsert({
        where: { documentHash },
        create: {
          id: extractionRunId,
          tenantId: session.user.tenantId,
          documentHash,
          nativeText,
          extractedData: extractedData as any,
        },
        update: {
          nativeText,
          extractedData: extractedData as any,
        },
      })

      // Se obtivemos alta confiança, já encerra sem pedir OCR local
      const isHighConfidence = status === 'SUCCESS' && confidence === 'high'
      
      // Registra auditoria
      await prisma.auditLog.create({
        data: {
          tenantId: session.user.tenantId,
          userId: session.user.id,
          userName: session.user.name,
          userRole: session.user.role,
          action: 'CREATE',
          entity: 'VehicleDocumentExtraction',
          entityId: record.id,
          status: 'SUCCESS',
          afterData: {
            documentHash,
            mimeType,
            status,
            confidence,
            isHighConfidence,
          } as any,
        },
      }).catch(() => {})

      if (isHighConfidence) {
        return NextResponse.json({
          extracted: true,
          confidence,
          source: 'pdf-text',
          vehicle: toVehicleObject(fields),
          missingFields: missing,
          message: 'Documento em PDF nativo lido com sucesso.',
          extractionRunId: record.id,
          documentId,
          documentHash,
        })
      }

      // Caso contrário, retorna exigindo OCR complementar no client
      return NextResponse.json({
        extracted: true,
        requiresOcr: true,
        confidence,
        source: 'pdf-text',
        vehicle: toVehicleObject(fields),
        missingFields: missing,
        message: 'PDF digital com texto parcial. Executando OCR local para complementar.',
        extractionRunId: record.id,
        documentId,
        documentHash,
      })
    }
  }

  // 4. Se for imagem ou PDF escaneado (sem texto nativo)
  const record = await prisma.vehicleDocumentExtraction.upsert({
    where: { documentHash },
    create: {
      id: extractionRunId,
      tenantId: session.user.tenantId,
      documentHash,
      nativeText: null,
      extractedData: null as any,
    },
    update: {},
  })

  // Registra auditoria de inicialização de OCR
  await prisma.auditLog.create({
    data: {
      tenantId: session.user.tenantId,
      userId: session.user.id,
      userName: session.user.name,
      userRole: session.user.role,
      action: 'CREATE',
      entity: 'VehicleDocumentExtraction',
      entityId: record.id,
      status: 'SUCCESS',
      afterData: {
        documentHash,
        mimeType,
        requiresOcr: true,
      } as any,
    },
  }).catch(() => {})

  return NextResponse.json({
    extracted: true,
    requiresOcr: true,
    confidence: 'low',
    source: 'ocr',
    vehicle: {},
    missingFields: ['plate', 'chassis', 'renavam', 'model', 'manufactureYear', 'modelYear'],
    message: 'Processando documento via OCR e QR Code local.',
    extractionRunId: record.id,
    documentId,
    documentHash,
  })
}
