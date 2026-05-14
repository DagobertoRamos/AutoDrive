// =============================================================================
// CNPJ Lookup — Tipos e interfaces
// =============================================================================

export interface CompanyAddress {
  cep:         string
  logradouro:  string
  numero:      string
  complemento: string
  bairro:      string
  cidade:      string
  estado:      string
}

export interface CompanyLookupData {
  cnpj:                    string   // normalizado, 14 dígitos
  razaoSocial:             string
  nomeFantasia:            string
  inscricaoEstadual:       string
  isentoInscricaoEstadual: boolean
  situacaoCadastral:       string   // "ATIVA" | "INAPTA" | "BAIXADA" | "SUSPENSA" | ""
  dataAbertura:            string   // "YYYY-MM-DD" ou ""
  cnaePrincipal:           string   // ex: "4511-1/01"
  telefone:                string
  email:                   string
  address:                 CompanyAddress
  raw?:                    Record<string, unknown>  // payload bruto — nunca retornar ao frontend
}

export interface CompanyLookupResult {
  success:     boolean
  found:       boolean
  duplicated?: boolean
  source?:     string
  data?:       CompanyLookupData
  message?:    string
  error?:      string
}

/**
 * Interface do adapter — qualquer provedor deve implementar este contrato.
 */
export interface CompanyLookupProvider {
  readonly name: string
  lookupByCNPJ(cnpj: string): Promise<CompanyLookupResult>
}
