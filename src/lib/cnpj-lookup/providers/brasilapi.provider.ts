// =============================================================================
// BrasilAPI CNPJ Provider
//
// Fonte: https://brasilapi.com.br/api/cnpj/v1/{cnpj}
// Dados: Receita Federal (públicos, legais, LGPD adequados para uso B2B)
// Termos: https://brasilapi.com.br — uso gratuito, sem necessidade de chave
//
// IMPORTANTE: este provider acessa APENAS dados públicos da Receita Federal.
// Não há acesso a dados protegidos por LGPD sem consentimento.
// O CNPJ e a situação cadastral são dados públicos por natureza jurídica.
// =============================================================================

import type { CompanyLookupProvider, CompanyLookupResult } from '../types'

const BRASILAPI_BASE = process.env.BRASILAPI_URL ?? 'https://brasilapi.com.br/api'
const TIMEOUT_MS = Number(process.env.CNPJ_LOOKUP_TIMEOUT_MS ?? 8000)

// ── Normalização de resposta da BrasilAPI ─────────────────────────────────────

function normalizeState(uf: unknown): string {
  return String(uf ?? '').toUpperCase().trim().slice(0, 2)
}

function normalizeDate(dateStr: unknown): string {
  if (!dateStr) return ''
  const s = String(dateStr)
  // BrasilAPI retorna "YYYY-MM-DD" ou "DD/MM/YYYY"
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split('/')
    return `${y}-${m}-${d}`
  }
  return ''
}

function normalizeSituacao(situacao: unknown): string {
  const s = String(situacao ?? '').toUpperCase().trim()
  const map: Record<string, string> = {
    'ATIVA': 'ATIVA',
    'INAPTA': 'INAPTA',
    'BAIXADA': 'BAIXADA',
    'SUSPENSA': 'SUSPENSA',
    'NULA': 'NULA',
  }
  return map[s] ?? s
}

// ── Provider ──────────────────────────────────────────────────────────────────

export const BrasilAPIProvider: CompanyLookupProvider = {
  name: 'brasilapi',

  async lookupByCNPJ(cnpj: string): Promise<CompanyLookupResult> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const url = `${BRASILAPI_BASE}/cnpj/v1/${cnpj}`
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 0 },  // sempre busca dados frescos
      })

      if (res.status === 404) {
        return { success: true, found: false, source: 'brasilapi', message: 'CNPJ não encontrado na base da Receita Federal.' }
      }

      if (!res.ok) {
        return {
          success: false,
          found:   false,
          source:  'brasilapi',
          error:   `Serviço de consulta de CNPJ retornou erro ${res.status}. Preencha manualmente.`,
        }
      }

      const d = await res.json()

      // Extrai endereço
      const cep         = String(d.cep                         ?? '').replace(/\D/g, '')
      const logradouro  = String(d.logradouro                  ?? '').trim()
      const numero      = String(d.numero                      ?? '').trim()
      const complemento = String(d.complemento                 ?? '').trim()
      const bairro      = String(d.bairro                      ?? '').trim()
      const cidade      = String(d.municipio                   ?? '').trim()
      const estado      = normalizeState(d.uf)

      // Extrai telefone (BrasilAPI traz array de qsa e telefone como string)
      const telefone = String(d.telefone ?? '').replace(/\D/g, '').slice(0, 11)
      const email    = String(d.email    ?? '').toLowerCase().trim()

      // CNAE principal
      const cnae = d.cnae_fiscal
        ? String(d.cnae_fiscal)
        : String(d.cnae_fiscal_descricao ?? '')

      const data: import('../types').CompanyLookupData = {
        cnpj,
        razaoSocial:             String(d.razao_social      ?? '').trim(),
        nomeFantasia:            String(d.nome_fantasia     ?? '').trim(),
        inscricaoEstadual:       '',   // BrasilAPI não expõe IE
        isentoInscricaoEstadual: false,
        situacaoCadastral:       normalizeSituacao(d.descricao_situacao_cadastral),
        dataAbertura:            normalizeDate(d.data_inicio_atividade),
        cnaePrincipal:           cnae,
        telefone,
        email,
        address: { cep, logradouro, numero, complemento, bairro, cidade, estado },
        raw: d,  // salvo internamente, nunca retornado ao frontend
      }

      return { success: true, found: true, source: 'brasilapi', data }

    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') {
        return {
          success: false, found: false, source: 'brasilapi',
          error: 'Tempo limite de consulta excedido. Preencha manualmente.',
        }
      }
      return {
        success: false, found: false, source: 'brasilapi',
        error: 'Não foi possível consultar o CNPJ neste momento. Preencha manualmente.',
      }
    } finally {
      clearTimeout(timeout)
    }
  },
}
