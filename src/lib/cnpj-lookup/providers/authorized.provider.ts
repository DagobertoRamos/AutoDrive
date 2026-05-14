// =============================================================================
// AuthorizedProvider — provedor configurável via variáveis de ambiente
//
// Use este provider quando você contratar uma API autorizada de dados
// cadastrais (ex: Receita WS, SERPRO Consulta CNPJ, ou equivalente).
//
// Configure:
//   CNPJ_LOOKUP_API_URL=https://sua-api.com/cnpj
//   CNPJ_LOOKUP_API_KEY=sua-chave-secreta
//
// Se não configurado, retorna gracefully (found: false).
// NUNCA expõe a API key ao frontend.
// =============================================================================

import type { CompanyLookupProvider, CompanyLookupResult } from '../types'

const API_URL = process.env.CNPJ_LOOKUP_API_URL ?? ''
const API_KEY = process.env.CNPJ_LOOKUP_API_KEY ?? ''
const TIMEOUT = Number(process.env.CNPJ_LOOKUP_TIMEOUT_MS ?? 8000)

export const AuthorizedCNPJProvider: CompanyLookupProvider = {
  name: 'authorized',

  async lookupByCNPJ(cnpj: string): Promise<CompanyLookupResult> {
    // Retorna gracefully se não configurado
    if (!API_URL || !API_KEY) {
      return { success: true, found: false, source: 'authorized', message: 'Provedor autorizado não configurado.' }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT)

    try {
      const url = `${API_URL}?cnpj=${cnpj}`
      const res = await fetch(url, {
        signal:  controller.signal,
        headers: {
          'Accept':        'application/json',
          'Authorization': `Bearer ${API_KEY}`,
        },
      })

      if (res.status === 404) {
        return { success: true, found: false, source: 'authorized' }
      }

      if (!res.ok) {
        return { success: false, found: false, source: 'authorized', error: 'Provedor autorizado retornou erro.' }
      }

      const d = await res.json()

      // Mapeia o formato genérico — adapte conforme o provedor real
      const data: import('../types').CompanyLookupData = {
        cnpj,
        razaoSocial:             String(d.razao_social      ?? d.razaoSocial      ?? '').trim(),
        nomeFantasia:            String(d.nome_fantasia     ?? d.nomeFantasia     ?? '').trim(),
        inscricaoEstadual:       String(d.inscricao_estadual ?? d.inscricaoEstadual ?? '').trim(),
        isentoInscricaoEstadual: Boolean(d.isento_ie ?? d.isentoIE ?? false),
        situacaoCadastral:       String(d.situacao_cadastral ?? d.situacaoCadastral ?? '').toUpperCase().trim(),
        dataAbertura:            String(d.data_abertura     ?? d.dataAbertura     ?? '').trim(),
        cnaePrincipal:           String(d.cnae              ?? d.cnae_principal   ?? '').trim(),
        telefone:                String(d.telefone          ?? '').replace(/\D/g, '').slice(0, 11),
        email:                   String(d.email             ?? '').toLowerCase().trim(),
        address: {
          cep:         String(d.cep         ?? '').replace(/\D/g, ''),
          logradouro:  String(d.logradouro  ?? d.endereco ?? '').trim(),
          numero:      String(d.numero      ?? '').trim(),
          complemento: String(d.complemento ?? '').trim(),
          bairro:      String(d.bairro      ?? '').trim(),
          cidade:      String(d.municipio   ?? d.cidade ?? '').trim(),
          estado:      String(d.uf          ?? d.estado ?? '').toUpperCase().trim().slice(0, 2),
        },
        raw: d,
      }

      return { success: true, found: true, source: 'authorized', data }

    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') {
        return { success: false, found: false, source: 'authorized', error: 'Timeout na consulta ao provedor autorizado.' }
      }
      return { success: false, found: false, source: 'authorized', error: 'Erro ao consultar provedor autorizado.' }
    } finally {
      clearTimeout(timeout)
    }
  },
}
