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

// Endpoint SEM a chave na URL — a chave vai no header `x-goog-api-key` (não
// vaza em logs/URL). Mesma regra de segurança do GeminiAdapter.
const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

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

/** Faz uma chamada generateContent ao Gemini e devolve o texto. */
async function callGemini(model: string, key: string, mimeType: string, base64: string, withSchema: boolean): Promise<string> {
  const body = {
    contents: [{
      parts: [
        { inlineData: { mimeType, data: base64 } },
        { text: withSchema ? EXTRACTION_PROMPT : `${EXTRACTION_PROMPT}\nResponda APENAS um objeto JSON válido (sem markdown).` },
      ],
    }],
    generationConfig: withSchema
      ? { temperature: 0, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA }
      : { temperature: 0, responseMimeType: 'application/json' },
  }
  const res = await fetch(ENDPOINT(model), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    // Mensagens amigáveis por status (sem expor a chave).
    if (res.status === 429) throw new Error('limite de uso da IA atingido (cota do Google) — tente em alguns minutos ou ative o faturamento/aumente a cota no Google AI Studio')
    if (res.status === 401 || res.status === 403) throw new Error('chave do Gemini inválida ou sem acesso ao modelo')
    if (res.status === 404) throw new Error(`modelo "${model}" indisponível (ajuste GEMINI_MODEL)`)
    if (res.status >= 500) throw new Error('serviço do Gemini instável no momento — tente novamente')
    throw new Error(`Gemini ${res.status}: ${detail.replace(/\s+/g, ' ').slice(0, 160)}`)
  }
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  return json?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
}

/** Extrai via Gemini. Retorna null se a chave não estiver configurada. */
export async function extractWithAI(buffer: Buffer, mimeType: string): Promise<ExtractionResult | null> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!key) return null
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
  const base64 = buffer.toString('base64')

  // 1ª tentativa com saída estruturada (responseSchema); se falhar (alguns
  // modelos recusam schema + arquivo), tenta novamente só pedindo JSON.
  let text = ''
  try {
    text = await callGemini(model, key, mimeType, base64, true)
  } catch (e1) {
    try {
      text = await callGemini(model, key, mimeType, base64, false)
    } catch (e2) {
      throw new Error((e2 as Error)?.message || (e1 as Error)?.message || 'Falha na IA.')
    }
  }
  if (!text) throw new Error('Resposta vazia da IA (documento pode estar ilegível ou bloqueado).')

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
    source: 'EXTERNAL_AI',
    vehicle,
    missingFields: missing,
    warnings: missing.length ? [`Campos críticos não localizados: ${missing.join(', ')}`] : [],
    message: extracted
      ? (confidence === 'high' ? 'Documento lido com sucesso (IA).' : 'Documento lido parcialmente (IA) — revise os campos.')
      : 'Não foi possível extrair dados do documento.',
  }
}
