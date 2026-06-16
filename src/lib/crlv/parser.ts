// =============================================================================
// src/lib/crlv/parser.ts
//
// Extrator de dados do CRLV/CRLV-e a partir de PDF (texto). Para imagens, hoje
// retornamos uma resposta clara informando que OCR ainda não está habilitado —
// o operador deve enviar o PDF do CRLV ou preencher manualmente.
//
// O CRLV brasileiro segue um layout padronizado por Estado, mas com variações
// pequenas (rótulos com/sem acento, espaçamento, quebras de linha). Os regexes
// abaixo são tolerantes a essas variações; o que não casa entra em
// `missingFields` e o frontend solicita preenchimento manual ou via API Placas.
// =============================================================================

// Import lazy/dinâmico — pdf-parse 2.x usa pdfjs-dist com workers e DOM
// polyfills; carregar via require() em runtime evita que o Webpack tente
// bundlear (junto com `serverComponentsExternalPackages` no next.config.js).
// Mantemos a tipagem só para o TS — em runtime usamos a fábrica lazyLoadPdf().

export type ExtractionConfidence = 'high' | 'medium' | 'low'

export interface ExtractedVehicle {
  renavam?:           string
  plate?:             string
  exerciseYear?:      number
  manufactureYear?:   number
  modelYear?:         number
  crvNumber?:         string
  securityCode?:      string
  category?:          string
  capacity?:          string
  powerCylinders?:    string  // "128CV/999"
  power?:             string  // "128 CV"
  displacement?:      string  // "999"
  grossWeight?:       string
  motorNumber?:       string
  cmt?:               string
  axles?:             string
  capacityPassengers?:string
  bodyType?:          string
  ownerName?:         string
  ownerDocument?:     string
  city?:              string
  state?:             string
  date?:              string
  brand?:             string
  model?:             string
  version?:           string
  speciesType?:       string
  previousPlate?:     string
  chassis?:           string
  predominantColor?:  string
  fuel?:              string
  observations?:      string
  vehicleType?:       'CARRO' | 'MOTO' | 'CAMINHAO'
}

export interface ExtractionResult {
  success:        boolean
  extracted:      boolean
  confidence:     ExtractionConfidence
  source:         'pdf-text' | 'ocr' | 'manual'
  vehicle:        ExtractedVehicle
  missingFields:  string[]
  warnings:       string[]
  message?:       string
  rawText?:       string  // útil para debug; o frontend ignora
}

// ── Mapeamento de marca abreviada (CRLV usa siglas) ────────────────────────
const BRAND_ALIAS: Record<string, string> = {
  VW:        'Volkswagen',
  VOLKS:     'Volkswagen',
  CHEV:      'Chevrolet',
  GM:        'Chevrolet',
  GMC:       'Chevrolet',
  FIAT:      'Fiat',
  FORD:      'Ford',
  RENAULT:   'Renault',
  HYUND:     'Hyundai',
  HYUNDAI:   'Hyundai',
  TOYOTA:    'Toyota',
  HONDA:     'Honda',
  NISSAN:    'Nissan',
  PEUGEOT:   'Peugeot',
  CITROEN:   'Citroën',
  MBENZ:     'Mercedes-Benz',
  MERCEDES:  'Mercedes-Benz',
  'M BENZ':  'Mercedes-Benz',
  'M.BENZ':  'Mercedes-Benz',
  BMW:       'BMW',
  AUDI:      'Audi',
  CHERY:     'Chery',
  CAOACHERY: 'Chery',
  CAOA:      'Chery',
  JEEP:      'Jeep',
  MITSUB:    'Mitsubishi',
  MITSUBISHI:'Mitsubishi',
  KIA:       'Kia',
  YAMAHA:    'Yamaha',
  SUZUKI:    'Suzuki',
  KAWASAKI:  'Kawasaki',
  BYD:       'BYD',
  GWM:       'GWM',
  CITROËN:   'Citroën',
}

function mapBrand(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const up = raw.trim().toUpperCase()
  return BRAND_ALIAS[up] ?? raw.trim()
}

function inferVehicleType(species?: string): ExtractedVehicle['vehicleType'] | undefined {
  if (!species) return undefined
  const s = species.toUpperCase()
  if (s.includes('MOTOCICLETA') || s.includes('CICLOMOTOR') || s.includes('MOTONETA')) return 'MOTO'
  if (s.includes('CARGA') || s.includes('CAMINHAO') || s.includes('CAMINHÃO') || s.includes('TRATOR')) return 'CAMINHAO'
  if (s.includes('PASSAGEIRO') || s.includes('AUTOMOVEL') || s.includes('AUTOMÓVEL') || s.includes('UTILITARIO') || s.includes('UTILITÁRIO') || s.includes('MISTO')) return 'CARRO'
  return undefined
}

// Helper: aplica regex e devolve o primeiro grupo capturado (trim) ou undefined.
function match(text: string, re: RegExp, group = 1): string | undefined {
  const m = re.exec(text)
  if (!m || !m[group]) return undefined
  return m[group].trim()
}

function normalizePlate(p?: string): string | undefined {
  if (!p) return undefined
  const cleaned = p.replace(/[^A-Z0-9]/gi, '').toUpperCase()
  if (cleaned.length < 7) return undefined
  return cleaned.slice(0, 7)
}

function parseRegexes(rawText: string): ExtractedVehicle {
  const v: ExtractedVehicle = {}

  // ── PRÉ-NORMALIZAÇÃO ────────────────────────────────────────────────────
  // pdfjs-dist às vezes concatena items sem espaço ("PLACAFOZ6J03ANO MOD").
  // Inserimos espaços nas fronteiras letra→dígito, dígito→letra e
  // minúscula→maiúscula pra que os regexes com \b realmente funcionem.
  const text = rawText
    .replace(/([A-Z])(\d)/g, '$1 $2')      // PLACAFOZ → PLAC AFOZ (sub-ótimo mas ajuda)
    .replace(/(\d)([A-Z])/g, '$1 $2')      // 6J03ANO → 6J03 ANO
    .replace(/([a-z])([A-Z])/g, '$1 $2')   // camelCase → camel Case
    .replace(/\s+/g, ' ')                  // colapsa whitespace

  // ── ESTRATÉGIA DUPLA ──────────────────────────────────────────────────────
  // O CRLV-e em PDF tem layout posicional: o pdfjs-dist extrai os "items" na
  // ordem do PDF interno, NÃO na ordem visual. Por isso a label "PLACA" pode
  // ficar muito distante do valor real. Usamos PADRÕES ESTRUTURAIS ÚNICOS
  // (pattern-based) para placa/chassi/renavam/anos — depois caímos no
  // label-anchored como fallback.

  // ── PLACA: padrão Mercosul (AAA0A00) ou antigo (AAA0000). Único no doc.
  // No CRLV-e digital do Senatran a placa às vezes vem MASCARADA (*******/**)
  // por LGPD, ou com espaços entre os caracteres (ex: "SYU 7 F 48").
  // Estratégia: 1) tenta consecutivo; 2) tenta com até 2 espaços entre chars;
  // 3) tenta label-anchored.
  const plateRe = /(?<![A-Z0-9])([A-Z]{3})[\s\-]?([0-9])([A-Z0-9])([0-9]{2})(?![A-Z0-9])/g
  for (const m of text.matchAll(plateRe)) {
    const candidate = `${m[1]}${m[2]}${m[3]}${m[4]}`
    if (candidate.length === 7) { v.plate = candidate; break }
  }
  // Fallback: padrão com espaços entre cada char ("SYU 7 F 48")
  if (!v.plate) {
    const spaced = /(?<![A-Z0-9])([A-Z])\s*([A-Z])\s*([A-Z])\s+(\d)\s+([A-Z0-9])\s+(\d)\s*(\d)(?![A-Z0-9])/g
    for (const m of text.matchAll(spaced)) {
      const candidate = `${m[1]}${m[2]}${m[3]}${m[4]}${m[5]}${m[6]}${m[7]}`
      if (/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(candidate)) { v.plate = candidate; break }
    }
  }

  // ── RENAVAM: 9-11 dígitos consecutivos. Filtramos números que parecem CPF
  // (11 dígitos começando com padrão de doc) ou datas. Renavam costuma vir
  // após "RENAVAM" se label-anchor funcionar; senão pegamos o primeiro
  // candidato de 11 dígitos puros que não bate com chassi.
  v.renavam = match(text, /RENAVAM[\s:.\-]*(\d{9,11})/i)
  if (!v.renavam) {
    // fallback: procura "11 dígitos seguidos" — Renavam tem exatamente 11
    // Lookbehind/lookahead negativos pra evitar capturar pedaço de número maior.
    const renRe = /(?<!\d)(\d{11})(?!\d)/g
    for (const m of text.matchAll(renRe)) {
      const candidate = m[1]
      // Renavam não começa com 0 e não tem 11 caracteres iguais
      if (candidate[0] !== '0' && !/^(\d)\1{10}$/.test(candidate)) {
        v.renavam = candidate
        break
      }
    }
  }

  // ── CHASSI: 17 chars VIN-pattern (sem I/O/Q). Único no documento.
  v.chassis = match(text, /CHASSI[\s:.\-]*([A-HJ-NPR-Z0-9]{17})/i)?.toUpperCase()
  if (!v.chassis) {
    const chassiRe = /(?<![A-Z0-9])([A-HJ-NPR-Z0-9]{17})(?![A-Z0-9])/g
    for (const m of text.matchAll(chassiRe)) {
      const c = m[1].toUpperCase()
      // Filtro: chassi não pode ser tudo número nem tudo letra
      if (/[A-Z]/.test(c) && /[0-9]/.test(c)) {
        v.chassis = c
        break
      }
    }
  }

  // ── ANO FAB/MODELO: padrão único "YYYY/YYYY" com anos válidos (1990-2030)
  // Procura em todo o texto, não depende de label. Filtra anos absurdos.
  const yearPairRe = /(?<!\d)(19[89]\d|20[0-3]\d)\s*[\/\-]\s*(19[89]\d|20[0-3]\d)(?!\d)/g
  for (const m of text.matchAll(yearPairRe)) {
    const f = Number(m[1])
    const yy = Number(m[2])
    if (Number.isFinite(f) && Number.isFinite(yy) && Math.abs(yy - f) <= 2) {
      v.manufactureYear = f
      v.modelYear       = yy
      break
    }
  }
  // Fallback label-anchored
  if (!v.modelYear) {
    const ym = match(text, /ANO\s*MODELO[\s:.\-]*(\d{4})/i)
    if (ym) v.modelYear = Number(ym)
  }
  if (!v.manufactureYear) {
    const yf = match(text, /ANO\s*FABR[A-Z]*[\s:.\-]*(\d{4})/i)
    if (yf) v.manufactureYear = Number(yf)
  }

  // Exercício
  const ex = match(text, /EXERC[ÍI]CIO[\s:.\-]*(\d{4})/i)
  if (ex) {
    const n = Number(ex)
    if (Number.isFinite(n)) v.exerciseYear = n
  }

  // ── MARCA/MODELO/VERSÃO — estratégia em camadas:
  // 1) Label-anchored: "MARCA/MODELO/VERSÃO: <valor>"
  // 2) Padrão único: linha que parece "MARCA/MODELO_TEXT" (sigla 2-10 letras
  //    + barra + texto em maiúsculas). Exemplos reais:
  //    - "HONDA/FIT LX FLEX"
  //    - "VW/T CROSS SENSE TSI AD"
  //    - "CAOACHERY/TIGGO7 SPORT"
  //    - "CHEV/ONIX LT 1.0"
  // 3) Procura por marca conhecida (BRAND_ALIAS) no texto
  // Palavras-chave que indicam fim do modelo/versão (próximas seções do CRLV)
  const STOP_AFTER_MODEL_RE = /\s+(PASSAGEIRO|MOTOCICLETA|CICLOMOTOR|MOTONETA|CARGA|MISTO|UTILITARIO|CONVERSIVEL|CAMINH[AÃ]O|TRATOR|REBOQUE|SEMI[\-\s]?REBOQUE|ESPECIE|ESP[ÉE]CIE|CATEGORIA|CARROCERIA|PARTICULAR|ALUGUEL|OFICIAL|TAXI|EXERC[ÍI]CIO|COR|CINZA|PRATA|BRANCA|BRANCO|PRETA|PRETO|VERMELHA|VERMELHO|AZUL|VERDE|AMARELA|AMARELO|MARROM|BEGE|DOURADA|DOURADO|ALCOOL|GASOLINA|DIESEL|FLEX|ELETRIC|HIBRID|GNV|CV[\/])/i

  let mmv = match(text, /MARCA[\s\/]?MODELO[\s\/]?VERS[ÃA]O[\s:.\-]*([^\n\r]+)/i)
  if (!mmv) {
    // Estratégia 2: procura padrão SIGLA/TEXTO em qualquer lugar
    const brandSlashRe = /(?<![A-Z0-9])([A-Z]{2,12})\s*\/\s*([A-Z][A-Z0-9\s\-\.]{2,80}?)(?=\s{2,}|\n|\r|$|[a-z])/g
    for (const m of text.matchAll(brandSlashRe)) {
      const brandRaw = m[1].trim()
      let   rest     = m[2].trim()
      const ignore = ['ANO', 'PESO', 'PBT', 'CMT', 'POT', 'POTENCIA', 'POTÊNCIA',
                      'CILINDRADA', 'EIXOS', 'LOTACAO', 'COR', 'PLACA', 'CHASSI',
                      'MODELO', 'VERSAO', 'VERSÃO', 'TIPO', 'ESPECIE', 'ESPÉCIE',
                      'CATEGORIA', 'CARROCERIA', 'FABRICAÇÃO', 'FABRICACAO',
                      'NOME', 'CPF', 'CNPJ', 'LOCAL', 'DATA', 'UF', 'EXERCICIO',
                      'EXERCÍCIO', 'RENAVAM', 'CRV', 'CRLV', 'SENATRAN', 'DETRAN']
      if (ignore.includes(brandRaw)) continue
      if (rest.length < 3) continue
      // Corta tudo a partir de palavras de fim (ESPÉCIE, CATEGORIA, COR, etc).
      const stop = STOP_AFTER_MODEL_RE.exec(rest)
      if (stop && stop.index > 0) rest = rest.slice(0, stop.index).trim()
      // Se sobrou texto razoável, aceita
      if (rest.length < 2) continue
      mmv = `${brandRaw}/${rest}`
      break
    }
  }

  if (mmv) {
    const slashIdx = mmv.indexOf('/')
    if (slashIdx > 0) {
      const brandRaw = mmv.slice(0, slashIdx).trim()
      const rest     = mmv.slice(slashIdx + 1).trim()
      v.brand = mapBrand(brandRaw)
      const parts = rest.split(/\s+/).filter(Boolean)
      if (parts.length === 1) {
        v.model = parts[0]
      } else if (parts.length === 2) {
        v.model   = parts[0]
        v.version = parts[1]
      } else {
        v.model   = parts.slice(0, 2).join(' ')
        v.version = parts.slice(2).join(' ')
      }
    } else {
      v.model = mmv
    }
  }

  // Estratégia 3 — se ainda sem marca, procura por marca conhecida no texto
  if (!v.brand) {
    for (const alias of Object.keys(BRAND_ALIAS)) {
      // Padrão word-bound case-insensitive
      const re = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
      if (re.test(text)) {
        v.brand = BRAND_ALIAS[alias]
        break
      }
    }
  }

  // ── CATEGORIA — só aceita valores conhecidos pra evitar lixo
  v.category = match(text, /\b(PARTICULAR|ALUGUEL|OFICIAL|APRENDIZAGEM|DIPLOM[ÁA]TIC[OA])\b/i)

  // ── COR — match contra lista fechada de cores reais (evita pegar label "ESPÉCIE")
  const KNOWN_COLORS = ['PRATA', 'BRANCA', 'BRANCO', 'PRETA', 'PRETO', 'CINZA',
    'VERMELHA', 'VERMELHO', 'AZUL', 'VERDE', 'AMARELA', 'AMARELO', 'MARROM',
    'BEGE', 'DOURADA', 'DOURADO', 'LARANJA', 'ROSA', 'ROXA', 'ROXO', 'VINHO',
    'GRAFITE', 'BORDO', 'CHUMBO', 'CHAMPAGNE']
  for (const cor of KNOWN_COLORS) {
    if (new RegExp(`\\b${cor}\\b`, 'i').test(text)) { v.predominantColor = cor; break }
  }

  // ── COMBUSTÍVEL — só padrões conhecidos
  if (/\bALCOOL[\s\/]+GASOLINA\b|\bFLEX\b|\bBI[\s\-]?COMBUST/i.test(text)) v.fuel = 'FLEX'
  else if (/\bGASOLINA\b/i.test(text))                                       v.fuel = 'GASOLINA'
  else if (/\bDIESEL\b/i.test(text))                                         v.fuel = 'DIESEL'
  else if (/\bH[ÍI]BRID/i.test(text))                                        v.fuel = 'HÍBRIDO'
  else if (/\bEL[ÉE]TRIC/i.test(text))                                       v.fuel = 'ELÉTRICO'
  else if (/\bETANOL\b|\bALCOOL\b/i.test(text))                              v.fuel = 'ETANOL'
  else if (/\bGNV\b/i.test(text))                                            v.fuel = 'GNV'

  // ── POTÊNCIA/CILINDRADA: pattern "113 CV/1598" ou "128CV/999"
  // Procura PADRÃO ESTRUTURAL (3 dígitos CV / 3-4 dígitos), sem label.
  const potCilRe = /(?<!\d)(\d{2,4})\s*CV\s*[\/]\s*(\d{3,5})(?!\d)/i
  const pcMatch  = potCilRe.exec(text)
  if (pcMatch) {
    v.power           = `${pcMatch[1]} CV`
    v.displacement    = pcMatch[2]
    v.powerCylinders  = `${pcMatch[1]}CV/${pcMatch[2]}`
  }

  // ── ESPÉCIE/TIPO — padrões conhecidos
  if (/\bPASSAGEIRO\b/i.test(text)) {
    v.speciesType = 'PASSAGEIRO AUTOMOVEL'
    v.vehicleType = 'CARRO'
  } else if (/\bMOTOCICLETA\b|\bCICLOMOTOR\b|\bMOTONETA\b/i.test(text)) {
    v.speciesType = 'MOTOCICLETA'
    v.vehicleType = 'MOTO'
  } else if (/\bCARGA\b|\bCAMINH[ÃA]O\b/i.test(text)) {
    v.speciesType = 'CARGA'
    v.vehicleType = 'CAMINHAO'
  } else if (/\bMISTO\b|\bUTILITARIO\b/i.test(text)) {
    v.speciesType = 'MISTO UTILITARIO'
    v.vehicleType = 'CARRO'
  }

  // ── CARROCERIA — só aceita valores válidos (curtos)
  const KNOWN_BODY = ['SEDAN', 'HATCH', 'SUV', 'PICAPE', 'PICKUP', 'CAMINHONETE',
    'UTILITARIO', 'CONVERSIVEL', 'COUPE', 'COUPÉ', 'VAN', 'MINIVAN', 'WAGON',
    'PERUA', 'BUGGY', 'CROSSOVER', 'CABINE\\s*SIMPLES', 'CABINE\\s*DUPLA']
  for (const body of KNOWN_BODY) {
    if (new RegExp(`\\b${body}\\b`, 'i').test(text)) {
      v.bodyType = body.replace(/\\s\*/g, ' ').toUpperCase()
      break
    }
  }

  // Outros campos label-anchored, com filtro de tamanho razoável (evita lixo)
  const ownerName = match(text, /(?:^|\s)(NOME|PROPRIET[ÁA]RIO)[\s:.\-]+([A-ZÇÃÁÉÍÓÚÂÊÔ][A-ZÇÃÁÉÍÓÚÂÊÔ\s]{3,80}?)(?=\s{2,}|\n|\r|CPF|CNPJ|$)/i)
  if (ownerName && ownerName.length <= 80 && !ownerName.includes('SENATRAN')) {
    v.ownerName = ownerName
  }
  const doc = /(?:CPF|CNPJ)[\s:.\-]*([\d.\-\/]+)/i.exec(text)
  if (doc) v.ownerDocument = doc[1].replace(/[^\d]/g, '')

  const cityMatch = match(text, /(?:^|\s)(LOCAL|MUNIC[ÍI]PIO)[\s:.\-]+([A-ZÇÃÁÉÍÓÚÂÊÔ][A-ZÇÃÁÉÍÓÚÂÊÔ\s]{2,40}?)(?=\s{2,}|\n|\r|UF|MG|SP|RJ|$)/i)
  if (cityMatch && cityMatch.length <= 40) v.city = cityMatch
  v.state = match(text, /\bUF[\s:.\-]*([A-Z]{2})\b/i)
  v.date  = match(text, /(\d{2}[\/.\-]\d{2}[\/.\-]\d{4})/i)
  v.crvNumber    = match(text, /CRV[\s:.\-]*N[º°]?[\s:.\-]*(\d+)/i)
  v.securityCode = match(text, /C[ÓO]DIGO\s*DE\s*SEGURAN[ÇC]A[\s:.\-]*(\d+)/i)

  // CAPACIDADE/EIXOS/LOTAÇÃO/CMT — só aceita números curtos
  const lot = match(text, /LOTA[ÇC][ÃA]O[\s:.\-]*(\d{1,3})(?!\d)/i)
  if (lot) v.capacityPassengers = lot
  const eix = match(text, /EIXOS[\s:.\-]*(\d{1,2})(?!\d)/i)
  if (eix) v.axles = eix
  const motorRaw = match(text, /(?:N[ÚU]MERO\s*DE\s*MOTOR|N[ºO°]\s*MOTOR)[\s:.\-]+([A-Z0-9]{4,20})(?![A-Z0-9])/i)
  if (motorRaw && motorRaw !== 'CARROCERIA' && motorRaw !== 'CILINDRADA') {
    v.motorNumber = motorRaw
  }

  // Limpar strings vazias
  for (const k of Object.keys(v) as Array<keyof ExtractedVehicle>) {
    const val = v[k]
    if (typeof val === 'string' && val.trim() === '') {
      delete v[k]
    }
  }

  return v
}

function computeConfidence(v: ExtractedVehicle): { confidence: ExtractionConfidence; missing: string[] } {
  const critical = ['plate', 'chassis', 'renavam', 'brand', 'model', 'modelYear'] as const
  const missing  = critical.filter((k) => !v[k]).map(String)
  if (missing.length === 0)                       return { confidence: 'high',   missing }
  if (v.plate && v.chassis && v.modelYear)        return { confidence: 'medium', missing }
  return { confidence: 'low', missing }
}

/**
 * Lê o texto de um PDF tentando três estratégias em ordem decrescente de
 * confiabilidade — escolhe a que primeiro produzir texto não-vazio:
 *
 *  1) pdfjs-dist (legacy build, Node.js) — mais robusta, suporta PDF/A do
 *     Senatran (CRLV-e). Carrega cada página e concatena textContent items.
 *  2) pdf-parse 2.x — `new PDFParse({data}).getText()` (wrapper sobre pdfjs)
 *  3) pdf-parse 1.x — default callable `pdfParse(buffer).then(d => d.text)`
 *
 * Todas via `require()` em runtime pra respeitar serverComponentsExternalPackages.
 */
async function readPdfText(buffer: Buffer): Promise<string> {
  const attempts: { name: string; text: string; error?: string }[] = []

  // ── Estratégia 1: pdfjs-dist direto (legacy build) ──────────────────────
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const loadingTask = pdfjs.getDocument({
      data:                  new Uint8Array(buffer),
      useSystemFonts:        true,
      disableFontFace:       true,
      verbosity:             0,  // suprime logs internos do pdfjs
      isEvalSupported:       false,
    })
    const doc = await loadingTask.promise
    const pieces: string[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page    = await doc.getPage(i)
      const content = await page.getTextContent()
      const line = (content.items as { str?: string }[])
        .map((it) => (typeof it.str === 'string' ? it.str : ''))
        .join(' ')
      pieces.push(line)
    }
    try { await doc.destroy?.() } catch { /* silent */ }
    const text = pieces.join('\n').trim()
    attempts.push({ name: 'pdfjs-dist (legacy)', text, error: text ? undefined : 'texto vazio' })
    if (text.length >= 5) return text
  } catch (e) {
    attempts.push({ name: 'pdfjs-dist (legacy)', text: '', error: (e as Error)?.message ?? String(e) })
    console.warn('[CRLV parser] pdfjs-dist falhou:', (e as Error)?.message)
  }

  // ── Estratégia 2: pdf-parse 2.x (PDFParse) ─────────────────────────────
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const mod: any = require('pdf-parse')
    const PDFParse = mod?.PDFParse ?? mod?.default?.PDFParse
    if (PDFParse) {
      const parser = new PDFParse({ data: new Uint8Array(buffer) })
      const result = await parser.getText()
      const text   = String(result?.text ?? '').trim()
      try { await parser.destroy?.() } catch { /* silent */ }
      attempts.push({ name: 'pdf-parse v2', text, error: text ? undefined : 'texto vazio' })
      if (text.length >= 5) return text
    } else {
      attempts.push({ name: 'pdf-parse v2', text: '', error: 'PDFParse export não encontrado' })
    }
  } catch (e) {
    attempts.push({ name: 'pdf-parse v2', text: '', error: (e as Error)?.message ?? String(e) })
    console.warn('[CRLV parser] pdf-parse v2 falhou:', (e as Error)?.message)
  }

  // ── Estratégia 3: pdf-parse 1.x (default callable) ─────────────────────
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const mod: any = require('pdf-parse')
    const fn =
      typeof mod === 'function' ? mod :
      typeof mod?.default === 'function' ? mod.default : null
    if (fn) {
      const result = await fn(buffer)
      const text   = String(result?.text ?? '').trim()
      attempts.push({ name: 'pdf-parse v1', text, error: text ? undefined : 'texto vazio' })
      if (text.length >= 5) return text
    } else {
      attempts.push({ name: 'pdf-parse v1', text: '', error: 'default callable não encontrado' })
    }
  } catch (e) {
    attempts.push({ name: 'pdf-parse v1', text: '', error: (e as Error)?.message ?? String(e) })
    console.warn('[CRLV parser] pdf-parse v1 falhou:', (e as Error)?.message)
  }

  // Nada deu certo — agrega um diagnóstico no log e devolve string vazia.
  console.error('[CRLV parser] todas as estratégias falharam:', attempts)
  return ''
}

export async function extractFromCRLV(
  buffer: Buffer,
  mimeType: string,
): Promise<ExtractionResult> {
  // ── 1) IA de visão (Gemini), se configurada (GEMINI_API_KEY) ──────────────
  // Cobre PDF E imagem (foto do CRLV) de forma robusta em serverless. Só é
  // usada quando a chave existe; senão cai no parser por regex abaixo.
  try {
    const { extractWithAI } = await import('./ai-extract')
    const ai = await extractWithAI(buffer, mimeType)
    if (ai && ai.extracted) return ai
  } catch (e) {
    console.warn('[CRLV parser] IA indisponível/falhou, usando fallback:', (e as Error)?.message)
  }

  // ── 2) Imagem sem IA configurada — resposta clara para o frontend ─────────
  if (mimeType !== 'application/pdf') {
    return {
      success:       true,
      extracted:     false,
      confidence:    'low',
      source:        'ocr',
      vehicle:       {},
      missingFields: [],
      warnings:      ['Leitura de imagem requer IA (GEMINI_API_KEY) — não configurada.'],
      message:       'Leitura automática de imagens requer a chave de IA (GEMINI_API_KEY). Envie o PDF do CRLV, use a consulta por placa, ou preencha manualmente.',
    }
  }

  let text = ''
  try {
    text = await readPdfText(buffer)
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e) ?? 'erro desconhecido'
    // Log no servidor com stack pra diagnóstico
    console.error('[CRLV parser] Falha ao ler PDF:', msg, (e as Error)?.stack)
    return {
      success:       false,
      extracted:     false,
      confidence:    'low',
      source:        'pdf-text',
      vehicle:       {},
      missingFields: [],
      warnings:      [`Falha ao ler PDF: ${msg}`],
      message:       `Não foi possível ler o PDF: ${msg}`,
    }
  }

  if (!text || text.trim().length < 5) {
    return {
      success:       true,
      extracted:     false,
      confidence:    'low',
      source:        'pdf-text',
      vehicle:       {},
      missingFields: [],
      warnings:      ['PDF sem texto extraível (provavelmente escaneado).'],
      message:       'O PDF parece ser uma imagem digitalizada (sem camada de texto). Para CRLV-e: baixe o PDF original do app/site do Detran ou Senatran. Para CRLV físico antigo: tire foto e a leitura por imagem ainda não é suportada — use a consulta por placa abaixo.',
      rawText:       text,
    }
  }

  const vehicle = parseRegexes(text)
  const { confidence, missing } = computeConfidence(vehicle)
  const extracted = Object.keys(vehicle).length > 0

  // Log do dev pra ajustar regexes contra documentos reais
  if (process.env.NODE_ENV !== 'production') {
    console.log('[CRLV parser] Texto extraído (primeiros 800 chars):')
    console.log(text.slice(0, 800))
    console.log('[CRLV parser] Veículo detectado:', vehicle)
    console.log('[CRLV parser] Confiança:', confidence, '— Faltando:', missing)
  }

  return {
    success:       true,
    extracted,
    confidence,
    source:        'pdf-text',
    vehicle,
    missingFields: missing,
    warnings:      missing.length ? [`Campos críticos não localizados: ${missing.join(', ')}`] : [],
    message:       extracted
      ? (confidence === 'high'
        ? 'Documento lido com sucesso.'
        : 'Documento lido parcialmente — revise os campos.')
      : 'Não conseguimos extrair dados do documento. Use a consulta por placa ou preencha manualmente.',
    // rawText só em dev pra facilitar diagnóstico de regexes que falharam
    rawText: process.env.NODE_ENV !== 'production' ? text : undefined,
  }
}
