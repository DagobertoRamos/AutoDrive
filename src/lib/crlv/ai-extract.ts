// =============================================================================
// src/lib/crlv/ai-extract.ts
//
// Extração de dados de CRLV/CRLV-e via IA de visão (Google Gemini), suportando
// PDF E imagem (foto do documento) de forma uniforme e robusta em serverless.
//
// Ativação: defina GEMINI_API_KEY (ou GOOGLE_API_KEY) no ambiente. Sem a chave,
// esta função retorna null e o chamador cai no parser de PDF por regex.
// Modelo configurável via GEMINI_MODEL (default: gemini-2.0-flash).
//
// Não persiste nada nem registra PII em log de produção.
// =============================================================================

import type { ExtractedVehicle, ExtractionResult } from './parser'

const ENDPOINT = (model: string, key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`

const EXTRACTION_PROMPT = `Você é um extrator de dados de documentos veiculares brasileiros (CRLV / CRLV-e).
Analise o documento (PDF ou imagem) e extraia os campos do veículo.
Regras:
- Retorne SOMENTE os dados presentes no documento. Use null para o que não encontrar. NÃO invente.
- "plate": placa no formato AAA0A00 (Mercosul) ou AAA0000 (antigo), sem espaços nem traços.
- "chassis": chassi/VIN com 17 caracteres (sem I, O, Q).
- "renavam": apenas dígitos.
- "brand": marca por extenso (ex.: Volkswagen, Chevrolet, Fiat). "model" e "version" separados quando possível.
- "modelYear"/"manufactureYear": números (ex.: 2022).
- "fuel": um de GASOLINA, ETANOL, FLEX, DIESEL, HÍBRIDO, ELÉTRICO, GNV.
- "vehicleType": um de CARRO, MOTO, CAMINHAO conforme a espécie.`

// Esquema de saída estruturada (força JSON).
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    plate: { type: 'STRING', nullable: true },
    renavam: { type: 'STRING', nullable: true },
    chassis: { type: 'STRING', nullable: true },
    brand: { type: 'STRING', nullable: true },
    model: { type: 'STRING', nullable: true },
    version: { type: 'STRING', nullable: true },
    modelYear: { type: 'INTEGER', nullable: true },
    manufactureYear: { type: 'INTEGER', nullable: true },
    exerciseYear: { type: 'INTEGER', nullable: true },
    fuel: { type: 'STRING', nullable: true },
    predominantColor: { type: 'STRING', nullable: true },
    ownerName: { type: 'STRING', nullable: true },
    ownerDocument: { type: 'STRING', nullable: true },
    city: { type: 'STRING', nullable: true },
    state: { type: 'STRING', nullable: true },
    category: { type: 'STRING', nullable: true },
    speciesType: { type: 'STRING', nullable: true },
    bodyType: { type: 'STRING', nullable: true },
    power: { type: 'STRING', nullable: true },
    displacement: { type: 'STRING', nullable: true },
    motorNumber: { type: 'STRING', nullable: true },
    crvNumber: { type: 'STRING', nullable: true },
    securityCode: { type: 'STRING', nullable: true },
    vehicleType: { type: 'STRING', nullable: true },
  },
}

function clean<T extends Record<string, unknown>>(obj: T): ExtractedVehicle {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue
    if (typeof v === 'string') {
      const t = v.trim()
      if (!t || t.toLowerCase() === 'null') continue
      out[k] = t
    } else {
      out[k] = v
    }
  }
  if (typeof out.plate === 'string') out.plate = (out.plate as string).replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 7)
  if (typeof out.renavam === 'string') out.renavam = (out.renavam as string).replace(/\D/g, '')
  if (typeof out.chassis === 'string') out.chassis = (out.chassis as string).replace(/[^A-HJ-NPR-Z0-9]/gi, '').toUpperCase()
  return out as ExtractedVehicle
}

/** Extrai via Gemini. Retorna null se a chave não estiver configurada. */
export async function extractWithAI(buffer: Buffer, mimeType: string): Promise<ExtractionResult | null> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!key) return null
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash'

  const body = {
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: buffer.toString('base64') } },
        { text: EXTRACTION_PROMPT },
      ],
    }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
    },
  }

  const res = await fetch(ENDPOINT(model, key), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Gemini ${res.status}: ${detail.slice(0, 200)}`)
  }

  const json = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  if (!text) throw new Error('Resposta vazia da IA.')

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(text)
  } catch {
    // Às vezes vem cercado por ```json ... ```
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('IA não retornou JSON válido.')
    parsed = JSON.parse(m[0])
  }

  const vehicle = clean(parsed)
  const critical = ['plate', 'chassis', 'renavam', 'brand', 'model', 'modelYear'] as const
  const missing = critical.filter((k) => !vehicle[k]).map(String)
  const extracted = Object.keys(vehicle).length > 0
  const confidence = missing.length === 0 ? 'high' : (vehicle.plate && (vehicle.chassis || vehicle.renavam)) ? 'medium' : 'low'

  return {
    success: true,
    extracted,
    confidence,
    source: 'ocr',
    vehicle,
    missingFields: missing,
    warnings: missing.length ? [`Campos críticos não localizados: ${missing.join(', ')}`] : [],
    message: extracted
      ? (confidence === 'high' ? 'Documento lido com sucesso (IA).' : 'Documento lido parcialmente (IA) — revise os campos.')
      : 'Não foi possível extrair dados do documento.',
  }
}
