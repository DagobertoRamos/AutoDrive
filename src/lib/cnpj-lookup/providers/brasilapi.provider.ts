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
import { getCnpj as getCnpjFromService } from '@/lib/brasilapi/service'

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
    // Delega ao service central, que resolve a baseUrl via IntegrationCredential
    // (ou env, ou default) e centraliza cache + tratamento de erros.
    // Importante: o service NÃO lança exceção e SEMPRE retorna .ok com error
    // ou data — então nunca vamos travar a consulta aqui.
    const res = await getCnpjFromService(cnpj)

    if (!res.ok) {
      // Distingue 404 (CNPJ não existe na Receita) de erro técnico (timeout/URL/etc).
      const isNotFound = /não encontrado/i.test(res.error ?? '')
      if (isNotFound) {
        return {
          success: true, found: false, source: 'brasilapi',
          message: 'CNPJ não encontrado na base da Receita Federal.',
        }
      }
      return {
        success: false, found: false, source: 'brasilapi',
        error: res.error ?? 'Não foi possível consultar o CNPJ neste momento. Preencha manualmente.',
      }
    }

    const d = res.data!

    // Extrai endereço
    const cep         = String(d.cep         ?? '').replace(/\D/g, '')
    const logradouro  = String(d.logradouro  ?? '').trim()
    const numero      = String(d.numero      ?? '').trim()
    const complemento = String(d.complemento ?? '').trim()
    const bairro      = String(d.bairro      ?? '').trim()
    const cidade      = String(d.municipio   ?? '').trim()
    const estado      = normalizeState(d.uf)

    // BrasilAPI retorna dados em estrutura conhecida (CnpjData), mas algumas
    // chaves variam por versão (ddd_telefone_1 vs telefone, cnae_fiscal etc).
    // Cast `unknown` antes para evitar erro TS2352 de overlap insuficiente.
    const dRaw = d as unknown as Record<string, unknown>

    const telefone = String(
      dRaw.ddd_telefone_1 ??
      dRaw.telefone ??
      '',
    ).replace(/\D/g, '').slice(0, 11)

    const email = String(d.email ?? '').toLowerCase().trim()

    // CNAE principal
    const cnae = dRaw.cnae_fiscal
      ? String(dRaw.cnae_fiscal)
      : String(d.cnae_fiscal_descricao ?? '')

    const data: import('../types').CompanyLookupData = {
      cnpj,
      razaoSocial:             String(d.razao_social  ?? '').trim(),
      nomeFantasia:            String(d.nome_fantasia ?? '').trim(),
      inscricaoEstadual:       '',   // BrasilAPI v1 não expõe IE
      isentoInscricaoEstadual: false,
      situacaoCadastral:       normalizeSituacao(d.descricao_situacao_cadastral),
      dataAbertura:            normalizeDate(d.data_inicio_atividade),
      cnaePrincipal:           cnae,
      telefone,
      email,
      address: { cep, logradouro, numero, complemento, bairro, cidade, estado },
      raw: dRaw,  // salvo internamente, nunca retornado ao frontend
    }

    return { success: true, found: true, source: 'brasilapi', data }
  },
}
