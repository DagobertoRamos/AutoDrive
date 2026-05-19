// =============================================================================
// contract-pdf-parser.service.ts — Parser de contratos Autoconf em PDF
//
// Extrai código do contrato, dados da parte cliente e veículos
// a partir do texto bruto extraído pelo pdf-parse.
//
// Tipos de contrato suportados:
//   COMPRA_VENDA    — dealer vende para pessoa física/jurídica
//   COMPRA_DEALER   — dealer compra de pessoa física/jurídica
//   CONSIGNACAO     — consignante entrega veículo para revenda
//   TROCA           — troca de veículos entre as partes
//   FINANCIAMENTO   — compra financiada (banco intervém)
// =============================================================================

import { parseCurrency } from '@/lib/parsers/currency'

// ── Tipos exportados ──────────────────────────────────────────────────────────

export type ContractType =
  | 'COMPRA_VENDA'
  | 'COMPRA_DEALER'
  | 'CONSIGNACAO'
  | 'TROCA'
  | 'FINANCIAMENTO'
  | 'DESCONHECIDO'

export interface ContractParty {
  /** Nome completo da parte */
  name:       string | null
  /** CPF ou CNPJ */
  cpf:        string | null
  /** RG */
  rg:         string | null
  /** Endereço (logradouro) */
  address:    string | null
  /** CEP */
  cep:        string | null
  /** Bairro */
  bairro:     string | null
  /** Cidade */
  city:       string | null
  /** UF */
  state:      string | null
  /** Telefone / celular */
  phone:      string | null
  /** E-mail */
  email:      string | null
  /** Data de nascimento */
  birthDate:  string | null
}

export interface ContractVehicle {
  /** Papel do veículo no contrato */
  role:       'VENDIDO' | 'COMPRADO' | 'TROCADO_SAIDA' | 'TROCADO_ENTRADA' | 'CONSIGNADO'
  marca:      string | null
  modelo:     string | null
  /** Ano de fabricação */
  anoFab:     number | null
  /** Ano do modelo */
  anoMod:     number | null
  cor:        string | null
  chassi:     string | null
  placa:      string | null
  renavam:    string | null
  /** Valor negociado (número, nunca NaN) */
  valor:      number | null
  combustivel: string | null
}

export interface ParsedContract {
  /** Código/número do contrato extraído do cabeçalho */
  contractCode:  string | null
  /** Tipo detectado */
  type:          ContractType
  /** Data do contrato (texto livre conforme o PDF) */
  contractDate:  string | null
  /** Parte compradora / cliente principal */
  buyer:         ContractParty | null
  /** Parte vendedora (pode ser o dealer ou pessoa física) */
  seller:        ContractParty | null
  /** Veículos envolvidos */
  vehicles:      ContractVehicle[]
  /** Valor total do contrato */
  totalValue:    number | null
  /** Texto bruto extraído — útil para debug */
  rawText:       string
}

// ── Utilitários internos ──────────────────────────────────────────────────────

/**
 * Remove múltiplas quebras de linha e espaços extras.
 * Mantém uma quebra entre blocos para facilitar regex multi-linha.
 */
function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Extrai o primeiro match de um grupo capturado — retorna null se não encontrar. */
function capture(text: string, regex: RegExp): string | null {
  const m = regex.exec(text)
  return m?.[1]?.trim() ?? null
}

/** Limpa e normaliza CPF/CNPJ — remove pontuação. */
function cleanDocument(value: string | null): string | null {
  if (!value) return null
  return value.replace(/[.\-/]/g, '').trim() || null
}

/** Normaliza telefone — mantém apenas dígitos. */
function cleanPhone(value: string | null): string | null {
  if (!value) return null
  return value.replace(/\D/g, '').trim() || null
}

// ── Detecção de tipo de contrato ──────────────────────────────────────────────

function detectContractType(text: string): ContractType {
  const upper = text.toUpperCase()

  if (/CONTRATO\s+DE\s+CONSIGNA[CÇ][AÃ]O/i.test(text))          return 'CONSIGNACAO'
  if (/CONTRATO\s+DE\s+PERMUTA|CONTRATO\s+DE\s+TROCA/i.test(text)) return 'TROCA'
  if (/CONTRATO\s+DE\s+FINANCIAMENTO|CONTRATO\s+DE\s+ALIENA[CÇ][AÃ]O\s+FIDUCI/i.test(text)) return 'FINANCIAMENTO'

  // Compra e venda: detectar quem é o vendedor
  if (/CONTRATO\s+(?:PARTICULAR\s+)?DE\s+COMPRA\s+E\s+VENDA/i.test(text)) {
    // Se o "VENDEDOR" parece ser uma empresa (dealer), é COMPRA_VENDA (dealer vende)
    // Se o "COMPRADOR" parece ser o dealer, é COMPRA_DEALER (dealer compra)
    if (/VENDEDOR[:\s]+.{0,60}CNPJ/i.test(upper)) return 'COMPRA_VENDA'
    if (/COMPRADOR[:\s]+.{0,60}CNPJ/i.test(upper)) return 'COMPRA_DEALER'
    return 'COMPRA_VENDA'  // padrão
  }

  return 'DESCONHECIDO'
}

// ── Extração de partes (comprador/vendedor/consignante) ───────────────────────

/**
 * Extrai dados de uma parte identificada por um rótulo como COMPRADOR, VENDEDOR, etc.
 * Busca o bloco de texto após o rótulo e aplica regex específicos.
 *
 * Formato Autoconf:
 *   COMPRADOR: NOME COMPLETO, brasileiro(a), nascido em DD/MM/AAAA,
 *   residente e domiciliado a RUA TAL, CEP 00000-000, bairro BAIRRO
 *   na cidade de CIDADE-UF, portador do CPF 000.000.000-00 e do RG 0000000,
 *   tel/cel: (00) 00000-0000, e-mail: email@email.com.
 */
function extractParty(text: string, labels: string[]): ContractParty | null {
  // Monta regex que captura o bloco após qualquer um dos rótulos
  const labelPattern = labels.map(l => l.replace(/\s+/g, '\\s+')).join('|')
  const blockRegex = new RegExp(
    `(?:${labelPattern}):\\s*([\\s\\S]*?)(?=\\n\\n|\\n(?:COMPRADOR|VENDEDOR|CONSIGNANTE|CONSIGNAT[AÁ]RIO|DEVEDOR|FIDUCIANTE|VE[ÍI]CULO|CONTRATO|$))`,
    'i',
  )

  const blockMatch = blockRegex.exec(text)
  if (!blockMatch) return null

  const block = blockMatch[1].replace(/\n/g, ' ').trim()
  if (!block) return null

  // Nome: tudo antes do primeiro comma que precede "brasileiro", "nascido", CPF, etc.
  const name = capture(block, /^([^,]+)/)

  // Nascimento
  const birthDate = capture(block, /nascid[ao]\s+em\s+(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/i)

  // Endereço: tudo após "residente e domiciliado a" até CEP ou vírgula
  const address = capture(block, /(?:residente\s+e\s+domiciliad[ao]\s+[aà]|endere[cç]o:?)\s+([^,]+(?:,\s*n[uú]m?[.\s]+\d+[^,]*)?)/i)

  // CEP
  const cep = capture(block, /CEP\s+([\d]{5}-?[\d]{3})/i)

  // Bairro
  const bairro = capture(block, /bairro\s+([^,na]+?)(?:\s+na\s+cidade|\s*,)/i)

  // Cidade e estado
  const cityState = capture(block, /(?:na\s+cidade\s+de|cidade:?)\s+([A-ZÀ-Ú][^-,\n]+)-([A-Z]{2})/i)
  let city: string | null = null
  let state: string | null = null
  if (cityState) {
    const cs = /([^-]+)-([A-Z]{2})/.exec(cityState)
    city  = cs?.[1]?.trim() ?? null
    state = cs?.[2]?.trim() ?? null
  }
  // Tentativa alternativa
  if (!city) {
    const m = /(?:na\s+cidade\s+de)\s+([A-ZÀ-Ú][^-,\n]+)-([A-Z]{2})/i.exec(block)
    city  = m?.[1]?.trim() ?? null
    state = m?.[2]?.trim() ?? null
  }

  // CPF
  const cpfRaw = capture(block, /CPF\s+([\d]{3}\.[\d]{3}\.[\d]{3}-[\d]{2}|[\d]{11})/i)
  const cpf = cleanDocument(cpfRaw)

  // RG
  const rg = capture(block, /(?:do\s+)?RG\s+([\d.\-/a-zA-Z]+)/i)

  // Telefone
  const phoneRaw = capture(block, /tel(?:efone)?\/cel(?:ular)?:?\s*([^\s,;]+)/i)
  const phone = cleanPhone(phoneRaw)

  // E-mail
  const email = capture(block, /e-?mail:?\s*([^\s,;]+@[^\s,;]+)/i)

  return {
    name:      name?.trim()    ?? null,
    cpf:       cpf             ?? null,
    rg:        rg?.trim()      ?? null,
    address:   address?.trim() ?? null,
    cep:       cep             ?? null,
    bairro:    bairro?.trim()  ?? null,
    city:      city            ?? null,
    state:     state           ?? null,
    phone:     phone           ?? null,
    email:     email?.trim().toLowerCase() ?? null,
    birthDate: birthDate       ?? null,
  }
}

// ── Extração de veículo ───────────────────────────────────────────────────────

/**
 * Extrai dados de um veículo a partir de um bloco de texto.
 * Lida com layout em tabela (linhas separadas por \n) ou linear.
 */
function extractVehicleFromBlock(
  block: string,
  role: ContractVehicle['role'],
): ContractVehicle {
  // Normaliza o bloco para busca
  const b = block.replace(/\n/g, ' ')

  const marca   = capture(b, /(?:MARCA|FABRICANTE)[:/]?\s*([A-ZÀ-Ú][^\s/,;]+(?:\s[A-ZÀ-Ú][^\s/,;]+)?)/i)
  const modelo  = capture(b, /(?:MODELO|VERSÃO)[:/]?\s*([^\d/,;\n]{3,40})/i)
  const cor     = capture(b, /COR[:/]?\s*([A-ZÀ-Ú][^\s/,;]{2,20})/i)
  const chassi  = capture(b, /(?:CHASSI|CHASSIS|N[uú]m(?:ero)?\s+do\s+chassi)[:/]?\s*([A-Z0-9]{17})/i)
  const placa   = capture(b, /PLACA[:/]?\s*([A-Z]{3}[-]?[0-9][A-Z0-9][0-9]{2})/i)
  const renavam = capture(b, /RENAVAM[:/]?\s*([\d]{9,11})/i)
  const combustivel = capture(b, /COMBUST[ÍI]VEL[:/]?\s*([A-ZÀ-Ú][^\s/,;]{2,20})/i)

  // Anos — busca padrões como "2020/2021" ou "ANO: 2020"
  let anoFab: number | null = null
  let anoMod: number | null = null
  const anoSlash = /(\d{4})\/(\d{4})/.exec(b)
  if (anoSlash) {
    anoFab = parseInt(anoSlash[1])
    anoMod = parseInt(anoSlash[2])
  } else {
    const anoRaw = capture(b, /ANO(?:\s+(?:FAB(?:RICA[CÇ][AÃ]O)?|MODELO))?[:/]?\s*(\d{4})/i)
    if (anoRaw) {
      const n = parseInt(anoRaw)
      anoFab = n
      anoMod = n
    }
  }

  // Valor — aceita pt-BR e en-US
  const valorRaw = capture(
    b,
    /(?:VALOR|VALOR\s+DE\s+VENDA|VALOR\s+NEGOCIADO|PRE[CÇ]O)[:/]?\s*R?\$?\s*([\d.,]+)/i,
  )
  const valor = parseCurrency(valorRaw)

  return {
    role,
    marca:       marca?.trim()       ?? null,
    modelo:      modelo?.trim()      ?? null,
    anoFab,
    anoMod,
    cor:         cor?.trim()         ?? null,
    chassi:      chassi?.toUpperCase() ?? null,
    placa:       placa?.replace(/-/, '').toUpperCase() ?? null,
    renavam:     renavam?.trim()     ?? null,
    valor,
    combustivel: combustivel?.trim() ?? null,
  }
}

/**
 * Localiza e extrai todos os veículos do contrato.
 * Cada bloco começa com um cabeçalho como "DO VEÍCULO", "VEÍCULO VENDIDO", etc.
 */
function extractVehicles(text: string, contractType: ContractType): ContractVehicle[] {
  const vehicles: ContractVehicle[] = []

  // Padrões de cabeçalho de seção de veículo
  const sectionPatterns: Array<{ pattern: RegExp; role: ContractVehicle['role'] }> = [
    { pattern: /VE[ÍI]CULO\s+VENDIDO|DO\s+VE[ÍI]CULO\s+(?:A\s+SER\s+)?VENDIDO/i, role: 'VENDIDO'         },
    { pattern: /VE[ÍI]CULO\s+COMPRADO|DO\s+VE[ÍI]CULO\s+(?:A\s+SER\s+)?COMPRADO/i, role: 'COMPRADO'       },
    { pattern: /VE[ÍI]CULO\s+(?:DO\s+)?CONSIGNADO|OBJETO\s+DA\s+CONSIGNA/i,        role: 'CONSIGNADO'      },
    { pattern: /VE[ÍI]CULO\s+(?:DADO\s+EM\s+)?TROCA\s*(?:[-–]\s*SAÍDA|ENTREGUE)/i, role: 'TROCADO_SAIDA'  },
    { pattern: /VE[ÍI]CULO\s+(?:RECEBIDO|ENTRADA)\s*(?:[-–]\s*ENTRADA)?/i,         role: 'TROCADO_ENTRADA' },
    // Genérico (quando há só "DO VEÍCULO" sem qualificação)
    { pattern: /(?:DO\s+VE[ÍI]CULO|VE[ÍI]CULO\s+OBJETO)/i, role: contractType === 'COMPRA_DEALER' ? 'COMPRADO' : 'VENDIDO' },
  ]

  for (const { pattern, role } of sectionPatterns) {
    // Localiza o bloco após o cabeçalho até o próximo cabeçalho ou fim
    const sectionRegex = new RegExp(
      `${pattern.source}[:\\s]*([\\s\\S]{50,800}?)(?=\\n\\s*(?:COMPRADOR|VENDEDOR|CONSIGN|VE[ÍI]CULO|VALOR\\s+TOTAL|ASSINATURA|$))`,
      'i',
    )
    const m = sectionRegex.exec(text)
    if (m) {
      const vehicle = extractVehicleFromBlock(m[1], role)
      // Só adiciona se extraiu ao menos placa ou chassi
      if (vehicle.placa || vehicle.chassi || vehicle.marca) {
        vehicles.push(vehicle)
      }
    }
  }

  return vehicles
}

// ── Extração do código do contrato ───────────────────────────────────────────

function extractContractCode(text: string): string | null {
  return (
    capture(text, /CONTRATO\s+N[uú]mero[:\s#]+([\w/-]+)/i) ??
    capture(text, /N[uú]m(?:ero)?[:\s#.]+([\d]{3,}[-/]?[\d]*)/i) ??
    capture(text, /CONTRATO\s*[:#]\s*([\w/-]+)/i) ??
    null
  )
}

// ── Extração da data do contrato ─────────────────────────────────────────────

function extractContractDate(text: string): string | null {
  return (
    capture(text, /(?:celebrado|firmado|assinado)\s+(?:em|na\s+cidade)[^,\n]*?(?:,\s*)?(\d{1,2}\s+de\s+\w+\s+de\s+\d{4})/i) ??
    capture(text, /(?:data\s+do\s+contrato|emiss[aã]o)[:\s]+(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})/i) ??
    capture(text, /(\d{1,2}\s+de\s+[a-záàâãéêíóôõúüç]+\s+de\s+\d{4})/i) ??
    null
  )
}

// ── Extração do valor total ───────────────────────────────────────────────────

function extractTotalValue(text: string): number | null {
  const raw =
    capture(text, /VALOR\s+TOTAL[:\s]+R?\$?\s*([\d.,]+)/i) ??
    capture(text, /TOTAL\s+(?:DO\s+CONTRATO|A\s+PAGAR)[:\s]+R?\$?\s*([\d.,]+)/i) ??
    null
  return parseCurrency(raw)
}

// ── Parser principal ──────────────────────────────────────────────────────────

/**
 * Analisa o texto bruto de um PDF de contrato Autoconf e retorna
 * a estrutura ParsedContract com todos os dados extraídos.
 *
 * @param rawText — texto retornado por pdf-parse (data.text)
 */
export function parseContractText(rawText: string): ParsedContract {
  const text = normalizeText(rawText)
  const type = detectContractType(text)

  // Determina os rótulos de buyer/seller conforme o tipo de contrato
  const buyerLabels: string[]  = []
  const sellerLabels: string[] = []

  switch (type) {
    case 'COMPRA_VENDA':
      buyerLabels.push('COMPRADOR', 'ADQUIRENTE')
      sellerLabels.push('VENDEDOR', 'OUTORGANTE VENDEDOR')
      break
    case 'COMPRA_DEALER':
      // Dealer compra: a PF/PJ é vendedora
      buyerLabels.push('COMPRADOR', 'ADQUIRENTE')
      sellerLabels.push('VENDEDOR', 'PROPRIETÁRIO')
      break
    case 'CONSIGNACAO':
      buyerLabels.push('CONSIGNATÁRIO')
      sellerLabels.push('CONSIGNANTE', 'PROPRIETÁRIO')
      break
    case 'TROCA':
      buyerLabels.push('COMPRADOR', 'PARTE A', 'PERMUTANTE A')
      sellerLabels.push('VENDEDOR',  'PARTE B', 'PERMUTANTE B')
      break
    case 'FINANCIAMENTO':
      buyerLabels.push('DEVEDOR', 'FIDUCIANTE', 'COMPRADOR')
      sellerLabels.push('CREDOR', 'FIDUCIÁRIO', 'VENDEDOR')
      break
    default:
      buyerLabels.push('COMPRADOR')
      sellerLabels.push('VENDEDOR')
  }

  const buyer  = extractParty(text, buyerLabels)
  const seller = extractParty(text, sellerLabels)

  const vehicles = extractVehicles(text, type)

  return {
    contractCode: extractContractCode(text),
    type,
    contractDate: extractContractDate(text),
    buyer,
    seller,
    vehicles,
    totalValue:   extractTotalValue(text),
    rawText:      text,
  }
}

// ── Função de entrada com pdf-parse ──────────────────────────────────────────

/**
 * Aceita um Buffer (conteúdo do arquivo PDF) e retorna o contrato parseado.
 *
 * Uso:
 *   const buffer = fs.readFileSync('contrato.pdf')
 *   const result = await parseContractPdf(buffer)
 *
 * Em rotas Next.js:
 *   const bytes  = await file.arrayBuffer()
 *   const buffer = Buffer.from(bytes)
 *   const result = await parseContractPdf(buffer)
 */
export async function parseContractPdf(buffer: Buffer): Promise<ParsedContract> {
  // pdf-parse é importado dinamicamente para evitar problemas com o bundler Next.js.
  // O export muda entre versões/ESM — fazemos fallback.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = (await import('pdf-parse')) as any
  const pdfParse = mod.default ?? mod

  const data = await pdfParse(buffer, {
    // Preserva quebras de linha para facilitar detecção de blocos
    pagerender: undefined,
  })

  return parseContractText(data.text)
}

// ── Singleton / export default ────────────────────────────────────────────────

export const contractPdfParser = {
  parseText: parseContractText,
  parsePdf:  parseContractPdf,
}
