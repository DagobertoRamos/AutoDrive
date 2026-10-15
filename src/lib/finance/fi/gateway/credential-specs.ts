// =============================================================================
// Campos de acesso que cada conector OFICIAL pede à loja (BYOC). Arquivo puro,
// usado pela tela de credenciais (cliente) e pela validação no servidor.
// Os valores vão cifrados para FinanceCredential.secretsEncrypted.
// =============================================================================

export interface CredentialFieldSpec {
  key: string
  label: string
  help?: string
  /** Fica oculto na tela (cifrado sempre; secret = só não exibe o valor). */
  secret?: boolean
  /** Arquivo lido no navegador e guardado em base64 (ex.: certificado .pfx). */
  file?: { accept: string }
  optional?: boolean
}

export interface CredentialSpec {
  /** Texto curto exibido no topo do formulário. */
  intro: string
  fields: CredentialFieldSpec[]
  /** Este banco avisa o andamento por webhook (mostra URL e chave à loja). */
  webhook?: boolean
}

export const CREDENTIAL_SPECS: Record<string, CredentialSpec> = {
  bv: {
    intro: 'Dados entregues pelo BV ao credenciar a loja como parceira F&I (portal BV Open). Em homologação o próprio BV assina o certificado.',
    webhook: true,
    fields: [
      { key: 'clientId', label: 'Client ID', help: 'Identificador da aplicação no portal BV Open (Developer Portal).' },
      { key: 'clientSecret', label: 'Client Secret', secret: true, help: 'Segredo da aplicação no portal BV Open.' },
      { key: 'certPfx', label: 'Certificado mTLS (.pfx)', file: { accept: '.pfx,.p12' }, help: 'Certificado da loja (ICP-Brasil v10 ou GlobalSign em produção; assinado pelo BV em homologação).' },
      { key: 'certSenha', label: 'Senha do certificado', secret: true, optional: true },
      { key: 'codigoParceiro', label: 'Código do parceiro comercial', help: 'Código da loja junto ao BV (commercialPartner).' },
      { key: 'canal', label: 'Código do canal (automóveis)', help: 'Código de canal fornecido pelo BV, terminado em VL. Ex.: XXXXXXVL.' },
      { key: 'canalMoto', label: 'Código do canal (motos)', optional: true, help: 'Terminado em MT. Só se a loja financia motos.' },
      { key: 'loginUsuario', label: 'Login do lojista no BV', help: 'Usuário da loja nos sistemas do BV (DSLogin).' },
      { key: 'urlBase', label: 'URL da API (produção)', optional: true, help: 'Informada pelo BV na liberação de produção. Em homologação fica em branco.' },
    ],
  },
}

export const credentialSpecFor = (adapterKey: string | null | undefined): CredentialSpec | null =>
  (adapterKey && CREDENTIAL_SPECS[adapterKey]) || null

/** Chaves aceitas como "extra" na credencial (além das genéricas). */
export const EXTRA_CREDENTIAL_KEYS = new Set(Object.values(CREDENTIAL_SPECS).flatMap((s) => s.fields.map((f) => f.key)))
