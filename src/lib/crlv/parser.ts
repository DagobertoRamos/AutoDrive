// =============================================================================
// src/lib/crlv/parser.ts
//
// Extrator de dados do CRLV/CRLV-e a partir de texto (PDF nativo ou OCR).
// Implementa reconstrução posicional de PDF, consenso entre fontes,
// validação de regras de campos e cálculo de score de confiança.
// =============================================================================

export * from './types'
import {
  ExtractedVehicle,
  ExtractionSource,
  ValidationStatus,
  VehicleCategory,
  VehicleExtractedField,
  PositionedToken,
} from './types'
import {
  normalizeText,
  classifyVehicleCategory,
  getEngineCommercialLabel,
  resolveTransmissionType,
} from './deterministic'

// ── Helpers de Validação ─────────────────────────────────────────────────────

export function validatePlate(plate: string | undefined | null): boolean {
  if (!plate) return false
  const clean = plate.trim().toUpperCase().replace(/[\s\-]/g, '')
  const oldRegex = /^[A-Z]{3}[0-9]{4}$/
  const mercosulRegex = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/
  return oldRegex.test(clean) || mercosulRegex.test(clean)
}

export function validateChassis(chassis: string | undefined | null): boolean {
  if (!chassis) return false
  const clean = chassis.trim().toUpperCase().replace(/[\s\-]/g, '')
  // Chassi possui 17 caracteres alfanuméricos e não usa I, O, Q para evitar confusões
  const chassisRegex = /^[A-HJ-NPR-Z0-9]{17}$/
  return chassisRegex.test(clean)
}

export function validateRenavam(renavam: string | undefined | null): boolean {
  if (!renavam) return false
  const clean = renavam.trim().replace(/[^\d]/g, '')
  if (clean.length !== 11 && clean.length !== 9) return false
  if (/^(\d)\1+$/.test(clean)) return false // rejeita todos iguais (ex: 11111111111)
  
  // Validador oficial do RENAVAM (módulo 11)
  const fullRenavam = clean.padStart(11, '0')
  const base = fullRenavam.slice(0, 10)
  const digit = Number(fullRenavam[10])

  let sum = 0
  const weights = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  for (let i = 0; i < 10; i++) {
    sum += Number(base[i]) * weights[i]
  }

  const remainder = (sum * 10) % 11
  const calculatedDigit = remainder === 10 ? 0 : remainder
  return calculatedDigit === digit
}

// ── Reconstrução Posicional do PDF ───────────────────────────────────────────

/**
 * Agrupa itens de texto do PDF.js por coordenada Y (linhas) e depois ordena por X (colunas).
 * Preserva o layout visual da leitura do documento original.
 */
export function reconstructVisualText(items: any[]): string {
  const tolerance = 5 // tolerância em pontos para agrupar na mesma linha
  const lines: { y: number; items: any[] }[] = []

  for (const item of items) {
    if (!item || typeof item.str !== 'string') continue
    const str = item.str
    const transform = item.transform || [0, 0, 0, 0, 0, 0]
    const x = transform[4] ?? 0
    const y = transform[5] ?? 0

    let foundLine = lines.find((l) => Math.abs(l.y - y) <= tolerance)
    if (!foundLine) {
      foundLine = { y, items: [] }
      lines.push(foundLine)
    }
    foundLine.items.push({ str, x, y })
  }

  // Ordena as linhas de cima para baixo (Y decrescente)
  lines.sort((a, b) => b.y - a.y)

  // Ordena os itens de cada linha da esquerda para a direita (X crescente)
  const lineTexts = lines.map((line) => {
    line.items.sort((a, b) => a.x - b.x)
    return line.items.map((it) => it.str).join(' ')
  })

  return lineTexts.join('\n')
}

/**
 * Normaliza um token extraindo do texto bruto tudo que for alfanumérico.
 * IMPORTANTE: remove `/` também para que rótulos como "MARCA / MODELO / VERSÃO"
 * casem com âncoras compactas tipo "MARCAMODELOVERSAO".
 */
function normalizeTokenText(text: string): string {
  return text.trim().toUpperCase().replace(/[\s\-_.:,;\/]/g, '')
}

/**
 * Detecta se um token é um RÓTULO (label) do CRLV — texto todo em UPPERCASE,
 * sem dígitos, sem caracteres especiais além de barras/pontos/parênteses.
 * Ex: "PLACA", "EXERCÍCIO", "COMBUSTÍVEL", "ANO MODELO", "CPF / CNPJ".
 * Valores reais NÃO batem porque contêm dígitos (placa/renavam/anos), ou
 * são muito longos (nomes), ou têm formato específico.
 */
function looksLikeLabel(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  // Se tem dígito, provavelmente é um valor (placa, renavam, ano, potência)
  if (/\d/.test(t)) return false
  // Se é muito longo, não é label
  if (t.length > 40) return false
  // Se tem caracteres típicos de valor (asterisco de campo mascarado)
  if (/^\*+/.test(t)) return false
  // Se é todo UPPERCASE (ou tem barras/pontos), é label
  const alphaOnly = t.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, '')
  if (!alphaOnly) return false
  return alphaOnly === alphaOnly.toUpperCase()
}

/**
 * Converte itens brutos do PDF.js em PositionedToken.
 */
export function extractPositionedTokens(items: any[], page: number): PositionedToken[] {
  const tokens: PositionedToken[] = []
  for (const item of items) {
    if (!item || typeof item.str !== 'string') continue
    const text = item.str.trim()
    if (!text) continue
    const transform = item.transform || [0, 0, 0, 0, 0, 0]
    tokens.push({
      text,
      normalizedText: normalizeTokenText(text),
      x: transform[4] ?? 0,
      y: transform[5] ?? 0,
      width: item.width ?? 0,
      height: item.height ?? 0,
      page,
    })
  }
  return tokens
}

/**
 * Parser por Coordenadas (CRLV Digital).
 * Busca os valores associando rótulos (âncoras) com os textos geometricamente
 * abaixo deles (layout do CRLV-e brasileiro: linha de rótulos, linha de valores).
 * Fallback para same-line quando não houver valor abaixo.
 */
export function parseCrlvByCoordinates(tokens: PositionedToken[], mappings?: any): ExtractedVehicle {
  const v: ExtractedVehicle = {}

  // 1. Agrupar em linhas (tolerância Y de 5pt) — POR PÁGINA. O Y reinicia a
  // cada página do PDF; sem a chave de página, tokens da página 2 se
  // intercalam nas linhas da página 1 e viram "valores" de rótulos errados.
  const toleranceY = 5
  const lines: { page: number; y: number; tokens: PositionedToken[] }[] = []

  for (const token of tokens) {
    const page = token.page ?? 1
    let line = lines.find((l) => l.page === page && Math.abs(l.y - token.y) <= toleranceY)
    if (!line) {
      line = { page, y: token.y, tokens: [] }
      lines.push(line)
    }
    line.tokens.push(token)
  }

  // Ordena por página e, dentro dela, de cima para baixo
  lines.sort((a, b) => a.page - b.page || b.y - a.y)
  lines.forEach((l) => l.tokens.sort((a, b) => a.x - b.x))

  /**
   * Procura o valor associado a uma âncora (rótulo) no CRLV.
   *
   * ESTRATÉGIA (baseada no layout REAL do CRLV-e digital):
   *   1. PRIMEIRO tenta a linha ABAIXO (mesma coluna X) — é onde o valor está
   *      no CRLV-e (LABEL em cima, VALOR embaixo).
   *   2. Fallback same-line ignorando tokens que também são labels (rótulos
   *      vizinhos como "ANO FABRICAÇÃO ANO MODELO" na mesma linha).
   *   3. Valida o valor com `accept(value)` se fornecido; se falhar, continua
   *      procurando o próximo candidato.
   *
   * @param anchorRegex regex contra normalizedText (sem espaços, sem `/`)
   * @param opts.ignoreRegex ignora tokens candidatos que casem essa regex
   * @param opts.accept função de validação; retorna false para descartar candidato
   * @param opts.maxDistX limite horizontal para same-line
   * @param opts.maxDistY limite vertical para "abaixo"
   * @param opts.colTolerance tolerância na coluna X para "abaixo"
   * @param opts.multiToken se true, concatena todos os tokens da linha abaixo
   *                        na mesma coluna X (útil pra MARCA/MODELO/VERSÃO)
   */
  const findValue = (
    anchorRegex: RegExp,
    opts: {
      ignoreRegex?: RegExp
      accept?: (value: string) => boolean
      maxDistX?: number
      maxDistY?: number
      colTolerance?: { left: number; right: number }
      multiToken?: boolean
    } = {},
  ): string | null => {
    const {
      ignoreRegex,
      accept,
      maxDistX = 300,
      maxDistY = 40,
      colTolerance = { left: 20, right: 100 },
      multiToken = false,
    } = opts

    const candidates: { value: string; method: string }[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      for (let j = 0; j < line.tokens.length; j++) {
        const token = line.tokens[j]
        if (!anchorRegex.test(token.normalizedText)) continue

        // ── 1. LINHA(S) ABAIXO na mesma coluna X (prioritário no CRLV-e) ──
        // Coleta candidatos de TODAS as linhas dentro do range Y; deixa o
        // `accept` decidir qual é válido. Isso permite que uma linha extra de
        // rótulos (ex: "PLACA / EXERCÍCIO") não bloqueie a busca do valor.
        for (let k = i + 1; k < lines.length; k++) {
          const nextLine = lines[k]
          if (nextLine.page !== line.page) break // nunca cruza para outra página
          if (line.y - nextLine.y > maxDistY) break

          const colTokens = nextLine.tokens.filter(
            (t) => t.x >= token.x - colTolerance.left && t.x <= token.x + colTolerance.right,
          )
          if (colTokens.length === 0) continue

          if (multiToken) {
            const combined = colTokens.map((t) => t.text).join(' ')
            candidates.push({ value: combined, method: 'below-multi' })
          } else {
            for (const belowToken of colTokens) {
              if (ignoreRegex && ignoreRegex.test(belowToken.normalizedText)) continue
              candidates.push({ value: belowToken.text, method: 'below' })
            }
          }
        }

        // ── 2. Same-line fallback (ignora vizinhos que são labels) ──
        if (candidates.length === 0) {
          for (let k = j + 1; k < line.tokens.length; k++) {
            const nextToken = line.tokens[k]
            if (nextToken.x - token.x > maxDistX) break
            if (ignoreRegex && ignoreRegex.test(nextToken.normalizedText)) continue
            if (looksLikeLabel(nextToken.text)) continue
            candidates.push({ value: nextToken.text, method: 'same-line' })
            break
          }
        }

        // ── 3. Aplica accept e retorna primeiro válido ──
        for (const c of candidates) {
          if (!accept || accept(c.value)) return c.value
        }
        // Se nenhum candidato passou no accept, tenta a próxima ocorrência da âncora
        candidates.length = 0
      }
    }
    return null
  }

  // Busca de campos
  // NOTA: normalizedText já vem sem espaços, sem `/`, sem `-`, sem `.`, sem `:`
  // (ver normalizeTokenText). Todas as regex de âncora ignoram esses separadores.

  // PLACA — 3 letras + 4 alfanuméricos (antiga ou Mercosul)
  const placaRaw = findValue(/^PLACA$/, {
    ignoreRegex: /^EXERC|^ANTERIOR/,
    accept: (val) => validatePlate(val),
  })
  if (placaRaw && validatePlate(placaRaw)) v.plate = placaRaw.replace(/[^A-Z0-9]/gi, '').toUpperCase()

  // RENAVAM — 9-11 dígitos com validador módulo 11
  const renavamRaw = findValue(/RENAVAM/, {
    accept: (val) => validateRenavam(val),
  })
  if (renavamRaw && validateRenavam(renavamRaw)) v.renavam = renavamRaw.replace(/[^\d]/g, '')

  // CHASSI — 17 caracteres alfanuméricos (sem I, O, Q)
  const chassiRaw = findValue(/CHASSI/, {
    accept: (val) => validateChassis(val),
  })
  if (chassiRaw && validateChassis(chassiRaw)) v.chassis = chassiRaw.replace(/[^A-Z0-9]/gi, '').toUpperCase()

  // MARCA / MODELO / VERSÃO — multiToken porque valor tem espaços ("FIAT/MOBI LIKE")
  const mmvRaw = findValue(/MARCAMODELOVERS/, {
    multiToken: true,
    accept: (val) => val.length >= 3 && !/^\*+/.test(val),
  })
  if (mmvRaw) {
    v.brandModelVersionRaw = mmvRaw
    const slashIdx = mmvRaw.indexOf('/')
    if (slashIdx > 0) {
      const brandRaw = mmvRaw.slice(0, slashIdx).trim()
      const rest = mmvRaw.slice(slashIdx + 1).trim()
      const normBrand = mappings?.brands?.[brandRaw.toUpperCase()] ?? brandRaw
      v.brand = normalizeText(normBrand)

      const parts = rest.split(/\s+/).filter(Boolean)
      if (parts.length > 0) {
        v.model = parts[0]
        if (parts.length > 1) {
          v.version = parts.slice(1).join(' ')
        }
      }
    } else {
      v.model = mmvRaw.trim()
    }
  }

  // ANO FABRICAÇÃO — 4 dígitos entre 1900 e ano atual + 1
  const currentYear = new Date().getFullYear()
  const acceptYear = (val: string): boolean => {
    const n = parseInt(val.replace(/[^\d]/g, ''), 10)
    return Number.isFinite(n) && n >= 1900 && n <= currentYear + 2
  }
  const anoFabRaw = findValue(/ANOFABRICA[CÇ][AÃ]O/, { accept: acceptYear })
  if (anoFabRaw) v.manufactureYear = parseInt(anoFabRaw.replace(/[^\d]/g, ''), 10)

  const anoModRaw = findValue(/ANOMODELO/, { accept: acceptYear })
  if (anoModRaw) v.modelYear = parseInt(anoModRaw.replace(/[^\d]/g, ''), 10)

  // COR PREDOMINANTE — só letras (evita pegar "COMBUSTÍVEL" na linha ao lado)
  const corRaw = findValue(/CORPREDOMINANTE/, {
    accept: (val) => /^[A-Za-zÀ-ÖØ-öø-ÿ\s]{3,}$/.test(val.trim()),
  })
  if (corRaw) v.color = corRaw.trim().toUpperCase()

  // COMBUSTÍVEL — deve casar com valores conhecidos, não com rótulo vizinho
  const combRaw = findValue(/COMBUST[IÍ]VEL/, {
    accept: (val) => {
      const u = val.toUpperCase()
      return /ALCOOL|GASOLINA|DIESEL|FLEX|H[ÍI]BRID|EL[ÉE]TRIC|ETANOL|GNV/.test(u)
    },
  })
  if (combRaw) {
    const txt = combRaw.toUpperCase()
    if (/\bALCOOL[\s\/]+GASOLINA\b|\bFLEX\b|\bBI[\s\-]?COMBUST/i.test(txt)) v.fuelType = 'FLEX'
    else if (/\bGASOLINA\b/i.test(txt)) v.fuelType = 'GASOLINA'
    else if (/\bDIESEL\b/i.test(txt)) v.fuelType = 'DIESEL'
    else if (/\bH[ÍI]BRID/i.test(txt)) v.fuelType = 'HÍBRIDO'
    else if (/\bEL[ÉE]TRIC/i.test(txt)) v.fuelType = 'ELÉTRICO'
    else if (/\bETANOL\b|\bALCOOL\b/i.test(txt)) v.fuelType = 'ETANOL'
    else if (/\bGNV\b/i.test(txt)) v.fuelType = 'GNV'

    if (v.fuelType && mappings?.fuels?.[v.fuelType]) {
      v.fuelType = mappings.fuels[v.fuelType]
    }
  }

  // ESPÉCIE / TIPO — multiToken porque valor pode ser "PASSAGEIRO AUTOMOVEL"
  const espRaw = findValue(/ESP[EÉ]CIETIPO/, {
    multiToken: true,
    accept: (val) => /^[A-Za-zÀ-ÖØ-öø-ÿ\s\/]{3,}$/.test(val.trim()),
  })
  if (espRaw) v.officialSpeciesType = espRaw.trim().toUpperCase()

  // CARROCERIA
  const carrocRaw = findValue(/CARROCERIA/, {
    multiToken: true,
    accept: (val) => val.trim().length >= 3,
  })
  if (carrocRaw) {
    const clean = carrocRaw.replace(/\s+/g, '').toUpperCase()
    if (/N[AÃ]OAPLIC[AÁ]VEL/i.test(clean)) {
      v.bodyType = 'NÃO APLICÁVEL'
    } else {
      const KNOWN_BODY = ['SEDAN', 'HATCH', 'SUV', 'PICAPE', 'PICKUP', 'CAMINHONETE']
      for (const body of KNOWN_BODY) {
        if (new RegExp(`\\b${body}\\b`, 'i').test(carrocRaw)) {
          v.bodyType = body
          break
        }
      }
    }
  }

  // POTÊNCIA / CILINDRADA — formato "74CV/999" ou "104CV/1598"
  // A âncora normalizada vira "POTÊNCIACILINDRADA" (removeu `/`)
  const potRaw = findValue(/POT[EÊ]NCIACILINDRADA/, {
    accept: (val) => /\d{2,4}\s*CV\s*\/\s*\d{3,5}/i.test(val.replace(/\s+/g, '')),
  })
  if (potRaw) {
    // Aceita "74CV/999", "74 CV / 999", "74CV/999cm3", etc.
    const clean = potRaw.replace(/\s+/g, '')
    const pcMatch = /(\d{2,4})CV\/(\d{3,5})/i.exec(clean)
    if (pcMatch) {
      v.powerCv = Number(pcMatch[1])
      v.displacementCc = Number(pcMatch[2])
    }
  }

  return v
}

// Helper: aplica regex e devolve o primeiro grupo capturado (trim) ou undefined.
function match(text: string, re: RegExp, group = 1): string | undefined {
  const m = re.exec(text)
  if (!m || !m[group]) return undefined
  return m[group].trim()
}

// ── Regex Parser ─────────────────────────────────────────────────────────────

export function parseCrlvText(rawText: string, mappings?: any): ExtractedVehicle {
  const v: ExtractedVehicle = {}

  // Linhas preservadas — o OCR (Tesseract) e o texto linearizado do PDF mantêm
  // a ordem visual do documento: linha de RÓTULO seguida da linha de VALOR.
  // A estratégia primária é âncora→valor (mesma lógica que consertou o parser
  // de coordenadas); os regex globais antigos ficam como fallback, mas agora
  // todos os candidatos passam pelos validadores antes de serem aceitos.
  const lines = rawText.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean)

  const text = rawText
    .replace(/([A-Z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Z])/g, '$1 $2')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')

  // Lixo da coluna direita / rodapé que vaza para o valor quando o OCR junta
  // colunas ("FIAT/MOBI LIKE DADOS DO SEGURO DPVAT" → corta em DADOS).
  // NOTA: não cortamos em "gap de colunas" (\s{3,}) — o texto linearizado do
  // PDF junta colunas legítimas na mesma linha ("2024   2025 CARROCERIA") e o
  // corte amputaria o segundo valor. Os extratores por campo é que decidem o
  // que aproveitar da linha.
  const JUNK_CUT_RE = /\b(DADOS\b|SEGUROS?\b|DPVAT\b|ASSINADO\b|SENATRAN\b|MENSAGENS\b|OBSERVA[ÇC]|INFORMA[ÇC]|VALIDE\b|QRCODE\b|CAT\.?\s*TARIF)\S*.*$/i
  const stripJunk = (s: string): string =>
    s.replace(JUNK_CUT_RE, '').trim()

  /**
   * Âncora→valor sobre linhas: encontra a linha do rótulo e tenta extrair o
   * valor do restante da mesma linha, senão das próximas `lookAhead` linhas.
   * `extract` valida/normaliza o candidato — retornar null descarta e a busca
   * continua (próximo candidato ou próxima ocorrência da âncora).
   */
  const findByAnchor = <T>(labelRe: RegExp, extract: (candidate: string) => T | null, lookAhead = 2): T | null => {
    for (let i = 0; i < lines.length; i++) {
      const m = labelRe.exec(lines[i])
      if (!m) continue
      const candidates: string[] = []
      const sameLine = lines[i].slice(m.index + m[0].length).trim()
      if (sameLine) candidates.push(sameLine)
      for (let k = 1; k <= lookAhead && i + k < lines.length; k++) candidates.push(lines[i + k])
      for (const raw of candidates) {
        const cleaned = stripJunk(raw)
        if (!cleaned) continue
        const got = extract(cleaned)
        if (got != null) return got
      }
    }
    return null
  }

  // ── 1. Placa — âncora "PLACA" (ignora PLACA ANTERIOR); fallback varredura
  // Guardas de fronteira (?<![A-Z0-9])/(?![A-Z0-9]) impedem extrair uma
  // "placa" de dentro de um chassi ("JTEKZN1850C004251" NÃO vira "KZN1850").
  const extractPlate = (s: string): string | null => {
    const m = /(?<![A-Z0-9])([A-Z]{3})[\s\-]?([0-9])([A-Z0-9])([0-9]{2})(?![A-Z0-9])/i.exec(s)
    if (!m) return null
    const candidate = `${m[1]}${m[2]}${m[3]}${m[4]}`.toUpperCase()
    return validatePlate(candidate) ? candidate : null
  }
  v.plate = findByAnchor(/\bPLACA\b(?!\s*ANTERIOR)/i, extractPlate) ?? undefined
  if (!v.plate) {
    const plateRe = /(?<![A-Z0-9])([A-Z]{3})[\s\-]?([0-9])([A-Z0-9])([0-9]{2})(?![A-Z0-9])/gi
    for (const m of rawText.matchAll(plateRe)) {
      const candidate = `${m[1]}${m[2]}${m[3]}${m[4]}`.toUpperCase()
      if (validatePlate(candidate)) { v.plate = candidate; break }
    }
  }

  // ── 2. RENAVAM — âncora + validador módulo 11; fallback varredura validada
  // Runs de dígitos (não junta números através de separadores — evita colar
  // o renavam com valores vizinhos da linha)
  const extractRenavam = (s: string): string | null => {
    for (const run of s.split(/\D+/).filter(Boolean)) {
      if (run.length >= 9 && run.length <= 11 && validateRenavam(run)) return run
    }
    return null
  }
  v.renavam = findByAnchor(/RENAVAM/i, extractRenavam) ?? undefined
  if (!v.renavam) {
    const renRe = /(?<!\d)(\d{11})(?!\d)/g
    for (const m of rawText.matchAll(renRe)) {
      if (validateRenavam(m[1])) { v.renavam = m[1]; break }
    }
  }

  // ── 3. Chassi — âncora + validador 17 chars; fallback varredura validada
  // Janelas DELIMITADAS na linha original primeiro (evita colar tokens
  // vizinhos: "ABC1234/SP 9BWAB45U..." não pode virar "SP9BWAB45U...").
  // Só depois tenta a variante sem espaços (OCR pode partir o chassi ao meio),
  // ainda exigindo fronteira não-alfanumérica.
  // Chassi real sempre carrega série numérica — exigir dígitos impede que 17
  // letras de texto comum ("FUNDONACIONAL...") passem no charset do validador.
  const chassisHasDigits = (c: string): boolean => (c.match(/\d/g) ?? []).length >= 4
  const extractChassis = (s: string): string | null => {
    const upper = s.toUpperCase()
    for (const m of upper.matchAll(/(?<![A-Z0-9])([A-HJ-NPR-Z0-9]{17})(?![A-Z0-9])/g)) {
      if (validateChassis(m[1]) && chassisHasDigits(m[1])) return m[1]
    }
    // OCR pode partir o chassi ao meio ("9BWAB45U 0PT004251") — junta até 3
    // tokens ADJACENTES cuja soma dê exatamente 17. Não desloca janela sobre
    // texto vizinho: só concatenações exatas, com dígitos, de poucos pedaços.
    const runs = upper.split(/[^A-HJ-NPR-Z0-9]+/).filter(Boolean)
    for (let i = 0; i < runs.length; i++) {
      if (runs[i].length === 17) continue // já testado no passo delimitado
      let acc = ''
      for (let j = i; j < runs.length && j <= i + 2 && acc.length < 17; j++) {
        acc += runs[j]
        if (acc.length === 17 && j > i && validateChassis(acc) && chassisHasDigits(acc)) return acc
      }
    }
    return null
  }
  v.chassis = findByAnchor(/CHASSI/i, extractChassis) ?? undefined
  if (!v.chassis) {
    const chassiRe = /(?<![A-Z0-9])([A-HJ-NPR-Z0-9]{17})(?![A-Z0-9])/gi
    for (const m of rawText.matchAll(chassiRe)) {
      const c = m[1].toUpperCase()
      if (validateChassis(c)) { v.chassis = c; break }
    }
  }

  // ── 4. Anos — o CRLV imprime "ANO FABRICAÇÃO | ANO MODELO" e os valores na
  //    linha (ou linhas) seguinte(s). Coletamos um POOL de anos das próximas
  //    linhas em ordem de leitura: rótulo duplo → 1º ano = fabricação, 2º =
  //    modelo (mesmo quando o OCR quebrou "2012" e "2013" em linhas
  //    separadas — NÃO herdamos fabricação como modelo quando só achamos um).
  const currentYear = new Date().getFullYear()
  const isPlausibleYear = (n: number) => n >= 1950 && n <= currentYear + 2
  const yearsIn = (s: string): number[] =>
    [...s.matchAll(/(?<!\d)(19[5-9]\d|20[0-4]\d)(?!\d)/g)].map((m) => Number(m[1])).filter(isPlausibleYear)

  for (let i = 0; i < lines.length && (v.manufactureYear == null || v.modelYear == null); i++) {
    const hasFab = /ANO\s*FABRICA[ÇC][ÃA]O|ANO\s*FABR/i.test(lines[i])
    const hasMod = /ANO\s*MODELO/i.test(lines[i])
    if (!hasFab && !hasMod) continue
    const pool: number[] = []
    // Mesma linha (após remover os rótulos) e até 2 linhas abaixo
    pool.push(...yearsIn(lines[i].replace(/ANO\s*FABRICA[ÇC][ÃA]O|ANO\s*FABR\w*|ANO\s*MODELO/gi, '')))
    for (let k = 1; k <= 2 && i + k < lines.length; k++) {
      pool.push(...yearsIn(lines[i + k]))
      if (pool.length >= (hasFab && hasMod ? 2 : 1)) break
    }
    if (hasFab && hasMod) {
      if (pool.length >= 1 && v.manufactureYear == null) v.manufactureYear = pool[0]
      if (pool.length >= 2 && v.modelYear == null) v.modelYear = pool[1]
    } else if (hasFab) {
      if (pool.length >= 1 && v.manufactureYear == null) v.manufactureYear = pool[0]
    } else if (pool.length >= 1 && v.modelYear == null) {
      v.modelYear = pool[0]
    }
  }
  // Sanidade: modelo nunca vem antes da fabricação no CRLV; se o OCR inverteu
  // as colunas (diferença pequena), corrige por troca.
  if (v.manufactureYear && v.modelYear && v.modelYear < v.manufactureYear && v.manufactureYear - v.modelYear <= 2) {
    const tmp = v.manufactureYear
    v.manufactureYear = v.modelYear
    v.modelYear = tmp
  }
  // Fallbacks globais (formato "2022/2023" em linha corrida)
  if (!v.manufactureYear || !v.modelYear) {
    const yearPairRe = /(?<!\d)(19[89]\d|20[0-3]\d)\s*[\/\-]\s*(19[89]\d|20[0-3]\d)(?!\d)/g
    for (const m of text.matchAll(yearPairRe)) {
      const f = Number(m[1])
      const yy = Number(m[2])
      if (Math.abs(yy - f) <= 2) {
        if (!v.manufactureYear) v.manufactureYear = f
        if (!v.modelYear) v.modelYear = yy
        break
      }
    }
  }

  // ── 5. Marca / Modelo / Versão — âncora → linha de valor; junk removido
  const extractMmv = (s: string): string | null => {
    if (/^[*\s.]+$/.test(s)) return null           // campo mascarado "***"
    if (s.length < 3) return null
    if (!/[A-Z]/i.test(s)) return null
    return s
  }
  let mmv = findByAnchor(/MARCA\s*\/?\s*MODELO(?:\s*\/?\s*VERS[ÃA]O)?/i, extractMmv)
  if (!mmv) {
    // Rótulos do CRLV que contêm "/" e enganariam o fallback X/Y
    // (CPF/CNPJ, PLACA ANTERIOR/UF, ESPÉCIE/TIPO, ALCOOL/GASOLINA...)
    const LABEL_WORDS = new Set([
      'ANO', 'PESO', 'PBT', 'CMT', 'POT', 'POTENCIA', 'POTÊNCIA', 'CILINDRADA', 'CV',
      'CPF', 'CNPJ', 'PLACA', 'ANTERIOR', 'UF', 'ESPECIE', 'ESPÉCIE', 'TIPO',
      'MARCA', 'MODELO', 'VERSAO', 'VERSÃO', 'NOME', 'LOCAL', 'DATA', 'CAT',
      'ALCOOL', 'ÁLCOOL', 'GASOLINA', 'DIESEL', 'ETANOL', 'GNV', 'COR', 'CHASSI',
      'RENAVAM', 'EXERCICIO', 'EXERCÍCIO', 'CATEGORIA', 'CAPACIDADE', 'MOTOR',
      'CARROCERIA', 'EIXOS', 'LOTACAO', 'LOTAÇÃO', 'COMBUSTIVEL', 'COMBUSTÍVEL',
    ])
    const brandSlashRe = /(?<![A-Z0-9])([A-Z]{1,12})\s*\/\s*([A-Z][A-Z0-9\s\-\.]{2,80}?)(?=\s{2,}|\n|\r|$|[a-z])/g
    for (const m of rawText.matchAll(brandSlashRe)) {
      const brandRaw = m[1].trim()
      const restFirst = (m[2].trim().split(/\s+/)[0] ?? '').toUpperCase()
      if (LABEL_WORDS.has(brandRaw.toUpperCase()) || LABEL_WORDS.has(restFirst)) continue
      mmv = stripJunk(`${brandRaw}/${m[2].trim()}`)
      if (mmv.length < 4) { mmv = null; continue }
      break
    }
  }

  if (mmv) {
    v.brandModelVersionRaw = mmv.trim()
    const slashIdx = mmv.indexOf('/')
    if (slashIdx > 0) {
      let brandRaw = mmv.slice(0, slashIdx).trim()
      let rest = mmv.slice(slashIdx + 1).trim()
      // "I/NISSAN TIIDA 18SL FLEX": o prefixo I = importado, a marca real é o
      // primeiro token após a barra.
      if (/^(I|IMP|IMPORTADO)$/i.test(brandRaw)) {
        const parts = rest.split(/\s+/).filter(Boolean)
        brandRaw = parts[0] ?? brandRaw
        rest = parts.slice(1).join(' ')
      }
      const normBrand = mappings?.brands?.[brandRaw.toUpperCase()] ?? brandRaw
      v.brand = normalizeText(normBrand)

      const parts = rest.split(/\s+/).filter(Boolean)
      if (parts.length > 0) {
        v.model = parts[0]
        if (parts.length > 1) {
          v.version = parts.slice(1).join(' ')
        }
      }
    } else {
      v.model = mmv.trim()
    }
  }

  // ── 6. Cor — âncora COR PREDOMINANTE → valor; fallback varredura global
  const KNOWN_COLORS = ['PRATA', 'BRANCA', 'BRANCO', 'PRETA', 'PRETO', 'CINZA', 'VERMELHA', 'VERMELHO', 'AZUL', 'VERDE', 'AMARELA', 'AMARELO', 'MARROM', 'BEGE', 'DOURADA', 'DOURADO', 'LARANJA', 'ROSA', 'ROXA', 'ROXO', 'VINHO', 'FANTASIA', 'GRENA']
  const extractColor = (s: string): string | null => {
    const u = s.toUpperCase()
    for (const cor of KNOWN_COLORS) {
      if (new RegExp(`\\b${cor}\\b`).test(u)) return cor
    }
    return null
  }
  v.color = findByAnchor(/COR\s*PREDOMINANTE/i, extractColor) ?? undefined
  if (!v.color) {
    for (const cor of KNOWN_COLORS) {
      if (new RegExp(`\\b${cor}\\b`, 'i').test(text)) { v.color = cor; break }
    }
  }

  // ── 7. Combustível (varredura global — valores são inconfundíveis)
  if (/\bALCOOL[\s\/]+GASOLINA\b|\bFLEX\b|\bBI[\s\-]?COMBUST/i.test(text)) v.fuelType = 'FLEX'
  else if (/\bGASOLINA\b/i.test(text)) v.fuelType = 'GASOLINA'
  else if (/\bDIESEL\b/i.test(text)) v.fuelType = 'DIESEL'
  else if (/\bH[ÍI]BRID/i.test(text)) v.fuelType = 'HÍBRIDO'
  else if (/\bEL[ÉE]TRIC/i.test(text)) v.fuelType = 'ELÉTRICO'
  else if (/\bETANOL\b|\bALCOOL\b/i.test(text)) v.fuelType = 'ETANOL'
  else if (/\bGNV\b/i.test(text)) v.fuelType = 'GNV'

  if (v.fuelType && mappings?.fuels?.[v.fuelType]) {
    v.fuelType = mappings.fuels[v.fuelType]
  }

  // ── 8. Potência & Cilindrada ("74CV/999", "104CV/1598")
  const potCilRe = /(?<!\d)(\d{2,4})\s*CV\s*[\/]\s*(\d{3,5})(?!\d)/i
  const pcMatch = potCilRe.exec(text)
  if (pcMatch) {
    v.powerCv = Number(pcMatch[1])
    v.displacementCc = Number(pcMatch[2])
  }

  // ── 9. Espécie / Tipo — âncora → valor gateado por vocabulário oficial do
  //    CRLV (evita capturar texto da coluna direita como "COTA ÚNICA")
  const SPECIES_WORDS = /PASSAGEIRO|CARGA|MISTO|TRA[ÇC][ÃA]O|ESPECIAL|COLE[ÇC][ÃA]O|AUTOM[ÓO]VEL|AUTOMOVEL|MOTOCICLETA|MOTONETA|CAMINHONETE|CAMIONETA|CAMINH[ÃA]O|[ÔO]NIBUS|REBOQUE|SEMI[\s\-]?REBOQUE|CICLOMOTOR|TRICICLO|QUADRICICLO|UTILIT[ÁA]RIO/i
  const extractSpecies = (s: string): string | null => {
    if (!SPECIES_WORDS.test(s)) return null
    const cleaned = s.replace(/[^A-ZÇÃÁÉÍÓÚÂÊÔ\s\/]/gi, '').replace(/\s+/g, ' ').trim()
    if (cleaned.length < 3 || cleaned.length > 40) return null
    return cleaned.toUpperCase()
  }
  v.officialSpeciesType = findByAnchor(/ESP[ÉE]CIE\s*\/?\s*TIPO/i, extractSpecies, 4) ?? undefined
  if (!v.officialSpeciesType) {
    const speciesMatch = match(text, /(?:^|\s)(?:ESPECIE|ESP[ÉE]CIE|TIPO)[\s:.\/\\-]*([A-ZÇÃÁÉÍÓÚÂÊÔ\s]{3,40}?)(?=\s{2,}|\n|\r|$)/i, 1)
    if (speciesMatch && SPECIES_WORDS.test(speciesMatch)) v.officialSpeciesType = speciesMatch.trim()
  }

  // ── 10. Carroceria
  const KNOWN_BODY = ['SEDAN', 'HATCH', 'SUV', 'PICAPE', 'PICKUP', 'CAMINHONETE']
  const extractBody = (s: string): string | null => {
    const clean = s.replace(/\s+/g, '').toUpperCase()
    if (/N[AÃ]OAPLIC[AÁ]VEL/.test(clean)) return 'NÃO APLICÁVEL'
    for (const body of KNOWN_BODY) {
      if (new RegExp(`\\b${body}\\b`, 'i').test(s)) return body
    }
    return null
  }
  v.bodyType = findByAnchor(/CARROCERIA/i, extractBody) ?? undefined
  if (!v.bodyType) {
    for (const body of KNOWN_BODY) {
      if (new RegExp(`\\b${body}\\b`, 'i').test(text)) { v.bodyType = body; break }
    }
  }

  // ── 11. Dados do Proprietário — âncora NOME → valor sem dígitos
  const extractOwner = (s: string): string | null => {
    if (/\d/.test(s)) return null
    // \b em cada termo: rejeita o RÓTULO "LOCAL"/"DATA", não nomes legítimos
    // que contêm a substring ("LOCALIZA RENT A CAR", "PRODATA LTDA").
    if (/\b(SENATRAN|DETRAN|SEGURO|DPVAT|ASSINADO|CPF|CNPJ|LOCAL|DATA)\b/i.test(s)) return null
    const cleaned = s.replace(/[^A-ZÇÃÁÉÍÓÚÂÊÔÜ\s\.\-&]/gi, '').replace(/\s+/g, ' ').trim()
    if (cleaned.length < 4 || cleaned.length > 80) return null
    return cleaned.toUpperCase()
  }
  v.ownerName = findByAnchor(/\bNOME\b/i, extractOwner) ?? undefined
  if (!v.ownerName) {
    const ownerName = match(text, /(?:^|\s)(?:NOME|PROPRIET[ÁA]RIO)[\s:.\/\\-]*([A-ZÇÃÁÉÍÓÚÂÊÔ][A-ZÇÃÁÉÍÓÚÂÊÔ\s]{3,80}?)(?=\s{2,}|\n|\r|CPF|CNPJ|$)/i, 1)
    // Mesmo gate do extractOwner: o fallback também não pode aceitar rótulos
    if (ownerName && extractOwner(ownerName) != null) v.ownerName = ownerName.trim()
  }
  const doc = /(?:CPF|CNPJ)[\s:.\-\/]*([\d][\d.\-\/\s]{9,20})/i.exec(rawText)
  if (doc) {
    const digits = doc[1].replace(/[^\d]/g, '')
    if (digits.length === 11 || digits.length === 14) v.ownerDocument = digits
  }

  return v
}

// ── Consenso & Confiança por Campo ──────────────────────────────────────────

export function buildExtractedField<T>(
  field: string,
  valPdf: T | undefined | null,
  valOcr: T | undefined | null,
  sourceDefault: ExtractionSource,
  rulesConfig?: any
): VehicleExtractedField<T> {
  const rules = rulesConfig?.rules?.[field]
  const minConfidence = rules?.minConfidence ?? 0.8
  const requireReviewGlobal = rules?.requireReview ?? false

  let rawValue: string | null = null
  let normalizedValue: T = null as any
  let source: ExtractionSource = sourceDefault
  let confidence = 1.0
  let validationStatus: ValidationStatus = 'VALID'

  if (valPdf != null && valOcr != null) {
    if (String(valPdf).trim().toUpperCase() === String(valOcr).trim().toUpperCase()) {
      rawValue = String(valPdf)
      normalizedValue = valPdf
      source = 'NATIVE_PDF_TEXT'
      confidence = 1.0
      validationStatus = 'VALID'
    } else {
      // Conflito
      rawValue = String(valPdf) // prefere PDF nativo
      normalizedValue = valPdf
      source = 'NATIVE_PDF_TEXT'
      confidence = 0.6
      validationStatus = 'CONFLICT'
    }
  } else if (valPdf != null) {
    rawValue = String(valPdf)
    normalizedValue = valPdf
    source = 'NATIVE_PDF_TEXT'
    confidence = 0.95
    validationStatus = 'VALID'
  } else if (valOcr != null) {
    rawValue = String(valOcr)
    normalizedValue = valOcr
    source = 'LOCAL_OCR'
    confidence = 0.8
    validationStatus = 'VALID'
  } else {
    validationStatus = 'NOT_FOUND'
    confidence = 0.0
  }

  // Validações de formatos específicos
  if (validationStatus === 'VALID' && normalizedValue) {
    if (field === 'plate' && !validatePlate(String(normalizedValue))) {
      validationStatus = 'INVALID'
      confidence = 0.3
    } else if (field === 'chassis' && !validateChassis(String(normalizedValue))) {
      validationStatus = 'INVALID'
      confidence = 0.3
    } else if (field === 'renavam' && !validateRenavam(String(normalizedValue))) {
      validationStatus = 'INVALID'
      confidence = 0.3
    }
  }

  const requiresReview =
    requireReviewGlobal ||
    validationStatus === 'CONFLICT' ||
    validationStatus === 'INVALID' ||
    confidence < minConfidence

  return {
    field,
    rawValue,
    normalizedValue,
    displayValue: normalizedValue ? String(normalizedValue) : '',
    source,
    provider: source === 'NATIVE_PDF_TEXT' ? 'pdfjs-dist' : 'tesseract.js',
    confidence,
    requiresReview,
    validationStatus,
  }
}

// ── Reconstrução e Leitura de PDF no Servidor ───────────────────────────────

// Erros capturados durante a última extração — expostos pelo route.ts em
// dev/diagnóstico para ver o que quebra no serverless.
export const __lastExtractionErrors: { pdfParseNode?: string; pdfParseRoot?: string; pdfjs?: string } = {}

export async function extractNativePdfData(buffer: Buffer): Promise<{ text: string, tokens: PositionedToken[] }> {
  // reset
  __lastExtractionErrors.pdfParseNode = undefined
  __lastExtractionErrors.pdfParseRoot = undefined
  __lastExtractionErrors.pdfjs = undefined

  // Estratégia dupla:
  // 1) `pdf-parse` (CommonJS, leve, ~sempre funciona no runtime Node do Vercel
  //    Serverless) → extrai TEXTO linear. Sem posicionais, mas o
  //    `parseCrlvText` line-aware (Fase 4) já casa 8/8 campos críticos com
  //    layout de linhas do CRLV-e. Este é o caminho normal em produção.
  // 2) `pdfjs-dist` (mjs) → extrai texto + tokens posicionais para o parser
  //    por coordenadas. Costuma FALHAR em serverless AWS Lambda por causa do
  //    import mjs no runtime — mas tentamos e usamos se der certo (build
  //    local Node ≥18 funciona). Se pdf-parse já achou texto e pdfjs-dist
  //    falhar, seguimos com o texto do pdf-parse (não é regressão).
  let text = ''
  let allTokens: PositionedToken[] = []

  // Passada 1: pdf-parse
  // NOTA: `pdf-parse` v2+ tem exports condicionais (browser/esm/cjs/node) e
  // no Vercel serverless os bundlers às vezes escolhem a variante errada.
  // Forçamos o sub-path `pdf-parse/node` que é EXPLICITAMENTE a build de
  // Node.js — sem ambiguidade.
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - subpath exports não estão no @types/pdf-parse
    const mod: any = await import('pdf-parse/node')
    const PDFParse = mod?.PDFParse ?? mod?.default?.PDFParse ?? mod?.default ?? mod
    if (typeof PDFParse === 'function') {
      const parser = new PDFParse({ data: new Uint8Array(buffer) })
      try {
        const result = await parser.getText()
        text = String(result?.text ?? '').trim()
      } finally {
        try { await parser.destroy?.() } catch { /* silent */ }
      }
    }
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e)
    __lastExtractionErrors.pdfParseNode = msg
    console.warn('[CRLV parser] pdf-parse/node falhou, tentando pdf-parse root:', msg)
    // Fallback para a resolução default caso o subpath quebre
    try {
      const mod: any = await import('pdf-parse')
      const PDFParse = mod?.PDFParse ?? mod?.default?.PDFParse ?? mod?.default ?? mod
      if (typeof PDFParse === 'function') {
        const parser = new PDFParse({ data: new Uint8Array(buffer) })
        try {
          const result = await parser.getText()
          text = String(result?.text ?? '').trim()
        } finally {
          try { await parser.destroy?.() } catch { /* silent */ }
        }
      } else if (mod?.default && typeof mod.default === 'function') {
        const result = await mod.default(buffer)
        text = String(result?.text ?? '').trim()
      }
    } catch (e2) {
      const msg2 = (e2 as Error)?.message ?? String(e2)
      __lastExtractionErrors.pdfParseRoot = msg2
      console.warn('[CRLV parser] pdf-parse (root) também falhou:', msg2)
    }
  }

  // Passada 2: pdfjs-dist para tokens posicionais (best-effort)
  try {
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true,
      verbosity: 0,
      isEvalSupported: false,
    })
    const doc = await loadingTask.promise
    const pieces: string[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      const linear = reconstructVisualText(content.items)
      const tokens = extractPositionedTokens(content.items, i)
      pieces.push(linear)
      allTokens = allTokens.concat(tokens)
    }
    try { await doc.destroy?.() } catch { /* silent */ }
    const pdfjsText = pieces.join('\n').trim()
    // pdfjs preserva melhor a estrutura visual (linhas com Y agrupado); se
    // ele conseguiu texto, prefere sobre o do pdf-parse (que às vezes vem
    // sem quebras de linha úteis).
    if (pdfjsText.length > 0) text = pdfjsText
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e)
    __lastExtractionErrors.pdfjs = msg
    // pdf-parse já pode ter fornecido texto; log e segue.
    console.warn('[CRLV parser] pdfjs-dist falhou (usando texto do pdf-parse):', msg)
  }

  return { text, tokens: allTokens }
}

/** 
 * Mantido por compatibilidade com `route.ts`, mas descontinuado 
 * em favor de `extractNativePdfData`.
 */
export async function extractNativePdfText(buffer: Buffer): Promise<string> {
  const { text } = await extractNativePdfData(buffer)
  return text
}
