'use client'

// =============================================================================
// /estoque/avaliacao — Avaliação de veículo obrigatória antes do cadastro
// 6 etapas: Placa → Veículo → FIPE/Preços → Cautelar → Cliente → Resultado
// =============================================================================

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, ArrowRight, Car, CheckCircle,
  ClipboardCheck, DollarSign, ShieldCheck, User,
  FileCheck, AlertTriangle, Info, XCircle,
} from 'lucide-react'
import { canAccessModule } from '@/lib/permissions'
import { PlateInput } from '@/components/estoque/PlateInput'
import { VehicleComboBox, type VehicleComboSelection } from '@/components/estoque/VehicleComboBox'
import { FipeWizard, type FipeResult } from '@/components/estoque/FipeWizard'
import type { VehicleLookupData, VehicleCategory } from '@/lib/vehicle-lookup/types'
import { maskBRL, parseBRL, maskKM, parseKM, numberToBRLMask } from '@/lib/masks'
import { StepCliente, type CustomerLite } from './_components/StepCliente'
import { FipeMiniChart } from './_components/FipeMiniChart'
import { EvaluationSections } from './_components/EvaluationSections'
import { CautelarUploader, type AttachmentLite } from './_components/CautelarUploader'
import { StepDocumentoVeiculo, type ExtractionSource } from './_components/StepDocumentoVeiculo'
import type { ExtractedVehicle, ExtractionConfidence } from '@/lib/crlv/parser'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Unit { id: string; name: string }

// ── Normalização de marca para casamento com catálogo FIPE ────────────────────
// A API Placas pode trazer "VW", "VW - VolksWagen", "M.BENZ", etc. — o catálogo
// FIPE usa o nome canônico ("Volkswagen", "Mercedes-Benz"). Esta tabela mapeia
// os apelidos comuns para o canônico antes de comparar.
const BRAND_ALIAS: Record<string, string> = {
  'VW':        'VOLKSWAGEN',
  'VOLKS':     'VOLKSWAGEN',
  'GM':        'CHEVROLET',
  'MBENZ':     'MERCEDESBENZ',
  'M BENZ':    'MERCEDESBENZ',
  'M.BENZ':    'MERCEDESBENZ',
  'MERCEDES':  'MERCEDESBENZ',
  'CITROEN':   'CITROEN',
  'CITROËN':   'CITROEN',
  'PEUGEOT':   'PEUGEOT',
}
function normalizeBrandName(s: string | undefined | null): string {
  if (!s) return ''
  const n = String(s).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  // Remove sufixos depois de hífen ("VW - VOLKSWAGEN" → "VOLKSWAGEN" via alias da 1ª parte)
  const parts = n.split(/\s*-\s*/)
  for (const p of parts) {
    const compact = p.replace(/[^A-Z0-9]/g, '')
    if (BRAND_ALIAS[compact] || BRAND_ALIAS[p.trim()]) return BRAND_ALIAS[compact] || BRAND_ALIAS[p.trim()]
  }
  // Caso geral: pega a parte mais longa e remove pontuação
  const best = parts.reduce((a, b) => (b.length > a.length ? b : a), '')
  const compact = best.replace(/[^A-Z0-9]/g, '')
  return BRAND_ALIAS[compact] ?? compact
}
function normalizeModelName(s: string | undefined | null): string {
  if (!s) return ''
  return String(s).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '')
}

// Tokeniza um nome de veículo em palavras significativas para matching fuzzy.
// "FIT LX 1.4 16V FLEX" → ['FIT', 'LX', '14', '16V', 'FLEX']
// Filtra stop-words e pedaços muito curtos pra evitar match falso.
const STOP_WORDS = new Set(['DE', 'DA', 'DO', 'COM', 'P', 'V', 'A', 'O', 'E'])
function tokenizeVehicleName(s: string | undefined | null): string[] {
  if (!s) return []
  return String(s)
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[\s\-\/\.\,\(\)]+/)
    .map((t) => t.replace(/[^A-Z0-9]/g, ''))
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t))
}

/**
 * Faz o melhor match de um modelo da API contra a lista FIPE.
 * Estratégia: tokeniza ambos, conta quantos tokens do TARGET aparecem no
 * candidato. Maior score ganha. Empate é desempatado por menor diferença
 * no comprimento total (modelo mais "enxuto" tipicamente é o certo).
 *
 * Exemplo: target "FIT LX FLEX" (tokens FIT/LX/FLEX) vs candidatos:
 *   - "FIT LX 1.4 16V FLEX MEC."     → score 3, len 27
 *   - "FIT EX 1.5 16V FLEX AUT."     → score 2, len 27
 *   - "FIT TWIST 1.5 16V FLEX AUT."  → score 2, len 28
 * Vence o primeiro (FIT LX 1.4 16V FLEX MEC.).
 */
function bestFipeMatch<T extends { name: string }>(
  list: T[],
  target: string | undefined | null,
  modelYearHint?: number | null,
): T | undefined {
  if (!list.length || !target) return undefined
  const tTokens = new Set(tokenizeVehicleName(target))
  if (tTokens.size === 0) return undefined
  let best: { item: T; score: number; len: number; yearMatch: number } | null = null
  for (const item of list) {
    const cTokens = tokenizeVehicleName(item.name)
    let score = 0
    for (const t of cTokens) if (tTokens.has(t)) score++
    if (score === 0) continue
    const len = item.name.length
    // Bônus se o nome do candidato menciona o ano modelo (alguns retornos da
    // FIPE incluem ano na descrição)
    const yearMatch = modelYearHint && item.name.includes(String(modelYearHint)) ? 1 : 0
    if (
      !best ||
      score > best.score ||
      (score === best.score && yearMatch > best.yearMatch) ||
      (score === best.score && yearMatch === best.yearMatch && len < best.len)
    ) {
      best = { item, score, len, yearMatch }
    }
  }
  return best?.item
}

// Steps reformulados: Step 1 agora consolida placa + documentos + dados do veículo.
// Step 2 (legado "Veículo") foi mergeado em Step 1 e não é mais navegado.
type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6

// ── Tipos auxiliares para Step 1 (FIPE-driven) ──────────────────────────────
type TipoVeiculoPt = 'CARRO' | 'MOTO' | 'CAMINHAO'
const TIPO_VEICULO_API: Record<TipoVeiculoPt, 'carros' | 'motos' | 'caminhoes'> = {
  CARRO:     'carros',
  MOTO:      'motos',
  CAMINHAO:  'caminhoes',
}
interface FipeOption { code: string; name: string }
const TIPOS_CARROCERIA = [
  'SUV', 'Hatch', 'Sedan', 'Picape', 'Utilitário', 'Esportivo',
  'Coupé', 'Conversível', 'Van/Minivan', 'Wagon/Perua', 'Buggy',
  'Caminhonete', 'Crossover',
]
const ANOS = (() => {
  const cur = new Date().getFullYear() + 1
  const out: number[] = []
  for (let y = cur; y >= 1950; y--) out.push(y)
  return out
})()

// ── Normalizadores: APIs/documentos retornam valores em formatos variados ──
// (ex: "ÁLCOOL/GASOLINA", "ALCOOL", "FLEX") — mapeamos para as opções dos
// <select> do formulário: Flex | Gasolina | Etanol | Diesel | Híbrido |
// Elétrico | GNV. Tudo case-insensitive, com normalização de acentos.
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function normalizeFuel(raw: string): string {
  const s = stripAccents(raw).toUpperCase().trim()
  if (!s) return raw
  if (s.includes('ALCOOL') && s.includes('GASOLINA')) return 'Flex'
  if (s.includes('FLEX'))                              return 'Flex'
  if (s.includes('HIBRID'))                            return 'Híbrido'
  if (s.includes('ELETR'))                             return 'Elétrico'
  if (s.includes('GNV'))                               return 'GNV'
  if (s.includes('DIESEL'))                            return 'Diesel'
  if (s.includes('ETANOL') || s === 'ALCOOL')          return 'Etanol'
  if (s.includes('GASOLINA'))                          return 'Gasolina'
  return raw
}

function normalizeTransmission(raw: string): string {
  const s = stripAccents(raw).toUpperCase().trim()
  if (!s) return raw
  if (s.includes('CVT'))                                                       return 'CVT'
  if (s.includes('AUTOMATIZ') || s.includes('AMT') || s.includes('DUALOGIC')) return 'Automatizado'
  if (s.includes('SEMI'))                                                      return 'Semi-automático'
  if (s.includes('AUTOMAT') || s.includes('AUTO'))                             return 'Automático'
  if (s.includes('MANUAL') || s.includes('MEC'))                               return 'Manual'
  return raw
}

function normalizeBodyType(raw: string): string {
  const s = stripAccents(raw).toUpperCase().trim()
  if (!s) return raw
  if (s.includes('SUV'))                                  return 'SUV'
  if (s.includes('CROSS'))                                return 'Crossover'
  if (s.includes('HATCH'))                                return 'Hatch'
  if (s.includes('SEDAN'))                                return 'Sedan'
  if (s.includes('PICAPE') || s.includes('PICKUP'))       return 'Picape'
  if (s.includes('CAMINHON'))                             return 'Caminhonete'
  if (s.includes('UTILITAR'))                             return 'Utilitário'
  if (s.includes('ESPORT'))                               return 'Esportivo'
  if (s.includes('COUPE') || s.includes('COUPÉ'))         return 'Coupé'
  if (s.includes('CONVERS'))                              return 'Conversível'
  if (s.includes('VAN')   || s.includes('MINIVAN'))       return 'Van/Minivan'
  if (s.includes('WAGON') || s.includes('PERUA'))         return 'Wagon/Perua'
  if (s.includes('BUGGY'))                                return 'Buggy'
  return raw
}

// Converte cilindrada em cc (ex "1000", "1498") para o formato dos selects:
// CARRO usa "1.0"/"1.5"/"2.0" (litros arredondados), MOTO/CAMINHAO usa "Xcc".
function ccToEngineOption(displacement: string | undefined, tipo: 'CARRO' | 'MOTO' | 'CAMINHAO'): string | undefined {
  if (!displacement) return undefined
  const n = parseInt(displacement.replace(/\D/g, ''), 10)
  if (!Number.isFinite(n) || n <= 0) return undefined
  if (tipo === 'CARRO') {
    // 999 → 1.0, 1498 → 1.5, 1968 → 2.0, 2997 → 3.0
    const liters = Math.round(n / 100) / 10
    if (liters >= 6.0) return '6.0+'
    // Tenta achar a opção mais próxima do array ENGINE_CARRO
    const candidate = liters.toFixed(1)
    return candidate
  }
  if (tipo === 'MOTO') {
    // Arredonda pra dezena mais próxima do catálogo
    if (n >= 2500) return '2500cc+'
    return `${n}cc`
  }
  if (tipo === 'CAMINHAO') {
    if (n >= 1000) return '1000cc+'
    return `${n}cc`
  }
  return undefined
}

// Extrai potência em CV de uma string ("128", "128 CV", "128CV") e devolve
// a opção mais próxima do select POWER_OPTIONS (50/60/70/80/.../700+).
function normalizePower(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const m = String(raw).match(/(\d+)/)
  if (!m) return undefined
  const n = parseInt(m[1], 10)
  if (!Number.isFinite(n) || n <= 0) return undefined
  if (n >= 700) return '700 cv+'
  // Arredonda pra dezena mais próxima
  const rounded = Math.round(n / 10) * 10
  return `${rounded} cv`
}

// ── Listas de motorização por tipo de veículo ──────────────────────────────
// CARRO: cilindrada em litros (1.0 → 6.0+)
const ENGINE_CARRO = [
  '1.0', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.8', '1.9',
  '2.0', '2.2', '2.4', '2.5', '2.7', '2.8',
  '3.0', '3.2', '3.5', '3.6', '3.8',
  '4.0', '4.2', '4.4', '4.6', '4.8',
  '5.0', '5.2', '5.5', '5.7',
  '6.0+',
]
// MOTO: cilindrada em cc (50cc → 2.500cc+)
const ENGINE_MOTO = [
  '50cc', '100cc', '110cc', '125cc', '150cc', '160cc', '200cc', '250cc',
  '300cc', '350cc', '400cc', '450cc', '500cc', '600cc', '650cc', '750cc',
  '800cc', '900cc', '1000cc', '1100cc', '1200cc', '1300cc', '1400cc',
  '1500cc', '1600cc', '1700cc', '1800cc', '1900cc', '2000cc', '2200cc',
  '2300cc', '2400cc', '2500cc+',
]
// CAMINHAO: cilindrada (150cc → 1000cc+ — conforme especificação)
const ENGINE_CAMINHAO = [
  '150cc', '200cc', '250cc', '300cc', '350cc', '400cc', '450cc', '500cc',
  '550cc', '600cc', '650cc', '700cc', '750cc', '800cc', '850cc', '900cc',
  '950cc', '1000cc+',
]

// Potência em cv — lista cresce até 700+ cv (cobre carros, motos e caminhões)
const POWER_OPTIONS = [
  '50 cv', '60 cv', '70 cv', '80 cv', '90 cv', '100 cv', '110 cv', '120 cv',
  '130 cv', '140 cv', '150 cv', '160 cv', '170 cv', '180 cv', '190 cv',
  '200 cv', '220 cv', '240 cv', '260 cv', '280 cv', '300 cv', '320 cv',
  '340 cv', '360 cv', '380 cv', '400 cv', '450 cv', '500 cv', '550 cv',
  '600 cv', '650 cv', '700 cv+',
]

function getEngineOptions(tipo: 'CARRO' | 'MOTO' | 'CAMINHAO'): string[] {
  if (tipo === 'MOTO')      return ENGINE_MOTO
  if (tipo === 'CAMINHAO')  return ENGINE_CAMINHAO
  return ENGINE_CARRO
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const inputCls = 'rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 w-full'
const selectCls = inputCls

function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

function Grid({ cols = 3, children }: { cols?: 2 | 3 | 4; children: React.ReactNode }) {
  const colMap = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }
  return <div className={`grid grid-cols-1 gap-4 ${colMap[cols]}`}>{children}</div>
}

function Section({ title, icon, children }: {
  title: string; icon?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {icon && <span className="text-brand-600">{icon}</span>}
        <h3 className="font-semibold text-gray-800">{title}</h3>
      </div>
      {children}
    </div>
  )
}

// Tag (componente "campo extraído") removido — não há mais card de dados
// extraídos. O preenchimento é silencioso direto nos inputs do formulário.

// ── Step indicator ─────────────────────────────────────────────────────────────

// STEPS atualizado: Step 1 agora cobre Placa + Documentos + Dados do Veículo.
// "Veículo" (antigo step 2) foi removido da navegação para evitar duplicidade.
// Etapa "FIPE / Preços" (step 3) foi REMOVIDA do fluxo do avaliador a pedido
// do operador — precificação é feita pelo gerente após o envio para aprovação.
// Os campos de valor avaliado / desejado / mínimo / sugerido continuam no
// state pra compatibilidade com o payload existente, mas não são editáveis
// pelo vendedor/avaliador.
const STEPS = [
  { num: 0, label: 'Cliente',      icon: <User className="h-4 w-4" /> },
  { num: 1, label: 'Veículo',      icon: <Car className="h-4 w-4" /> },
  { num: 4, label: 'Cautelar',     icon: <ShieldCheck className="h-4 w-4" /> },
  { num: 5, label: 'Avaliação',    icon: <ClipboardCheck className="h-4 w-4" /> },
  { num: 6, label: 'Resultado',    icon: <FileCheck className="h-4 w-4" /> },
]

function StepBar({ current, onNavigate }: { current: Step; onNavigate: (s: Step) => void }) {
  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-1">
      {STEPS.map((s, i) => {
        const done    = s.num < current
        const active  = s.num === current
        const enabled = s.num <= current || done
        return (
          <div key={s.num} className="flex items-center">
            <button
              type="button"
              disabled={!enabled}
              onClick={() => enabled && onNavigate(s.num as Step)}
              className={[
                'flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors whitespace-nowrap',
                active  ? 'bg-brand-600 text-white shadow-sm'       : '',
                done    ? 'text-brand-700 hover:bg-brand-50'         : '',
                !enabled && !active && !done ? 'text-gray-300 cursor-not-allowed' : '',
                !active && enabled ? 'cursor-pointer' : '',
              ].join(' ')}
            >
              <span className={[
                'flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold',
                active  ? 'bg-white text-brand-600'              : '',
                done    ? 'bg-brand-100 text-brand-600'          : '',
                !enabled && !active && !done ? 'bg-gray-100 text-gray-300' : '',
              ].join(' ')}>
                {done ? <CheckCircle className="h-4 w-4" /> : s.num}
              </span>
              <span className="text-xs font-medium">{s.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 w-6 shrink-0 ${s.num < current ? 'bg-brand-400' : 'bg-gray-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Formulário principal ──────────────────────────────────────────────────────

function AvaliacaoForm() {
  const { data: session } = useSession()
  const router            = useRouter()
  const searchParams      = useSearchParams()
  const role = (session?.user as { role?: string })?.role ?? ''

  const canAccess  = canAccessModule(role, 'stock.evaluate')
  const canApprove = canAccessModule(role, 'stock.manage')

  const [step,       setStep]       = useState<Step>(0)
  const [customer,   setCustomer]   = useState<CustomerLite | null>(null)
  // RASCUNHO id — criado quando o usuário avança do Step 1 (Veículo). Habilita
  // sub-componentes que dependem do backend (EvaluationSections, CautelarUploader).
  const [evaluationId,    setEvaluationId]    = useState<string | null>(null)
  const [autoSavingDraft, setAutoSavingDraft] = useState(false)
  const [draftAttempted,  setDraftAttempted]  = useState(false)
  const [cautelarFiles,   setCautelarFiles]   = useState<AttachmentLite[]>([])
  // Status/reopenCount reais da avaliação (carregados via GET /api/evaluations/[id]
  // quando o usuário entra em modo edição via ?id=).
  const [evalStatus,     setEvalStatus]     = useState<string>('DRAFT')
  const [evalReopenCount, setEvalReopenCount] = useState<number>(0)
  const [units,      setUnits]      = useState<Unit[]>([])
  const [lookupData, setLookupData] = useState<VehicleLookupData | null>(null)
  const [dataSource, setDataSource] = useState<string>('')
  const [saving,     setSaving]     = useState(false)
  const [approving,  setApproving]  = useState(false)
  const [savedId,    setSavedId]    = useState('')
  const [error,      setError]      = useState('')
  const [success,    setSuccess]    = useState<'saved' | 'approved' | null>(null)

  // ── Etapa 1 — Placa ─────────────────────────────────────────────────────────
  const [plate,        setPlate]        = useState('')
  const [plateDisplay, setPlateDisplay] = useState('')

  // ── Etapa 2 — Veículo ────────────────────────────────────────────────────────
  const [combo, setCombo] = useState<VehicleComboSelection>({
    vehicleType: '', brandCode: '', brandName: '', modelCode: '', modelName: '',
    versionCode: '', versionLabel: '', modelYear: null,
    fipeCode: '', fipeValue: null, fipeMonth: '', fuel: '',
  })
  // Fallback manual de marca/modelo quando VehicleComboBox não tem seleção
  const [manualBrand, setManualBrand] = useState('')
  const [manualModel, setManualModel] = useState('')

  const [version,      setVersion]      = useState('')
  const [year,         setYear]         = useState('')
  const [km,           setKm]           = useState('')
  const [color,        setColor]        = useState('')
  const [fuel,         setFuel]         = useState('')
  const [transmission, setTransmission] = useState('')
  const [doors,        setDoors]        = useState('')
  const [engine,       setEngine]       = useState('')
  const [displacement, setDisplacement] = useState('')
  const [power,        setPower]        = useState('')
  const [bodyType,     setBodyType]     = useState('')
  const [chassi,       setChassi]       = useState('')
  const [renavam,      setRenavam]      = useState('')
  const [conditionType, setConditionType] = useState('')
  const [unitId,        setUnitId]       = useState('')

  // ── Step 1 (novo) — campos exclusivos do layout consolidado ───────────────
  const [yearModel,    setYearModel]    = useState('')   // ano modelo separado do ano fabricação
  const [tipoVeiculo,  setTipoVeiculo]  = useState<TipoVeiculoPt>('CARRO')

  // FIPE-driven combos (Step 1)
  const [fipeBrands,   setFipeBrands]   = useState<FipeOption[]>([])
  const [fipeModels,   setFipeModels]   = useState<FipeOption[]>([])
  const [brandLoading, setBrandLoading] = useState(false)
  const [modelLoading, setModelLoading] = useState(false)
  const [brandCode,    setBrandCode]    = useState('')   // código FIPE da marca
  const [modelCode,    setModelCode]    = useState('')   // código FIPE do modelo
  const [brandName,    setBrandName]    = useState('')
  const [modelName,    setModelName]    = useState('')

  // Documentos do veículo (uploads pendentes — gravados após criar avaliação)
  const [pendingDocs, setPendingDocs] = useState<File[]>([])

  // ── Document-first flow (CRLV) ─────────────────────────────────────────────
  // O passo 1 só libera o restante do formulário depois que o operador subiu o
  // CRLV (preferencialmente PDF) OU optou por seguir sem documento (que então
  // libera a consulta por placa, marcada como "complementar").
  const [documentUploaded, setDocumentUploaded] = useState(false)
  const [documentSkipped,  setDocumentSkipped]  = useState(false)
  const [extractedData,    setExtractedData]    = useState<ExtractedVehicle | null>(null)
  const [extractionSource, setExtractionSource] = useState<ExtractionSource | null>(null)
  const [extractionConfidence, setExtractionConfidence] = useState<ExtractionConfidence | null>(null)
  // Para divergência (P1): origem de cada campo (documento / api / manual).
  const [fieldSource, setFieldSource] = useState<Record<string, 'documento' | 'api' | 'manual'>>({})

  // Opcionais do veículo (chips multi-select). Persistidos em evaluationNotes
  // prefixados com [Opcionais] enquanto não há coluna dedicada no schema.
  const [opcionais, setOpcionais] = useState<string[]>([])

  // Pré-preenche unidade com a unidade do usuário logado (default operacional).
  // Sem isso, o vendedor precisava escolher manualmente mesmo quando só pertence
  // a uma unidade — UX ruim e bloqueava o avanço da etapa.
  useEffect(() => {
    const sessionUnit = (session?.user as { unitId?: string | null } | undefined)?.unitId
    if (sessionUnit && !unitId) setUnitId(sessionUnit)
  }, [session, unitId])

  // ── Carrega marcas FIPE quando muda o tipo de veículo ──────────────────────
  useEffect(() => {
    let alive = true
    setFipeBrands([])
    setBrandCode(''); setBrandName('')
    setFipeModels([])
    setModelCode(''); setModelName('')
    setBrandLoading(true)
    fetch(`/api/integrations/fipe/brands?tipoVeiculo=${TIPO_VEICULO_API[tipoVeiculo]}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return
        if (d.ok && Array.isArray(d.data)) setFipeBrands(d.data)
      })
      .catch(() => { /* sem FIPE — usuário pode digitar manualmente */ })
      .finally(() => { if (alive) setBrandLoading(false) })
    return () => { alive = false }
  }, [tipoVeiculo])

  // ── Auto-seleção de marca FIPE a partir do texto da API Placas ─────────────
  // Quando o catálogo FIPE termina de carregar, tenta encontrar a marca cujo
  // nome normalizado (sem acento, sem pontuação, com aliases tipo VW→
  // VOLKSWAGEN) bate com o que veio do lookup. Resolve o bug "marca ficou em
  // 'Selecione' mesmo a API tendo retornado VOLKSWAGEN".
  useEffect(() => {
    if (brandCode) return                              // já selecionado manualmente (ou auto antes)
    if (!lookupData?.brand) return                     // nada para casar
    if (!fipeBrands.length) return                     // catálogo ainda não chegou
    const target = normalizeBrandName(lookupData.brand)
    if (!target) return
    // Estratégia em camadas: igualdade exata > prefixo > contém > tokens
    let hit = fipeBrands.find((b) => normalizeBrandName(b.name) === target)
    if (!hit) hit = fipeBrands.find((b) => {
      const cand = normalizeBrandName(b.name)
      return cand.startsWith(target) || target.startsWith(cand)
    })
    if (!hit) hit = fipeBrands.find((b) => normalizeBrandName(b.name).includes(target))
    // Token scoring como último recurso (cobre "VW - VOLKSWAGEN" vs "Volkswagen")
    if (!hit) hit = bestFipeMatch(fipeBrands, lookupData.brand) as typeof fipeBrands[number] | undefined
    if (hit) {
      setBrandCode(hit.code)
      setBrandName(hit.name)
    }
  }, [fipeBrands, lookupData?.brand, brandCode])

  // Aplica tipo de veículo detectado pela API ao seletor (CARRO/MOTO/CAMINHAO).
  // Sem isso o catálogo FIPE buscava sempre 'carros' e a marca real (ex: Honda
  // moto) nunca aparecia na lista.
  useEffect(() => {
    const vt = lookupData?.vehicleType
    if (!vt) return
    if (vt === 'CAR'        && tipoVeiculo !== 'CARRO')    setTipoVeiculo('CARRO')
    if (vt === 'MOTORCYCLE' && tipoVeiculo !== 'MOTO')     setTipoVeiculo('MOTO')
    if (vt === 'TRUCK'      && tipoVeiculo !== 'CAMINHAO') setTipoVeiculo('CAMINHAO')
  }, [lookupData?.vehicleType])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Carrega modelos FIPE quando muda a marca ───────────────────────────────
  useEffect(() => {
    if (!brandCode) { setFipeModels([]); return }
    let alive = true
    setFipeModels([])
    setModelCode(''); setModelName('')
    setModelLoading(true)
    fetch(`/api/integrations/fipe/models?tipoVeiculo=${TIPO_VEICULO_API[tipoVeiculo]}&brandId=${encodeURIComponent(brandCode)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return
        if (d.ok && Array.isArray(d.data)) setFipeModels(d.data)
      })
      .catch(() => {})
      .finally(() => { if (alive) setModelLoading(false) })
    return () => { alive = false }
  }, [brandCode, tipoVeiculo])

  // ── Auto-seleção de modelo FIPE a partir do texto da API Placas ────────────
  // Estratégia: token scoring via bestFipeMatch (lida com diferenças entre
  // o que a API retorna — "FIT LX FLEX" — e o que a FIPE catalogou —
  // "FIT LX 1.4 16V Flex Mec."). Usa modelYear como tiebreaker.
  useEffect(() => {
    if (modelCode) return
    if (!lookupData?.model) return
    if (!fipeModels.length) return
    const hit = bestFipeMatch(fipeModels, lookupData.model, lookupData.modelYear ?? null)
    if (hit) {
      setModelCode(hit.code)
      setModelName(hit.name)
    }
  }, [fipeModels, lookupData?.model, lookupData?.modelYear, modelCode])

  // ── Etapa 3 — FIPE / Preços ──────────────────────────────────────────────────
  const [fipeCode,       setFipeCode]       = useState('')
  const [fipeValue,      setFipeValue]      = useState('')
  const [fipeMonth,      setFipeMonth]      = useState('')
  const [fipeWizardOpen, setFipeWizardOpen] = useState(false)
  const [fipeLastFetch,  setFipeLastFetch]  = useState<string>('')
  const [evaluatedValue, setEvaluatedValue] = useState('')
  const [desiredValue,   setDesiredValue]   = useState('')
  const [minimumValue,   setMinimumValue]   = useState('')
  const [suggestedSale,  setSuggestedSale]  = useState('')

  const handleFipeComplete = (r: FipeResult) => {
    setFipeCode(r.codigoFipe)
    // numberToBRLMask converte número-em-reais (91320) → "91.320,00" — round-trip
    // exato com parseBRL (digitos-como-centavos). Usar toLocaleString direto, ou
    // pior, .toString(), gera a string "91320" que parseBRL lê como 913,20.
    setFipeValue(r.valorNumber > 0 ? numberToBRLMask(r.valorNumber) : r.valor)
    setFipeMonth(r.mesReferencia)
    setFipeLastFetch(new Date().toISOString())
    setFipeWizardOpen(false)
  }

  // ── Etapa 4 — Cautelar ───────────────────────────────────────────────────────
  const [cautelarStatus, setCautelarStatus] = useState('SEM_CAUTELAR')
  const [cautelarNumber, setCautelarNumber] = useState('')
  const [cautelarNotes,  setCautelarNotes]  = useState('')

  // ── Etapa 5 — Cliente ────────────────────────────────────────────────────────
  const [ownerName,  setOwnerName]  = useState('')
  const [ownerPhone, setOwnerPhone] = useState('')
  const [ownerCpf,   setOwnerCpf]   = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')

  // ── Etapa 6 — Resultado ──────────────────────────────────────────────────────
  // Nota: intention/result/stockType foram removidos do wizard. A intenção
  // e o resultado agora são definidos pelo gerente após "Enviar para aprovação".
  const [evaluationNotes, setEvaluationNotes] = useState('')

  // ── Carga inicial ─────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/units?limit=200', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d.success) setUnits(d.data ?? []) })
      .catch(() => {})

    // Pré-carrega vehicleId se vier pela URL (vindo de /estoque/[id])
    const vehicleIdParam = searchParams.get('vehicleId')
    if (vehicleIdParam) {
      fetch(`/api/vehicles/${vehicleIdParam}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => {
          if (d.success && d.data) {
            const v = d.data
            setPlate(v.plate ?? '')
            setPlateDisplay(v.plate ?? '')
            setVersion(v.version ?? '')
            setYear(v.year?.toString() ?? '')
            setKm(v.km?.toString() ?? '')
            setColor(v.color ?? '')
            setFuel(v.fuel ?? '')
            setTransmission(v.transmission ?? '')
            setDoors(v.doors?.toString() ?? '')
            setChassi(v.chassi ?? '')
            setRenavam(v.renavam ?? '')
            setConditionType(v.conditionType ?? '')
            if (v.unitId) setUnitId(v.unitId)
            setCombo((prev) => ({
              ...prev,
              vehicleType: v.vehicleType ?? '',
            }))
          }
        })
        .catch(() => {})
    }
  }, [searchParams])

  // ── Preload de evaluationId via URL (?id=) ─────────────────────────────────
  useEffect(() => {
    const idParam = searchParams.get('id')
    if (idParam && !evaluationId) setEvaluationId(idParam)
  }, [searchParams, evaluationId])

  // ── Refresh dos anexos cautelares + status/reopenCount reais ───────────────
  const refreshCautelar = useCallback(async () => {
    if (!evaluationId) return
    try {
      const r = await fetch(`/api/evaluations/${evaluationId}`, { cache: 'no-store' })
      const d = await r.json()
      const list = Array.isArray(d?.data?.attachments) ? d.data.attachments : []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setCautelarFiles(list.filter((a: any) => a?.category === 'LAUDO_CAUTELAR'))
      // Mantém status/reopenCount em dia para passar valores reais ao
      // EvaluationSections (e não o hardcode "DRAFT" / 0).
      if (d?.data?.status) setEvalStatus(String(d.data.status))
      if (d?.data?.reopenCount != null) setEvalReopenCount(Number(d.data.reopenCount) || 0)
    } catch { /* silent */ }
  }, [evaluationId])

  useEffect(() => { void refreshCautelar() }, [refreshCautelar])

  // ── Cria RASCUNHO no backend para habilitar sections/cautelar ───────────────
  // Idempotente: se já temos evaluationId (criado nesta sessão ou vindo de ?id=),
  // não tenta criar de novo. Também usa draftAttempted como guard para evitar
  // dupla chamada concorrente (ex: usuário cliclando "Próxima etapa" 2x rápido).
  async function ensureDraft(): Promise<string | null> {
    if (evaluationId) return evaluationId
    if (autoSavingDraft) return null
    if (draftAttempted)  return evaluationId  // já tentou; não repete
    const brand = brandName || manualBrand || lookupData?.brand || ''
    const model = modelName || manualModel || lookupData?.model || ''
    if (!plate && !(brand && model)) {
      setError('Preencha placa ou marca/modelo antes de avançar.')
      return null
    }
    setAutoSavingDraft(true)
    setDraftAttempted(true)
    try {
      const body = {
        plate:        plate || null,
        chassi:       chassi || null,
        renavam:      renavam || null,
        brand,
        model,
        version:      version || null,
        manufactureYear: year ? Number(year) : null,
        modelYear:    yearModel ? Number(yearModel) : null,
        km:           km ? Number(km) : null,
        color:        color || null,
        fuel:         fuel  || null,
        transmission: transmission || null,
        vehicleType:  combo.vehicleType || lookupData?.vehicleType || null,
        conditionType: conditionType || null,
        fipeCode:     fipeCode || null,
        fipeReferenceMonth: fipeMonth || null,
        fipeValue:    parseBRL(fipeValue),
        evaluatedValue:  parseBRL(evaluatedValue),
        desiredValue:    parseBRL(desiredValue),
        minimumValue:    parseBRL(minimumValue),
        suggestedSalePrice: parseBRL(suggestedSale),
        ownerName:  customer?.name  ?? ownerName  ?? null,
        ownerCpf:   customer?.cpf   ?? ownerCpf   ?? null,
        ownerPhone: customer?.phone ?? ownerPhone ?? null,
        ownerEmail: customer?.email ?? ownerEmail ?? null,
        unitId:     unitId || null,
        seedItems:  true,
      }
      const r = await fetch('/api/evaluations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (!r.ok || !d?.data?.id) {
        setError(d?.error ?? 'Falha ao criar rascunho da avaliação.')
        setDraftAttempted(false)  // permite retry
        return null
      }
      setEvaluationId(d.data.id)
      return d.data.id
    } catch {
      setError('Erro de conexão ao criar rascunho.')
      setDraftAttempted(false)  // permite retry
      return null
    } finally {
      setAutoSavingDraft(false)
    }
  }

  // ── Auto-preencher a partir do resultado da consulta por placa ───────────────
  const handleLookupResult = useCallback((data: VehicleLookupData | null, status: string) => {
    setLookupData(data)
    if (!data || status !== 'found') { setDataSource(''); return }
    setDataSource('auto')
    // RESET de seleções FIPE — sem isso, uma consulta nova não consegue
    // sobrescrever marca/modelo de uma consulta anterior (os useEffect
    // de auto-seleção têm guard `if (brandCode) return` pra não sobrescrever
    // seleção manual). Limpamos pra forçar a re-resolução.
    if (data.brand) {
      setBrandCode('')
      setBrandName('')
      setModelCode('')
      setModelName('')
      setFipeModels([])
    }
    // Marca/Modelo — pré-preenche fallback manual (substituído se combo for usado)
    if (data.brand) setManualBrand(data.brand)
    if (data.model) setManualModel(data.model)
    // Veículo
    if (data.version)         setVersion(data.version)
    if (data.manufactureYear) setYear(String(data.manufactureYear))
    // ── Ano Modelo (bug fix) — API retorna mas wizard não estava aplicando
    if (data.modelYear != null) setYearModel(String(data.modelYear))
    // Normalização: combustível/câmbio/carroceria vêm em formatos variados
    if (data.fuel)         setFuel(normalizeFuel(data.fuel))
    if (data.color)        setColor(data.color)
    if (data.transmission) setTransmission(normalizeTransmission(data.transmission))
    if (data.doors)        setDoors(String(data.doors))
    // Motorização: converte cilindrada (cc) pra "1.0/1.5/2.0" do select.
    // Se a API trouxer displacement já formatado, normaliza pelo tipoVeiculo atual.
    if (data.displacement) {
      const opt = ccToEngineOption(data.displacement, tipoVeiculo)
      if (opt) setEngine(opt)
      else     setDisplacement(data.displacement)
    } else if (data.engine) {
      setEngine(data.engine)
    }
    // Potência: arredonda pra dezena mais próxima do POWER_OPTIONS.
    if (data.power) {
      const p = normalizePower(data.power)
      if (p) setPower(p)
    }
    if (data.bodyType)     setBodyType(normalizeBodyType(data.bodyType))
    if (data.chassi)       setChassi(data.chassi)
    if (data.renavam)      setRenavam(data.renavam)
    // FIPE
    if (data.fipeCode)           setFipeCode(data.fipeCode)
    if (data.fipeValue != null)  setFipeValue(numberToBRLMask(data.fipeValue))
    if (data.fipeReferenceMonth) setFipeMonth(data.fipeReferenceMonth)
    // ComboBox — pré-seleciona tipo se disponível
    const vtype = data.vehicleType
    if (vtype) {
      setCombo((prev) => ({ ...prev, vehicleType: vtype as VehicleCategory }))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Recebe dados extraídos do CRLV e pré-preenche o formulário ────────────
  // Estratégia: usa `??` defensivo para evitar sobrescrever valores não nulos
  // já preenchidos pelo operador. Origem é marcada como "documento" para o P1
  // de comparação com a API Placas.
  const handleExtracted = useCallback((data: ExtractedVehicle, src: ExtractionSource, conf: ExtractionConfidence) => {
    setExtractedData(data)
    setExtractionSource(src)
    setExtractionConfidence(conf)
    setDocumentUploaded(true)

    const sourceMap: Record<string, 'documento' | 'api' | 'manual'> = {}
    const mark = (field: string) => { sourceMap[field] = 'documento' }

    // Placa
    if (data.plate && !plate) {
      setPlate(data.plate)
      setPlateDisplay(data.plate)
      mark('plate')
    }
    if (data.renavam && !renavam) { setRenavam(data.renavam); mark('renavam') }
    if (data.chassis && !chassi)  { setChassi(data.chassis);  mark('chassis') }

    // Marca / modelo
    if (data.brand) {
      if (!manualBrand) setManualBrand(data.brand)
      if (!brandName)   setBrandName(data.brand)
      mark('brand')
    }
    if (data.model) {
      if (!manualModel) setManualModel(data.model)
      if (!modelName)   setModelName(data.model)
      mark('model')
    }
    if (data.version && !version) { setVersion(data.version); mark('version') }

    // Anos
    if (data.manufactureYear && !year)      { setYear(String(data.manufactureYear));      mark('manufactureYear') }
    if (data.modelYear       && !yearModel) { setYearModel(String(data.modelYear));       mark('modelYear') }

    // Outros campos
    if (data.predominantColor && !color)       { setColor(data.predominantColor);  mark('color') }
    if (data.fuel             && !fuel)        { setFuel(data.fuel);                mark('fuel') }
    if (data.bodyType         && !bodyType)    { setBodyType(data.bodyType);        mark('bodyType') }
    if (data.power            && !power)       { setPower(data.power);              mark('power') }
    if (data.displacement     && !displacement){ setDisplacement(data.displacement);mark('displacement') }
    if (data.vehicleType) {
      setTipoVeiculo(data.vehicleType)
      mark('vehicleType')
    }

    setFieldSource((prev) => ({ ...prev, ...sourceMap }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSkipDocument = useCallback((_reason: string) => {
    setDocumentSkipped(true)
  }, [])

  // ── Sync FIPE quando ComboBox seleciona versão ────────────────────────────────
  useEffect(() => {
    if (combo.fipeValue != null) setFipeValue(numberToBRLMask(combo.fipeValue))
    if (combo.fipeCode)          setFipeCode(combo.fipeCode)
    if (combo.fipeMonth)         setFipeMonth(combo.fipeMonth)
    if (combo.fuel)              setFuel(combo.fuel)
    if (combo.modelYear)         setYear(combo.modelYear.toString())
    if (combo.brandName && combo.modelName) {
      // não sobrescrever se já foi preenchido por lookup
    }
  }, [combo.fipeValue, combo.fipeCode, combo.fipeMonth, combo.fuel, combo.modelYear, combo.brandName, combo.modelName])

  // ── Parsers ──────────────────────────────────────────────────────────────────
  // Reaproveita parseBRL do módulo central de máscaras (src/lib/masks.ts)
  const parseMoney = parseBRL

  // ── Salvar avaliação ──────────────────────────────────────────────────────────
  // Fluxo unificado: usa SEMPRE o mesmo registro criado em ensureDraft().
  //   1. Garante evaluationId (chama ensureDraft se ainda não existir).
  //   2. PATCH /api/evaluations/[id] — atualiza todos os campos editáveis.
  //   3. POST  /api/evaluations/[id]/finish — transiciona DRAFT → FINALIZED.
  //   4. Upload de documentos pendentes (idem fluxo anterior).
  //   5. Se APROVADO + canApprove → chama /approve legacy (promove a Vehicle).
  //   6. Redireciona para /estoque/avaliacao/[id]/inspecao (mesmo id).
  // O endpoint legacy /api/vehicles/evaluations (POST de criação) NÃO é mais
  // chamado — isso eliminava o registro duplicado.
  async function handleSave() {
    // Prioridade: seleção do combo → entrada manual → dado do lookup
    const brand = combo.brandName  || manualBrand  || lookupData?.brand  || ''
    const model = combo.modelName  || manualModel  || lookupData?.model  || ''

    if (!plate) { setError('Placa é obrigatória.'); return }
    if (!brand || !model) { setError('Marca e modelo são obrigatórios. Preencha na etapa Veículo (combo ou campos manuais).'); return }

    setSaving(true)
    setError('')
    try {
      // Garante o rascunho — caso o usuário pule etapas ou ensureDraft tenha
      // falhado anteriormente sem registro. Reaproveita a função idempotente.
      let id = evaluationId
      if (!id) {
        id = await ensureDraft()
        if (!id) {
          setError('Não foi possível criar a avaliação. Verifique os dados obrigatórios.')
          setSaving(false)
          return
        }
      }

      // Combina notes do avaliador com o ano modelo (que ainda não tem coluna
      // dedicada no schema). Mantém o dado sem perda enquanto a migration
      // futura não cria a coluna.
      const extraNotes: string[] = []
      if (yearModel) extraNotes.push(`[Ano Modelo] ${yearModel}`)
      if (opcionais.length) extraNotes.push(`[Opcionais] ${opcionais.join(', ')}`)
      const combinedNotes = [evaluationNotes, ...extraNotes].filter(Boolean).join('\n').trim() || null

      // PATCH — campos pertencentes ao whitelist do endpoint /api/evaluations/[id].
      // Campos de pricing são automaticamente filtrados pelo backend conforme RBAC.
      const patchBody = {
        plate:        plate  || null,
        chassi:       chassi || null,
        renavam:      renavam || null,
        brand,
        model,
        version:      version || combo.versionLabel || lookupData?.version || null,
        manufactureYear: year ? Number(year) : null,
        modelYear:    yearModel ? Number(yearModel) : (combo.modelYear ?? null),
        km:           km ? Number(km) : null,
        color:        color || null,
        fuel:         fuel || null,
        transmission: transmission || null,
        vehicleType:  combo.vehicleType || lookupData?.vehicleType || null,
        conditionType: conditionType || null,
        fipeCode:     fipeCode || combo.fipeCode || null,
        fipeReferenceMonth: fipeMonth || combo.fipeMonth || null,
        fipeValue:       parseMoney(fipeValue),
        evaluatedValue:  parseMoney(evaluatedValue),
        desiredValue:    parseMoney(desiredValue),
        minimumValue:    parseMoney(minimumValue),
        suggestedSalePrice: parseMoney(suggestedSale),
        cautelarStatus:  cautelarStatus || 'SEM_CAUTELAR',
        cautelarNumber:  cautelarNumber || null,
        cautelarNotes:   cautelarNotes  || null,
        ownerName:       ownerName  || null,
        ownerPhone:      ownerPhone || null,
        ownerCpf:        ownerCpf   || null,
        ownerEmail:      ownerEmail || null,
        evaluationNotes: combinedNotes,
      }

      const patchRes = await fetch(`/api/evaluations/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(patchBody),
      })
      const patchData = await patchRes.json().catch(() => ({}))
      if (!patchRes.ok) {
        setError(patchData?.error ?? 'Erro ao salvar dados da avaliação.')
        setSaving(false)
        return
      }

      // Upload dos documentos pendentes (Step 1) — mesmo comportamento anterior.
      if (pendingDocs.length > 0) {
        await Promise.all(
          pendingDocs.map(async (file) => {
            try {
              const fd = new FormData()
              fd.append('file', file)
              fd.append('section',  'DOCUMENTOS')
              fd.append('category', file.type === 'application/pdf' ? 'OUTRO' : 'FOTO')
              await fetch(`/api/evaluations/${id}/attachments`, {
                method: 'POST',
                body:   fd,
              })
            } catch { /* silent — segue o fluxo */ }
          }),
        )
        // Limpa a fila para não reenviar caso o usuário interaja novamente.
        setPendingDocs([])
      }

      // Transição de status: DRAFT → FINALIZED via /finish (validação mínima
      // server-side: plate + brand/model). Não bloqueia o fluxo se já estiver
      // FINALIZED ou se o backend reportar erro de transição não-fatal.
      const finishRes = await fetch(`/api/evaluations/${id}/finish`, { method: 'POST' })
      if (!finishRes.ok) {
        const fd = await finishRes.json().catch(() => ({}))
        // Se o erro for de validação, mostra mas mantém os dados salvos via PATCH.
        if (finishRes.status === 400) {
          setError(fd?.error ?? 'Avaliação salva, mas não pôde ser finalizada.')
        }
        // Em outros casos (403 de permissão, etc) também segue para inspeção.
      }

      setSavedId(id)
      setSuccess('saved')
      // Redireciona para a inspeção da MESMA avaliação.
      setTimeout(() => router.push(`/estoque/avaliacao/${id}/inspecao`), 1500)
    } catch (_) {
      setError('Erro de conexão.')
    } finally {
      setSaving(false)
    }
  }

  // ── Aprovar avaliação e criar veículo ────────────────────────────────────────
  async function handleApprove(evaluationId?: string) {
    const id = evaluationId ?? savedId
    if (!id) { setError('Salve a avaliação antes de aprovar.'); return }
    setApproving(true)
    setError('')
    try {
      const res  = await fetch(`/api/vehicles/evaluations/${id}/approve`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ stockType: 'PROPRIO', stockStatus: 'COMPRADO' }),
      })
      const data = await res.json()
      if (data.success) {
        setSuccess('approved')
        setTimeout(() => router.push(`/estoque/${data.data.vehicleId}`), 2000)
      } else {
        setError(data.error ?? 'Erro ao aprovar avaliação.')
      }
    } catch (_) {
      setError('Erro de conexão ao aprovar.')
    } finally {
      setApproving(false)
    }
  }

  // ── Guards ────────────────────────────────────────────────────────────────────
  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <ClipboardCheck className="h-14 w-14 text-gray-300 mb-4" />
        <h2 className="text-lg font-semibold text-gray-700">Sem permissão</h2>
        <p className="text-sm text-gray-400">Você não tem acesso ao módulo de avaliações.</p>
      </div>
    )
  }

  if (success === 'approved') {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
        <CheckCircle className="h-16 w-16 text-emerald-500" />
        <h2 className="text-xl font-bold text-emerald-700">Avaliação aprovada!</h2>
        <p className="text-sm text-gray-500">Veículo cadastrado no estoque com sucesso. Redirecionando...</p>
      </div>
    )
  }

  if (success === 'saved') {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
        <CheckCircle className="h-16 w-16 text-brand-500" />
        <h2 className="text-xl font-bold text-brand-700">Avaliação salva!</h2>
        <p className="text-sm text-gray-500">Redirecionando para a inspeção...</p>
        {savedId && canApprove && (
          <button
            onClick={() => handleApprove()}
            disabled={approving}
            className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
          >
            <FileCheck className="h-4 w-4" />
            {approving ? 'Cadastrando...' : 'Aprovar e cadastrar no estoque agora'}
          </button>
        )}
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 pb-20">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/estoque" className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Estoque
          </Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-xl font-bold text-gray-900">Fazer Avaliação</h1>
        </div>
      </div>

      {/* Aviso de fluxo obrigatório */}
      <div className="flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
        <Info className="h-5 w-5 shrink-0 text-brand-600 mt-0.5" />
        <p className="text-sm text-brand-700">
          <strong>Avaliação obrigatória.</strong> Todo veículo deve ser avaliado antes de entrar no estoque.
          Após salvar, você poderá aprovar e cadastrar automaticamente.
        </p>
      </div>

      {/* Step Bar */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm overflow-x-auto">
        <StepBar current={step} onNavigate={setStep} />
      </div>

      {/* Erro global */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Etapa 0 — Cliente (busca / cadastro rápido) ── */}
      {step === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col gap-6">
          <Section title="Quem é o cliente desta avaliação?" icon={<User className="h-5 w-5" />}>
            <StepCliente
              selected={customer}
              onSelect={(c) => {
                setCustomer(c)
                if (c) {
                  if (c.name)  setOwnerName(c.name)
                  if (c.phone) setOwnerPhone(c.phone)
                  if (c.cpf)   setOwnerCpf(c.cpf)
                  if (c.email) setOwnerEmail(c.email)
                }
              }}
            />
          </Section>

          <div className="flex justify-between border-t border-gray-100 pt-4">
            <Link href="/estoque" className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
              <ArrowLeft className="h-4 w-4" /> Cancelar
            </Link>
            <button
              type="button"
              disabled={!customer}
              onClick={() => setStep(1)}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Próxima etapa <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Etapa 1 — Veículo (consolidado: documentos + placa + dados) ── */}
      {step === 1 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col gap-6">

          {/* ──────────────────────────────────────────────────────────────────
              Document-first: upload do CRLV (preferencialmente PDF). O resto
              do formulário só libera após upload OU skip explícito.
          ────────────────────────────────────────────────────────────────── */}
          <StepDocumentoVeiculo
            evaluationId={evaluationId}
            onExtracted={handleExtracted}
            onSkip={handleSkipDocument}
            hasUploaded={documentUploaded}
            hasSkipped={documentSkipped}
          />

          {/* Card "Dados extraídos do documento" removido — feedback silencioso.
              Variáveis `extractedData`, `extractionSource`, `extractionConfidence`
              continuam sendo populadas pelo handleExtracted e os campos do
              formulário se preenchem automaticamente. */}

        {/* === Restante da etapa SEMPRE visível — sem gate de upload === */}
        <>

          {/* ──────────────────────────────────────────────────────────────────
              Placa (silencioso — sem aviso de consumo de API)
          ────────────────────────────────────────────────────────────────── */}
          <Section title="Placa do veículo" icon={<Car className="h-5 w-5" />}>
            <div className="max-w-md">
              <Field label="Placa" required hint="Digite a placa (formato XXX-XXXX antiga ou XXX1X23 Mercosul). Buscamos os dados automaticamente.">
                <PlateInput
                  value={plate}
                  onChange={(normal, display) => { setPlate(normal); setPlateDisplay(display) }}
                  onLookupResult={handleLookupResult}
                />
              </Field>
            </div>

            {/* Banner: se a API achou algo */}
            {lookupData && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 flex items-start gap-2">
                <CheckCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>Dados pré-preenchidos pela consulta de placa. Você pode revisar e corrigir abaixo.</span>
              </div>
            )}
          </Section>

          {/* ──────────────────────────────────────────────────────────────────
              Tipo de veículo (Carro / Moto / Caminhão) — horizontal
          ────────────────────────────────────────────────────────────────── */}
          <Section title="Tipo de veículo" icon={<Car className="h-5 w-5" />}>
            <div className="grid grid-cols-3 gap-2">
              {([
                { v: 'CARRO',    l: 'Carro',    icon: <Car className="h-5 w-5" /> },
                { v: 'MOTO',     l: 'Moto',     icon: <Car className="h-5 w-5" /> },
                { v: 'CAMINHAO', l: 'Caminhão', icon: <Car className="h-5 w-5" /> },
              ] as const).map(({ v, l, icon }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTipoVeiculo(v)}
                  className={`flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-medium transition-all ${
                    tipoVeiculo === v
                      ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-200'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-brand-300'
                  }`}
                >
                  {icon} {l}
                </button>
              ))}
            </div>
          </Section>

          {/* ──────────────────────────────────────────────────────────────────
              Marca + Modelo (combobox FIPE) + Ano + Ano modelo
          ────────────────────────────────────────────────────────────────── */}
          <Section title="Marca, modelo e ano" icon={<Car className="h-5 w-5" />}>
            <Grid cols={2}>
              <Field label="Marca" required hint={brandLoading ? 'Carregando marcas...' : `${fipeBrands.length} marcas`}>
                <select
                  className={selectCls}
                  value={brandCode}
                  onChange={(e) => {
                    const code = e.target.value
                    const found = fipeBrands.find((b) => b.code === code)
                    setBrandCode(code)
                    setBrandName(found?.name ?? '')
                  }}
                  disabled={brandLoading}
                >
                  <option value="">{brandLoading ? 'Carregando...' : 'Selecione a marca'}</option>
                  {fipeBrands.map((b) => (
                    <option key={b.code} value={b.code}>{b.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Modelo" required hint={modelLoading ? 'Carregando modelos...' : (brandCode ? `${fipeModels.length} modelos` : 'Selecione a marca primeiro')}>
                <select
                  className={selectCls}
                  value={modelCode}
                  onChange={(e) => {
                    const code = e.target.value
                    const found = fipeModels.find((m) => m.code === code)
                    setModelCode(code)
                    setModelName(found?.name ?? '')
                  }}
                  disabled={!brandCode || modelLoading}
                >
                  <option value="">
                    {!brandCode ? 'Aguardando marca' : modelLoading ? 'Carregando...' : 'Selecione o modelo'}
                  </option>
                  {fipeModels.map((m) => (
                    <option key={m.code} value={m.code}>{m.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Versão / Trim (opcional)">
                <input value={version} onChange={(e) => setVersion(e.target.value)} className={inputCls} placeholder="Ex: TSI 1.0 Flex Aut." />
              </Field>
              <Field label="Cor">
                <input value={color} onChange={(e) => setColor(e.target.value)} className={inputCls} placeholder="Prata" />
              </Field>
              <Field label="Ano Fabricação">
                <select className={selectCls} value={year} onChange={(e) => setYear(e.target.value)}>
                  <option value="">Selecione</option>
                  {ANOS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </Field>
              <Field label="Ano Modelo">
                <select className={selectCls} value={yearModel} onChange={(e) => setYearModel(e.target.value)}>
                  <option value="">Selecione</option>
                  {ANOS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </Field>
            </Grid>
          </Section>

          {/* ──────────────────────────────────────────────────────────────────
              Identificação: Renavam, Chassi
          ────────────────────────────────────────────────────────────────── */}
          <Section title="Identificação">
            <Grid cols={2}>
              <Field label="Renavam">
                <input
                  value={renavam}
                  onChange={(e) => setRenavam(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  className={inputCls + ' font-mono'}
                  placeholder="11 dígitos"
                  inputMode="numeric"
                />
              </Field>
              <Field label="Chassi">
                <input
                  value={chassi}
                  onChange={(e) => setChassi(e.target.value.toUpperCase().slice(0, 17))}
                  className={inputCls + ' font-mono'}
                  placeholder="17 caracteres"
                  maxLength={17}
                />
              </Field>
            </Grid>
          </Section>

          {/* ──────────────────────────────────────────────────────────────────
              Motor: Motorização / Potência (selects por tipo de veículo)
          ────────────────────────────────────────────────────────────────── */}
          <Section title="Motor">
            <Grid cols={2}>
              <Field
                label="Motorização"
                hint={
                  tipoVeiculo === 'MOTO'
                    ? 'Cilindrada em cc (50cc — 2.500cc+)'
                    : tipoVeiculo === 'CAMINHAO'
                      ? 'Cilindrada em cc (150cc — 1.000cc+)'
                      : 'Cilindrada em litros (1.0 — 6.0+)'
                }
              >
                <select className={selectCls} value={engine} onChange={(e) => setEngine(e.target.value)}>
                  <option value="">Selecione</option>
                  {getEngineOptions(tipoVeiculo).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </Field>
              <Field label="Potência" hint="Em cv (cavalo-vapor)">
                <select className={selectCls} value={power} onChange={(e) => setPower(e.target.value)}>
                  <option value="">Selecione</option>
                  {POWER_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </Field>
            </Grid>
          </Section>

          {/* ──────────────────────────────────────────────────────────────────
              Carroceria / Condição / Unidade
          ────────────────────────────────────────────────────────────────── */}
          <Section title="Categoria e operação">
            <Grid>
              <Field label="Tipo de carroceria" required>
                <select className={selectCls} value={bodyType} onChange={(e) => setBodyType(e.target.value)}>
                  <option value="">Selecione</option>
                  {TIPOS_CARROCERIA.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Combustível">
                <select className={selectCls} value={fuel} onChange={(e) => setFuel(e.target.value)}>
                  <option value="">Selecione</option>
                  <option>Flex</option><option>Gasolina</option><option>Etanol</option>
                  <option>Diesel</option><option>Elétrico</option><option>Híbrido</option><option>GNV</option>
                </select>
              </Field>
              <Field label="Câmbio">
                <select className={selectCls} value={transmission} onChange={(e) => setTransmission(e.target.value)}>
                  <option value="">Selecione</option>
                  <option>Manual</option><option>Automático</option><option>Automatizado</option>
                  <option>CVT</option><option>Semi-automático</option>
                </select>
              </Field>
              <Field label="Quilometragem (KM)" required>
                <input
                  type="text"
                  inputMode="numeric"
                  value={maskKM(km)}
                  onChange={(e) => setKm(String(parseKM(e.target.value) ?? ''))}
                  className={inputCls}
                  placeholder="45.000"
                />
              </Field>
              <Field label="Condição" required>
                <select className={selectCls} value={conditionType} onChange={(e) => setConditionType(e.target.value)}>
                  <option value="">Selecione</option>
                  <option value="ZERO_KM">0 km</option>
                  <option value="SEMINOVO">Seminovo</option>
                  <option value="USADO">Usado</option>
                </select>
              </Field>
              <Field label="Unidade que está avaliando" required hint="O veículo ficará vinculado a esta unidade.">
                <select className={selectCls} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                  <option value="">Selecione a unidade</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </Field>
            </Grid>
          </Section>

          {/* ──────────────────────────────────────────────────────────────────
              Hint quando a marca/modelo da API não está no catálogo FIPE
          ────────────────────────────────────────────────────────────────── */}
          {(lookupData?.brand || lookupData?.model) && (!brandCode || !modelCode) && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <strong>API retornou:</strong>{' '}
              {lookupData?.brand && <span>marca <em>&quot;{lookupData.brand}&quot;</em></span>}
              {lookupData?.brand && lookupData?.model && <span> · </span>}
              {lookupData?.model && <span>modelo <em>&quot;{lookupData.model}&quot;</em></span>}
              .{' '}
              {!brandCode && 'Não encontramos correspondência exata no catálogo FIPE — selecione manualmente ou siga com o texto retornado.'}
            </div>
          )}

          {/* ──────────────────────────────────────────────────────────────────
              FIPE compacta (etapa Veículo) — exibe a FIPE escolhida pelo lookup.
              O usuário não precisa mais ir para a etapa "FIPE / Preços" só para
              ver o valor.
          ────────────────────────────────────────────────────────────────── */}
          {(fipeCode || fipeValue) && (
            <Section title="FIPE detectada" icon={<DollarSign className="h-5 w-5" />}>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-4 py-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-emerald-700">Valor FIPE</p>
                  <p className="text-base font-bold text-emerald-800">{fipeValue ? `R$ ${fipeValue}` : '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-emerald-700">Código FIPE</p>
                  <p className="font-mono text-sm text-emerald-900">{fipeCode || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-emerald-700">Mês ref.</p>
                  <p className="text-sm text-emerald-900">{fipeMonth || '—'}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-emerald-700">Status</p>
                  <p className="text-sm text-emerald-900">{fipeCode ? 'Auto-preenchida' : 'Pendente'}</p>
                </div>
              </div>
              {!fipeCode && (
                <p className="text-xs text-gray-500 mt-2">
                  FIPE não detectada automaticamente. Você pode informar manualmente na próxima etapa.
                </p>
              )}
            </Section>
          )}

          {/* ──────────────────────────────────────────────────────────────────
              Opcionais do veículo (chips multi-select)
          ────────────────────────────────────────────────────────────────── */}
          <Section title="Opcionais">
            <div className="flex flex-wrap gap-2">
              {[
                'Ar Condicionado', 'Air Bag', 'Trio elétrico', 'Direção Hidráulica',
                'Direção Elétrica', 'Freio ABS', 'Turbo', 'Blindado', '7 Lugares',
                'Farol de Neblina', 'Teto Solar', 'Sensor de estacionamento',
                'Câmera de ré', 'Multimídia', 'Banco de couro',
                'Controle de estabilidade', 'Controle de tração', 'Chave presencial',
                'Outros',
              ].map((opt) => {
                const active = opcionais.includes(opt)
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setOpcionais((arr) => active ? arr.filter((x) => x !== opt) : [...arr, opt])}
                    className={[
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      active
                        ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-200'
                        : 'border-gray-300 bg-white text-gray-600 hover:border-brand-300',
                    ].join(' ')}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
          </Section>

          {/* ──────────────────────────────────────────────────────────────────
              Observações (último)
          ────────────────────────────────────────────────────────────────── */}
          <Section title="Observações">
            <Field label="Observações sobre o veículo (opcional)">
              <textarea
                value={evaluationNotes}
                onChange={(e) => setEvaluationNotes(e.target.value)}
                className={inputCls + ' min-h-[88px] resize-y'}
                placeholder="Histórico, detalhes técnicos, particularidades do veículo, etc."
              />
            </Field>
          </Section>

        </>
        {/* Bloco de gate "subir documento ou pular" removido — formulário
            sempre visível. O documento e a consulta por placa servem apenas
            como pré-preenchimento opcional. */}

          {/* ──────────────────────────────────────────────────────────────────
              Navegação
          ────────────────────────────────────────────────────────────────── */}
          <div className="flex justify-between border-t border-gray-100 pt-4">
            <Link
              href="/estoque"
              className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              <ArrowLeft className="h-4 w-4" /> Cancelar
            </Link>
            <button
              type="button"
              disabled={!documentUploaded || !plate || !(brandName || manualBrand || lookupData?.brand) || !(modelName || manualModel || lookupData?.model) || !unitId || !conditionType || autoSavingDraft}
              title={!documentUploaded ? 'CRLV obrigatório — envie o documento do veículo antes de prosseguir.' : ''}
              onClick={async () => {
                // Persiste manualBrand/manualModel a partir das combos FIPE
                // selecionadas. Quando o catálogo FIPE não casou (brandName
                // vazio), mantemos o que veio do lookup para não perder o dado.
                if (brandName) setManualBrand(brandName)
                else if (lookupData?.brand && !manualBrand) setManualBrand(lookupData.brand)
                if (modelName) setManualModel(modelName)
                else if (lookupData?.model && !manualModel) setManualModel(lookupData.model)
                // Mantém o objeto combo sincronizado para uso na etapa FIPE
                setCombo((c) => ({
                  ...c,
                  brandCode, brandName, modelCode, modelName,
                  modelYear: yearModel ? Number(yearModel) : null,
                }))
                // Cria RASCUNHO no backend para habilitar EvaluationSections / CautelarUploader
                const id = await ensureDraft()
                if (!id) return  // erro já exibido
                // Fluxo novo: Veículo → Avaliação → Cautelar → Resumo
                setStep(5)
              }}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {autoSavingDraft ? 'Salvando rascunho...' : 'Próxima etapa'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Etapas 2 e 3 (legado) — removidas da navegação. Step 2 era "Veículo"
          unificado; Step 3 era "FIPE / Preços" agora suprimido a pedido do
          operador. Mantemos um fallback que redireciona para a próxima ativa. */}
      {(step === 2 || step === 3) && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col gap-4">
          <p className="text-sm text-gray-600">Redirecionando para a próxima etapa...</p>
          <button
            type="button"
            onClick={() => setStep(4)}
            className="self-start flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Continuar <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Etapa 3 — FIPE / Preços ── REMOVIDA do fluxo do avaliador.
          A FIPE continua sendo consultada automaticamente pela API placas
          (state `fipeCode`/`fipeValue` populado por handleLookupResult e
          enviado no payload). A precificação (valor avaliado / mínimo /
          sugerido / desejado) é feita pelo gerente APÓS o envio da
          avaliação para aprovação — não aparece mais no wizard.
          Helpers `handleFipeComplete`, `FipeWizard`, mini-chart continuam
          disponíveis caso queiramos reintroduzir num drawer "Ver FIPE". */}

      {/* ── Etapa 4 — Cautelar ── */}
      {step === 4 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col gap-6">
          <Section title="Cautelar / Perícia" icon={<ShieldCheck className="h-5 w-5" />}>
            <Field label="Status da Cautelar" required>
              <div className="flex flex-wrap gap-2">
                {[
                  { v: 'SEM_CAUTELAR',    l: 'Sem Cautelar',    active: 'border-gray-400 bg-gray-100 text-gray-800 ring-gray-300' },
                  { v: 'PENDENTE',        l: 'Pendente',        active: 'border-amber-400 bg-amber-50 text-amber-800 ring-amber-300' },
                  { v: 'APROVADA',        l: 'Aprovada',        active: 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-emerald-300' },
                  { v: 'REPROVADA',       l: 'Reprovada',       active: 'border-red-500 bg-red-50 text-red-800 ring-red-300' },
                  { v: 'COM_APONTAMENTO', l: 'Com Apontamento', active: 'border-orange-500 bg-orange-50 text-orange-800 ring-orange-300' },
                ].map(({ v, l, active }) => {
                  const selected = cautelarStatus === v
                  return (
                    <button
                      key={v} type="button"
                      onClick={() => setCautelarStatus(v)}
                      className={[
                        'rounded-lg border-2 px-4 py-2 text-sm font-medium transition-colors',
                        selected ? `${active} ring-2 ring-offset-1` : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50',
                      ].join(' ')}
                    >
                      {l}
                    </button>
                  )
                })}
              </div>
            </Field>
            <Grid cols={2}>
              <Field label="Número do Laudo / Cautelar">
                <input value={cautelarNumber} onChange={(e) => setCautelarNumber(e.target.value)} className={inputCls} placeholder="Número do documento" />
              </Field>
            </Grid>
            <Field label="Apontamentos / Observações">
              <textarea value={cautelarNotes} onChange={(e) => setCautelarNotes(e.target.value)} rows={3} className={inputCls + ' resize-none'} placeholder="Descreva os apontamentos encontrados na cautelar..." />
            </Field>
          </Section>

          {/* Anexos do Laudo Cautelar (PDF/imagem) — habilitado após criar rascunho */}
          <div className="border-t border-gray-100 pt-4">
            {evaluationId ? (
              <CautelarUploader
                evaluationId={evaluationId}
                existingFiles={cautelarFiles}
                onChange={refreshCautelar}
              />
            ) : (
              <p className="text-xs text-gray-400 italic">
                Os anexos do laudo cautelar ficarão disponíveis assim que o rascunho da avaliação for criado.
              </p>
            )}
          </div>

          {/* Cautelar é PÓS avaliação no novo fluxo: anterior = Avaliação (5), próxima = Resumo (6) */}
          <div className="flex justify-between pt-2">
            <button type="button" onClick={() => setStep(5)} className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              <ArrowLeft className="h-4 w-4" /> Voltar à avaliação
            </button>
            <button type="button" onClick={() => setStep(6)} className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors">
              Ir para resumo <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Etapa 5 — Avaliação por seções (sectional checklist) ── */}
      {step === 5 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col gap-6">
          <Section title="Avaliação por seções" icon={<ClipboardCheck className="h-5 w-5" />}>
            {evaluationId ? (
              <EvaluationSections
                evaluationId={evaluationId}
                evaluationStatus={evalStatus}
                reopenCount={evalReopenCount}
                onBack={() => setStep(1)}
                onComplete={() => setStep(4)}
              />
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Conclua a etapa &quot;Veículo&quot; para iniciar a avaliação por seções.
              </div>
            )}
          </Section>
          {/* Navegação fica DENTRO de EvaluationSections (Anterior seção / Próxima seção / Concluir avaliação) */}
        </div>
      )}

      {/* ── Etapa 6 — Resultado / Enviar para aprovação ── */}
      {step === 6 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col gap-6">
          <Section title="Enviar para aprovação" icon={<FileCheck className="h-5 w-5" />}>
            <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
              Revise os dados e envie a avaliação para o gerente. O gerente fará a precificação
              (valor avaliado, mínimo, sugerido) e liberará o resultado de volta para você.
            </div>

            <Field label="Observações finais (opcional)">
              <textarea
                value={evaluationNotes}
                onChange={(e) => setEvaluationNotes(e.target.value)}
                rows={4}
                className={inputCls + ' resize-none'}
                placeholder="Registre detalhes, pendências, condições da avaliação..."
              />
            </Field>

            {/* Resumo antes de enviar */}
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Resumo da avaliação</p>
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <div><span className="text-xs text-gray-400">Placa</span><p className="font-mono font-bold">{plateDisplay || plate || '—'}</p></div>
                <div><span className="text-xs text-gray-400">Marca/Modelo</span><p className="font-medium">{(combo.brandName || manualBrand || lookupData?.brand || '—')} {(combo.modelName || manualModel || lookupData?.model || '')}</p></div>
                <div><span className="text-xs text-gray-400">Ano</span><p className="font-medium">{year || '—'}</p></div>
                <div><span className="text-xs text-gray-400">KM</span><p className="font-medium">{km ? Number(km).toLocaleString('pt-BR') + ' km' : '—'}</p></div>
                <div><span className="text-xs text-gray-400">FIPE</span><p className="font-medium">{fipeValue ? `R$ ${Number(fipeValue).toLocaleString('pt-BR')}` : '—'}</p></div>
                <div><span className="text-xs text-gray-400">Cliente</span><p className="font-medium">{customer?.name ?? ownerName ?? '—'}</p></div>
              </div>
            </div>
          </Section>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button type="button" onClick={() => setStep(4)} className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
              <ArrowLeft className="h-4 w-4" /> Voltar à cautelar
            </button>

            <div className="flex flex-wrap gap-3">
              {/* Cancelar avaliação — gerente+ apenas */}
              {canApprove && evaluationId && (
                <button
                  type="button"
                  disabled={saving || approving}
                  onClick={async () => {
                    const motivo = prompt('Informe o motivo do cancelamento:')
                    if (!motivo || !motivo.trim()) return
                    try {
                      const r = await fetch(`/api/evaluations/${evaluationId}/cancel`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ reason: motivo.trim() }),
                      })
                      const d = await r.json()
                      if (!r.ok) { setError(d?.error ?? 'Falha ao cancelar.'); return }
                      router.push('/estoque')
                    } catch { setError('Erro de conexão ao cancelar.') }
                  }}
                  className="flex items-center gap-2 rounded-lg border border-red-300 bg-white px-5 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 transition-colors"
                >
                  <XCircle className="h-4 w-4" /> Cancelar avaliação
                </button>
              )}

              {/* Botão único — enviar para aprovação */}
              <button
                type="button"
                disabled={saving || approving}
                onClick={async () => {
                  setSaving(true)
                  setError('')
                  try {
                    // garantir rascunho e PATCH atualizado primeiro
                    let id = evaluationId
                    if (!id) {
                      id = await ensureDraft()
                      if (!id) { setSaving(false); return }
                    }
                    // PATCH dos dados editáveis (mesmo handleSave faz isto, mas
                    // aqui só precisamos garantir observações + status)
                    await fetch(`/api/evaluations/${id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ evaluationNotes }),
                    }).catch(() => {})

                    const r = await fetch(`/api/evaluations/${id}/submit-for-approval`, { method: 'POST' })
                    const d = await r.json()
                    if (!r.ok) {
                      setError(d?.error ?? 'Falha ao enviar para aprovação.')
                      setSaving(false)
                      return
                    }
                    setSuccess('saved')
                    setTimeout(() => router.push(`/estoque/avaliacao/${id}/inspecao`), 1200)
                  } catch {
                    setError('Erro de conexão.')
                  } finally {
                    setSaving(false)
                  }
                }}
                className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
              >
                <FileCheck className="h-4 w-4" />
                {saving ? 'Enviando...' : 'Enviar para aprovação'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Export com Suspense (useSearchParams requer boundary) ──────────────────────

export default function AvaliacaoPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-96 rounded-xl bg-gray-100" />}>
      <AvaliacaoForm />
    </Suspense>
  )
}
