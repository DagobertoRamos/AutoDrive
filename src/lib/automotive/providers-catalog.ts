// =============================================================================
// Catálogo de provedores INDICADOS às lojas (pesquisa de 2026-10). A loja
// contrata o provedor e conecta a própria conta (BYOC); o AutoDrive não
// revende nem detém credencial. Cada entrada diz o que cobre e como conecta:
//   API      → conector próprio implementado (endpoints documentados do provedor)
//   PARCEIRO → API sob contrato: usa o Conector AutoDrive (docs/integracoes/
//              conector-autodrive.md) com o endereço e a chave que o provedor fornecer
//   MANUAL   → a loja opera no portal do provedor e registra protocolo/XML aqui
// Status de credenciamento é o declarado pelo provedor — a loja confirma.
// =============================================================================

export type ConnectorDomain = 'RENAVE' | 'FISCAL' | 'TRANSFER' | 'VEHICLE_DATA'
export type IntegrationMode = 'API' | 'PARCEIRO' | 'MANUAL'

export interface CredentialField {
  key: string
  label: string
  secret?: boolean
  required?: boolean
  help?: string
}

export interface ProviderEntry {
  id: string
  domain: ConnectorDomain
  name: string
  site?: string
  docsUrl?: string
  covers: string[]
  mode: IntegrationMode
  recommended?: boolean
  fields: CredentialField[]
  environments: ('HOMOLOGACAO' | 'PRODUCAO')[]
  /** Uma linha, para o "?" do cartão. */
  note?: string
}

const PARTNER_FIELDS: CredentialField[] = [
  { key: 'baseUrl', label: 'Endereço da API', required: true, help: 'Fornecido pela integradora ao contratar o acesso por API.' },
  { key: 'apiKey', label: 'Chave de acesso', secret: true, required: true },
  { key: 'webhookSecret', label: 'Segredo do webhook', secret: true, help: 'Usado para conferir os avisos que a integradora envia ao AutoDrive.' },
]

const BOTH: ('HOMOLOGACAO' | 'PRODUCAO')[] = ['HOMOLOGACAO', 'PRODUCAO']

export const PROVIDERS: ProviderEntry[] = [
  // ── RENAVE (Res. Contran 1.026/2026: toda operação passa por integradora autorizada) ──
  { id: 'MANUAL', domain: 'RENAVE', name: 'Portal da integradora', covers: ['Entrada', 'Saída', 'Transferência entre lojas'], mode: 'MANUAL', fields: [], environments: ['PRODUCAO'], note: 'A loja registra no portal da integradora e informa o protocolo aqui.' },
  { id: 'INTEGRARENAVE', domain: 'RENAVE', name: 'IntegraRenave', site: 'https://integrarenave.com', covers: ['Entrada', 'Saída', 'Transferência entre lojas'], mode: 'PARCEIRO', recommended: true, fields: PARTNER_FIELDS, environments: BOTH, note: 'Declara API REST para sistemas de gestão. Peça acesso por API ao contratar.' },
  { id: 'RENAVE_FACIL', domain: 'RENAVE', name: 'Renave Fácil', site: 'https://renavefacil.net', covers: ['Entrada', 'Saída', 'Transferência entre lojas'], mode: 'PARCEIRO', recommended: true, fields: PARTNER_FIELDS, environments: BOTH, note: 'Declara API RESTful para DMS, conectada ao Renave-WS do Serpro.' },
  { id: 'TRILLIA_B3', domain: 'RENAVE', name: 'Trillia (B3)', site: 'https://www.trilliab3.com.br', covers: ['Entrada', 'Saída', 'NF-e'], mode: 'PARCEIRO', recommended: true, fields: PARTNER_FIELDS, environments: BOTH, note: 'Integradora do ecossistema B3 com API para clientes.' },
  { id: 'RENAVIX', domain: 'RENAVE', name: 'Renavix', site: 'https://www.renavix.com.br', covers: ['Entrada', 'Saída', 'ATPV-e', 'Transferência'], mode: 'PARCEIRO', fields: PARTNER_FIELDS, environments: BOTH },
  { id: 'WEBRENAVE', domain: 'RENAVE', name: 'WebRenave', site: 'https://www.webrenave.com.br', covers: ['Entrada', 'Saída'], mode: 'PARCEIRO', fields: PARTNER_FIELDS, environments: BOTH },

  // ── Fiscal (emissor de NF-e/NFS-e da loja) ──
  { id: 'MANUAL', domain: 'FISCAL', name: 'Emissor próprio (importar XML)', covers: ['NF-e'], mode: 'MANUAL', fields: [], environments: ['PRODUCAO'], note: 'A loja emite no emissor dela e envia o XML autorizado; o sistema confere e vincula.' },
  { id: 'FOCUS_NFE', domain: 'FISCAL', name: 'Focus NFe', site: 'https://focusnfe.com.br', docsUrl: 'https://doc.focusnfe.com.br', covers: ['NF-e', 'NFS-e', 'NFC-e', 'Cancelamento', 'Carta de correção'], mode: 'API', recommended: true, environments: BOTH,
    fields: [{ key: 'token', label: 'Token da empresa', secret: true, required: true, help: 'Painel Focus NFe › Empresas › token de homologação ou de produção.' }, { key: 'webhookSecret', label: 'Segredo do webhook', secret: true }] },
  { id: 'PLUGNOTAS', domain: 'FISCAL', name: 'PlugNotas (TecnoSpeed)', site: 'https://plugnotas.com.br', docsUrl: 'https://docs.plugnotas.com.br', covers: ['NF-e', 'NFS-e', 'NFC-e', 'Cancelamento', 'Carta de correção'], mode: 'API', recommended: true, environments: BOTH,
    fields: [{ key: 'apiKey', label: 'x-api-key', secret: true, required: true }, { key: 'webhookSecret', label: 'Segredo do webhook', secret: true }] },
  { id: 'NUVEM_FISCAL', domain: 'FISCAL', name: 'Nuvem Fiscal', site: 'https://nuvemfiscal.com.br', docsUrl: 'https://dev.nuvemfiscal.com.br', covers: ['NF-e', 'NFS-e', 'Cancelamento', 'Carta de correção'], mode: 'API', environments: BOTH,
    fields: [{ key: 'clientId', label: 'Client ID', required: true }, { key: 'clientSecret', label: 'Client Secret', secret: true, required: true }] },
  { id: 'ACBR_API', domain: 'FISCAL', name: 'ACBr API', site: 'https://acbr.api.br', docsUrl: 'https://dev.acbr.api.br', covers: ['NF-e', 'NFS-e', 'Cancelamento', 'Carta de correção'], mode: 'API', environments: BOTH, note: 'Compatível com a API da Nuvem Fiscal.',
    fields: [{ key: 'clientId', label: 'Client ID', required: true }, { key: 'clientSecret', label: 'Client Secret', secret: true, required: true }] },

  // ── Transferência de propriedade (Res. Contran 1.027/2026: plataformas homologadas) ──
  { id: 'MANUAL', domain: 'TRANSFER', name: 'Detran / CDT / despachante', covers: ['Intenção de venda', 'ATPV-e', 'Assinaturas', 'Vistoria', 'CRLV-e'], mode: 'MANUAL', fields: [], environments: ['PRODUCAO'], note: 'A loja acompanha cada etapa e registra aqui. Plataformas homologadas pela SENATRAN entram como conector.' },
  { id: 'ZAPCAR', domain: 'TRANSFER', name: 'ZapCar', site: 'https://www.zapcarconsulta.com.br', covers: ['CRLV-e', '2ª via de ATPV-e', 'Código de segurança do CRV'], mode: 'PARCEIRO', fields: PARTNER_FIELDS, environments: BOTH, note: 'API com chave e webhook assinado para despachantes e integradores.' },
  { id: 'PLATAFORMA_HOMOLOGADA', domain: 'TRANSFER', name: 'Plataforma homologada SENATRAN', covers: ['Intenção de venda', 'ATPV-e', 'Assinaturas', 'Transferência', 'CRLV-e'], mode: 'PARCEIRO', fields: PARTNER_FIELDS, environments: BOTH, note: 'Lista oficial em publicação pela SENATRAN. Conecte qualquer plataforma homologada com o Conector AutoDrive.' },

  // ── Consulta veicular: débitos, restrições, gravame ──
  { id: 'ZAPAY', domain: 'VEHICLE_DATA', name: 'Zapay', site: 'https://usezapay.com.br', docsUrl: 'https://docs-b2b.usezapay.com.br', covers: ['IPVA', 'Licenciamento', 'Multas', 'DPVAT/SPVAT', '27 UFs', 'Pagamento'], mode: 'API', recommended: true, environments: BOTH,
    fields: [{ key: 'username', label: 'Usuário da API', required: true }, { key: 'password', label: 'Senha da API', secret: true, required: true }, { key: 'webhookSecret', label: 'Segredo do webhook', secret: true, help: 'Qualquer texto longo; o AutoDrive cadastra o webhook com ele.' }] },
  { id: 'CELCOIN', domain: 'VEHICLE_DATA', name: 'Celcoin', site: 'https://www.celcoin.com.br', docsUrl: 'https://developers.celcoin.com.br', covers: ['IPVA', 'Licenciamento', 'Multas', 'Pagamento'], mode: 'API', recommended: true, environments: BOTH,
    fields: [{ key: 'clientId', label: 'Client ID', required: true }, { key: 'clientSecret', label: 'Client Secret', secret: true, required: true }, { key: 'baseUrl', label: 'Endereço de produção', help: 'Informado pela Celcoin na homologação.' }] },
  { id: 'INFOSIMPLES', domain: 'VEHICLE_DATA', name: 'Infosimples', site: 'https://infosimples.com', docsUrl: 'https://infosimples.com/consultas/', covers: ['Débitos por UF', 'RENAJUD', 'Roubo/furto', 'Gravame (SP)', 'Laudo ECV'], mode: 'PARCEIRO', fields: PARTNER_FIELDS, environments: ['PRODUCAO'], note: 'Consultas por Detran/UF, pré-pago.' },
  { id: 'CONSULTA_DE_PLACA', domain: 'VEHICLE_DATA', name: 'Consulta de Placa', site: 'https://consultadeplaca.net/para-revendas', covers: ['Gravame', 'Leilão', 'Roubo/furto', 'Sinistro', 'Recall', 'Débitos'], mode: 'PARCEIRO', fields: PARTNER_FIELDS, environments: BOTH, note: 'Histórico veicular para revendas, por créditos.' },
  { id: 'CHECKTUDO', domain: 'VEHICLE_DATA', name: 'Checktudo', site: 'https://www.checktudo.com.br', covers: ['Leilão', 'Sinistro', 'Roubo/furto', 'Gravame', 'Débitos'], mode: 'PARCEIRO', fields: PARTNER_FIELDS, environments: BOTH },
]

export const DOMAIN_LABEL: Record<ConnectorDomain, string> = {
  RENAVE: 'Integradora RENAVE',
  FISCAL: 'Emissor de notas',
  TRANSFER: 'Transferência',
  VEHICLE_DATA: 'Consulta de débitos e restrições',
}

export function providersFor(domain: ConnectorDomain): ProviderEntry[] {
  return PROVIDERS.filter((p) => p.domain === domain)
}

export function providerEntry(domain: string, id: string | null | undefined): ProviderEntry | null {
  return PROVIDERS.find((p) => p.domain === domain && p.id === id) ?? null
}
