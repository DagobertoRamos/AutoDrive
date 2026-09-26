// =============================================================================
// Central de Publicações — catálogo de canais. PURO (testado).
//
// Estar no catálogo NÃO significa que o conector funciona. Dois estados são
// independentes:
//   • devStatus  — desenvolvimento do conector (plataforma AutoDrive):
//       EM_AVALIACAO → EM_DESENVOLVIMENTO → AGUARDANDO_HOMOLOGACAO → DISPONIVEL
//   • status da conexão da LOJA (tabela publication_connections):
//       NAO_CONECTADO | CONECTADO | RECONECTAR | PENDENCIA
// `verified` diz até onde o conector foi comprovado: testes locais, contrato
// (simulação do protocolo oficial), sandbox/homologação ou produção.
// Fonte e data de verificação de cada canal ficam aqui e em
// docs/publicacoes/CANAIS.md. Nada foi inventado: o que não tem documentação
// oficial acessível fica "em avaliação" e sem publicação automática.
// =============================================================================

export type ChannelId =
  | 'SITE' | 'WEBMOTORS' | 'OLX' | 'MERCADO_LIVRE' | 'CHAVES_NA_MAO' | 'META_PAGE' | 'INSTAGRAM'
  | 'META_CATALOGO' | 'MANUAL_SOCIAL'
  | 'NAPISTA' | 'CARRO_SP' | 'AUTOLINE' | 'ICARROS' | 'MOBIAUTO' | 'SOCARRAO' | 'USADOSBR' | 'COMPRECAR'
  | 'SHOPCAR' | 'SEMINOVOS' | 'LITORALCAR' | 'CARROS_NA_SERRA' | 'SOROCABA_MOTORS' | 'CARFLIX'

export type DevStatus = 'EM_AVALIACAO' | 'EM_DESENVOLVIMENTO' | 'AGUARDANDO_HOMOLOGACAO' | 'DISPONIVEL'
export type Mechanism = 'INTERNO' | 'API' | 'WEBSERVICE' | 'FEED' | 'MANUAL' | 'A_DEFINIR'
/** Quem se move: nós enviamos (ENVIO) ou o portal busca um feed (CONSULTA). */
export type Direction = 'ENVIO' | 'CONSULTA' | 'INTERNO' | 'MANUAL' | 'A_DEFINIR'
export type Capability = 'authenticate' | 'testConnection' | 'validate' | 'publish' | 'get' | 'update' | 'pause' | 'resume' | 'remove' | 'limits' | 'webhooks'
/** SIM = automático · NAO = o canal não oferece · MANUAL = só com ação da loja · A_VERIFICAR = sem documentação. */
export type Support = 'SIM' | 'NAO' | 'MANUAL' | 'A_VERIFICAR'
export type Verified = 'NENHUM' | 'TESTES_LOCAIS' | 'CONTRATO' | 'SANDBOX' | 'PRODUCAO'
export type ConnectKind = 'NENHUMA' | 'OAUTH' | 'CREDENCIAIS'

export interface MediaRules {
  min: number
  max: number
  formats: string[] // o que enviamos (variante gerada pelo AutoDrive)
  minWidth?: number
  aspect?: string
  watermark: 'PERMITIDA' | 'EVITAR' | 'NAO_INFORMADO'
  notes?: string
}

export interface CredentialField { key: string; label: string; secret: boolean; placeholder?: string; help?: string }

export interface ChannelSpec {
  id: ChannelId
  name: string
  /** Nomes e domínios do MESMO canal — impede cadastro duplicado por troca de nome/domínio. */
  aliases: string[]
  group: 'PROPRIO' | 'PORTAL' | 'SOCIAL' | 'MANUAL'
  devStatus: DevStatus
  verified: Verified
  mechanism: Mechanism
  direction: Direction
  connect: ConnectKind
  credentialFields?: CredentialField[]
  /** Aceita várias campanhas do mesmo veículo (redes sociais). */
  campaigns: boolean
  capabilities: Record<Capability, Support>
  auth: string
  protocol: string
  commercial: string
  limits: string
  sandbox: string
  dependencies: string[]
  media: MediaRules
  text: { titleMax?: number; descriptionMax?: number; contactsInDescription: boolean }
  source: { url: string; verifiedAt: string; notes: string }
  priority: number // ordem no catálogo
}

const NONE: Record<Capability, Support> = {
  authenticate: 'A_VERIFICAR', testConnection: 'A_VERIFICAR', validate: 'A_VERIFICAR', publish: 'A_VERIFICAR', get: 'A_VERIFICAR',
  update: 'A_VERIFICAR', pause: 'A_VERIFICAR', resume: 'A_VERIFICAR', remove: 'A_VERIFICAR', limits: 'A_VERIFICAR', webhooks: 'A_VERIFICAR',
}
const D = '2026-09-25'
const GENERIC_MEDIA: MediaRules = { min: 1, max: 20, formats: ['jpg'], watermark: 'NAO_INFORMADO' }

/** Portal ainda sem contrato técnico acessível: fica no catálogo, sem envio automático. */
function evaluating(id: ChannelId, name: string, aliases: string[], notes: string, url: string, priority: number, extra: Partial<ChannelSpec> = {}): ChannelSpec {
  return {
    id, name, aliases, group: 'PORTAL', devStatus: 'EM_AVALIACAO', verified: 'NENHUM', mechanism: 'A_DEFINIR', direction: 'A_DEFINIR',
    connect: 'NENHUMA', campaigns: false, capabilities: NONE,
    auth: 'A confirmar com o portal.', protocol: 'A confirmar (API, webservice ou feed).', commercial: 'A confirmar.', limits: 'A confirmar.',
    sandbox: 'A confirmar.', dependencies: ['Contato comercial/técnico com o portal', 'Documentação oficial e credenciais de integração'],
    media: GENERIC_MEDIA, text: { contactsInDescription: false }, source: { url, verifiedAt: D, notes }, priority, ...extra,
  }
}

export const CHANNELS: ChannelSpec[] = [
  {
    id: 'SITE', name: 'Site próprio', aliases: ['site', 'site da loja', 'site proprio'], group: 'PROPRIO',
    devStatus: 'DISPONIVEL', verified: 'TESTES_LOCAIS', mechanism: 'INTERNO', direction: 'INTERNO', connect: 'NENHUMA', campaigns: false,
    capabilities: { authenticate: 'NAO', testConnection: 'SIM', validate: 'SIM', publish: 'SIM', get: 'SIM', update: 'SIM', pause: 'SIM', resume: 'SIM', remove: 'SIM', limits: 'NAO', webhooks: 'NAO' },
    auth: 'Não se aplica (mesmo sistema).', protocol: 'Interno: anúncio do site (site_listings) + estoque.',
    commercial: 'Incluído no AutoDrive.', limits: 'Sem limite.', sandbox: 'Pré-visualização do site (rascunho de 60 min).',
    dependencies: ['Site da loja ativo (Site › Configurações)'],
    media: { min: 1, max: 40, formats: ['webp', 'jpg'], watermark: 'PERMITIDA', notes: 'Galeria do estoque; a 1ª foto é a capa.' },
    text: { titleMax: 120, descriptionMax: 6000, contactsInDescription: true },
    source: { url: 'interno', verifiedAt: D, notes: 'Confirmação lendo o próprio anúncio publicado (mesma regra da vitrine).' }, priority: 1,
  },
  {
    id: 'WEBMOTORS', name: 'Webmotors', aliases: ['webmotors', 'webmotors.com.br', 'cockpit webmotors', 'web motors'], group: 'PORTAL',
    devStatus: 'AGUARDANDO_HOMOLOGACAO', verified: 'CONTRATO', mechanism: 'WEBSERVICE', direction: 'ENVIO', connect: 'CREDENCIAIS', campaigns: false,
    credentialFields: [
      { key: 'cnpj', label: 'CNPJ da revenda', secret: false, placeholder: '00.000.000/0000-00' },
      { key: 'email', label: 'E-mail do usuário de integração', secret: false, help: 'Usuário de integração liberado pela Webmotors (não é o login pessoal).' },
      { key: 'senha', label: 'Senha do usuário de integração', secret: true },
    ],
    capabilities: { authenticate: 'SIM', testConnection: 'SIM', validate: 'SIM', publish: 'SIM', get: 'SIM', update: 'SIM', pause: 'NAO', resume: 'NAO', remove: 'SIM', limits: 'SIM', webhooks: 'NAO' },
    auth: 'Webservice de login (wsLoginSistemaRevendedor › autenticar: CNPJ, e-mail e senha do usuário de integração) devolve HashAutenticacao válido por ~1000 min.',
    protocol: 'SOAP (ASMX) wsEstoqueRevendedorWebMotors: IncluirCarro, AlterarCarro, ExcluirCarro, IncluirFotoUrl, ObterFotosCarro, ExcluirFoto, ObterEstoqueAtual(Paginado), ObterMarca/Modelo/Versao/Cores/Combustivel/Cambio/Modalidade.',
    commercial: 'Plano/pacote de anúncios contratado com a Webmotors; o código de modalidade vem do pacote. Esta é a integração de MANUTENÇÃO de anúncios — diferente da API Site/Consultar Estoque (portal Sensedia), que só LÊ o estoque do Cockpit, e da integração de leads.',
    limits: 'Cota por modalidade/pacote (ObterModalidade: QuantidadeAnunciosTotal/QuantidadeAnuncios; retornos 43|32 e 43|33 = esgotado). Sem pausa: retirar = ExcluirCarro com motivo.',
    sandbox: 'Homologação: https://hportal.webmotors.com.br/IntegracaoRevendedor/wsEstoqueRevendedorWebMotors.asmx (credenciais de homologação fornecidas pela Webmotors).',
    dependencies: ['Usuário de integração (CNPJ + e-mail + senha) liberado pela Webmotors', 'Pacote/modalidade ativo', 'De-para de marca/modelo/versão/cor/câmbio/combustível para códigos Webmotors'],
    media: { min: 1, max: 20, formats: ['jpg'], watermark: 'NAO_INFORMADO', notes: 'Fotos enviadas por URL (IncluirFotoUrl), uma a uma, na ordem. Limite exato de fotos depende do pacote — confirmar na homologação.' },
    text: { descriptionMax: 500, contactsInDescription: false },
    source: { url: 'https://integracao.webmotors.com.br/manualintegracao/', verifiedAt: D, notes: 'Manual + WSDL públicos lidos em 25/09/2026. Formato do "motivo de exclusão" (F05) não pôde ser lido (página bloqueada) — confirmar na homologação.' },
    priority: 2,
  },
  {
    id: 'OLX', name: 'OLX', aliases: ['olx', 'olx.com.br', 'olx autos', 'olx brasil'], group: 'PORTAL',
    devStatus: 'AGUARDANDO_HOMOLOGACAO', verified: 'CONTRATO', mechanism: 'API', direction: 'ENVIO', connect: 'OAUTH', campaigns: false,
    capabilities: { authenticate: 'SIM', testConnection: 'SIM', validate: 'SIM', publish: 'SIM', get: 'SIM', update: 'SIM', pause: 'NAO', resume: 'NAO', remove: 'SIM', limits: 'NAO', webhooks: 'A_VERIFICAR' },
    auth: 'OAuth 2.0 (https://auth.olx.com.br/oauth, escopo autoupload); troca do código em https://auth.olx.com.br/oauth/token. client_id/segredo obtidos registrando o app com suporteintegrador@olxbr.com.',
    protocol: 'API de anúncios (Autos, categoria 2020): PUT https://apps.olx.com.br/autoupload/import (insert/delete, JSON ≤ 1 MB) → token; status em POST .../autoupload/import/{token}. Marca/modelo/versão por POST .../autoupload/car_info[/marca[/modelo]].',
    commercial: 'Exige plano profissional para EMPRESA (Essencial/Plus/Premium Empresa); planos de autônomo não podem usar a API (erro -6).',
    limits: 'Slots do plano (-7/-8 = sem espaço), bloqueio temporário por excesso (-2). Sem pausa: retirar = operation delete.',
    sandbox: 'Sem sandbox público documentado; testar com anúncio real autorizado.',
    dependencies: ['App registrado na OLX (client_id/segredo) — plataforma', 'Conta OLX da loja com plano profissional Empresa', 'De-para de marca/modelo/versão (car_info)'],
    media: { min: 1, max: 20, formats: ['jpg'], watermark: 'NAO_INFORMADO', notes: 'URLs sem repetição; a 1ª é a principal. Erros de imagem vêm em image_errors.' },
    text: { titleMax: 90, descriptionMax: 6000, contactsInDescription: false },
    source: { url: 'https://developers.olx.com.br/anuncio/api/home.html', verifiedAt: D, notes: 'Documentação de AUTOS (não a de Imóveis/XML). Assunto de carros é preenchido pela OLX.' },
    priority: 3,
  },
  {
    id: 'MERCADO_LIVRE', name: 'Mercado Livre', aliases: ['mercado livre', 'mercadolivre', 'mercadolivre.com.br', 'mercado libre', 'ml'], group: 'PORTAL',
    devStatus: 'AGUARDANDO_HOMOLOGACAO', verified: 'CONTRATO', mechanism: 'API', direction: 'ENVIO', connect: 'OAUTH', campaigns: false,
    capabilities: { authenticate: 'SIM', testConnection: 'SIM', validate: 'SIM', publish: 'SIM', get: 'SIM', update: 'SIM', pause: 'SIM', resume: 'SIM', remove: 'SIM', limits: 'NAO', webhooks: 'SIM' },
    auth: 'OAuth 2.0 do Mercado Livre (código + refresh token); app criado no DevCenter pela plataforma, a loja autoriza a própria conta.',
    protocol: 'REST classificados de veículos (MLB1744 Carros e Caminhonetes, buying_mode classified, channels marketplace): POST/PUT /items, POST /items/{id}/description, status paused/active/closed + deleted.',
    commercial: 'Pacote de publicação de veículos contratado pela loja (listing_type_id do pacote). Nunca compramos pacote ou destaque automaticamente.',
    limits: 'Rate limit da API (429). Desde 01/10/2026 seller_contact.country_code2/phone2 (WhatsApp) obrigatórios para concessionária.',
    sandbox: 'Usuários de teste + formulário para configurar pacote de teste (documentação oficial).',
    dependencies: ['App no DevCenter (client_id/segredo) — plataforma', 'Conta da loja com pacote de veículos', 'Localização (cidade) e WhatsApp da loja'],
    media: { min: 1, max: 20, formats: ['jpg'], watermark: 'EVITAR', notes: 'pictures[].source por URL; ao menos 1 foto é obrigatória (erro 173 LTP_PICTURE_REQUIRED). Descrição sem telefone/site.' },
    text: { titleMax: 60, contactsInDescription: false },
    source: { url: 'https://developers.mercadolivre.com.br/pt_br/publicacao-de-automoveis', verifiedAt: D, notes: 'Publicação e sincronização de automóveis (atualizadas em 28/08/2026).' },
    priority: 4,
  },
  {
    id: 'CHAVES_NA_MAO', name: 'Chaves na Mão', aliases: ['chaves na mao', 'chavesnamao', 'chavesnamao.com.br'], group: 'PORTAL',
    devStatus: 'AGUARDANDO_HOMOLOGACAO', verified: 'CONTRATO', mechanism: 'API', direction: 'ENVIO', connect: 'CREDENCIAIS', campaigns: false,
    credentialFields: [{ key: 'token', label: 'Token de integração', secret: true, help: 'Na conta Chaves na Mão: Meus dados › Token de integração.' }],
    capabilities: { authenticate: 'SIM', testConnection: 'SIM', validate: 'SIM', publish: 'SIM', get: 'SIM', update: 'SIM', pause: 'SIM', resume: 'SIM', remove: 'SIM', limits: 'SIM', webhooks: 'NAO' },
    auth: 'Token de integração da conta → GET /clients/jwt devolve JWT (expira em 1 dia).',
    protocol: 'REST https://api.chavesnamao.com.br/integration/v1: POST/PUT/GET/DELETE /vehicles/{reference}; POST/DELETE /publications/{reference} (publicar/despublicar); GET /clients/plan; marcas/modelos/versões (trimId).',
    commercial: 'Plano contratado define anúncios, fotos e destaques. Sem espaço no plano o veículo entra desativado (publication = null).',
    limits: 'Limite de requisições por janela de 10 s (429 + retry-after). Fotos: 1 a 16 (ou o do plano).',
    sandbox: 'Homologação: https://homologacao.chavesnamao.com.br/vehicle-integration (token pedido a tecnologia@chavesnamao.com.br).',
    dependencies: ['Token de integração da loja', 'De-para de versão (trimId)'],
    media: { min: 1, max: 16, formats: ['jpg'], watermark: 'NAO_INFORMADO', notes: 'A ordem do array é a ordem do anúncio.' },
    text: { titleMax: 100, descriptionMax: 4000, contactsInDescription: false },
    source: { url: 'https://cdn.chavesnamao.com.br/documents/manual_integracao_API_REST_veiculos_2022_chaves_na_mao.pdf', verifiedAt: D, notes: 'Manual oficial v1.0 (19/08/2022) + swagger citado nele. Página de integradores parceiros: https://www.chavesnamao.com.br/integradores-parceiros/' },
    priority: 5,
  },
  {
    id: 'META_PAGE', name: 'Facebook — Página', aliases: ['facebook', 'facebook pagina', 'pagina do facebook', 'fb'], group: 'SOCIAL',
    devStatus: 'AGUARDANDO_HOMOLOGACAO', verified: 'CONTRATO', mechanism: 'API', direction: 'ENVIO', connect: 'OAUTH', campaigns: true,
    capabilities: { authenticate: 'SIM', testConnection: 'SIM', validate: 'SIM', publish: 'SIM', get: 'SIM', update: 'SIM', pause: 'NAO', resume: 'NAO', remove: 'SIM', limits: 'NAO', webhooks: 'NAO' },
    auth: 'Facebook Login for Business; token de Página. Permissões: pages_manage_posts, pages_read_engagement, pages_show_list (Advanced Access exige App Review para atender outras empresas).',
    protocol: 'Graph API: fotos da Página sem publicar (/{page-id}/photos published=false) + post com attached_media em /{page-id}/feed; editar texto POST /{post-id} (só posts criados pelo app); DELETE /{post-id}.',
    commercial: 'Gratuito (post orgânico). Não é anúncio pago, não é Catálogo e NÃO é Marketplace.',
    limits: 'Limites de chamada da Graph API por app/Página.',
    sandbox: 'App em modo desenvolvimento com Página de teste do desenvolvedor.',
    dependencies: ['App Meta da plataforma aprovado (App Review)', 'Página da loja autorizada pelo administrador da Página'],
    media: { min: 1, max: 10, formats: ['jpg'], watermark: 'PERMITIDA' },
    text: { descriptionMax: 5000, contactsInDescription: true },
    source: { url: 'https://developers.facebook.com/documentation/pages-api/posts', verifiedAt: D, notes: 'Pausar não existe para post: venda = retirar (DELETE) ou editar texto.' },
    priority: 6,
  },
  {
    id: 'INSTAGRAM', name: 'Instagram profissional', aliases: ['instagram', 'ig', 'instagram business', 'instagram profissional'], group: 'SOCIAL',
    devStatus: 'AGUARDANDO_HOMOLOGACAO', verified: 'CONTRATO', mechanism: 'API', direction: 'ENVIO', connect: 'OAUTH', campaigns: true,
    capabilities: { authenticate: 'SIM', testConnection: 'SIM', validate: 'SIM', publish: 'SIM', get: 'SIM', update: 'NAO', pause: 'NAO', resume: 'NAO', remove: 'MANUAL', limits: 'SIM', webhooks: 'NAO' },
    auth: 'Facebook Login for Business (conta profissional vinculada à Página; instagram_basic, instagram_content_publish, pages_read_engagement) — ou Instagram Login (instagram_business_basic, instagram_business_content_publish). Implementado o fluxo via Facebook Login.',
    protocol: 'Content Publishing: POST /{ig-id}/media (image_url; is_carousel_item) → CAROUSEL (children) → status_code FINISHED → POST /{ig-id}/media_publish.',
    commercial: 'Gratuito (post orgânico).',
    limits: '100 posts por API a cada 24 h (GET /{ig-id}/content_publishing_limit). Carrossel até 10 itens. Somente JPEG.',
    sandbox: 'App em modo desenvolvimento com conta de teste.',
    dependencies: ['App Meta da plataforma aprovado', 'Conta profissional (empresa/criador) da loja'],
    media: { min: 1, max: 10, formats: ['jpg'], watermark: 'PERMITIDA', aspect: 'Carrossel recortado pela 1ª imagem (padrão 1:1)', notes: 'Imagem precisa estar pública durante o processamento (usamos link assinado).' },
    text: { descriptionMax: 2200, contactsInDescription: true },
    source: { url: 'https://developers.facebook.com/documentation/instagram-platform/content-publishing', verifiedAt: D, notes: 'Documentação não oferece edição de fotos nem exclusão de post publicado: venda gera pendência manual com o link.' },
    priority: 7,
  },
  {
    id: 'META_CATALOGO', name: 'Meta — Catálogo (feed)', aliases: ['catalogo meta', 'meta catalog', 'catalogo do facebook', 'commerce manager'], group: 'SOCIAL',
    devStatus: 'DISPONIVEL', verified: 'TESTES_LOCAIS', mechanism: 'FEED', direction: 'CONSULTA', connect: 'NENHUMA', campaigns: false,
    capabilities: { authenticate: 'NAO', testConnection: 'SIM', validate: 'SIM', publish: 'NAO', get: 'NAO', update: 'NAO', pause: 'NAO', resume: 'NAO', remove: 'NAO', limits: 'NAO', webhooks: 'NAO' },
    auth: 'Feed público por loja (a Meta consulta).', protocol: 'CSV /api/site/<loja>/catalogo-meta (Site › Catálogo Meta).',
    commercial: 'Gratuito. Catálogo serve a anúncios pagos; NÃO comprova publicação na Página nem no Marketplace.',
    limits: 'Frequência de busca definida no Commerce Manager.', sandbox: 'Pré-visualizar o CSV.',
    dependencies: ['Catálogo criado no Commerce Manager apontando para o feed'],
    media: { min: 1, max: 20, formats: ['jpg'], watermark: 'EVITAR' }, text: { contactsInDescription: false },
    source: { url: 'interno (Site › Catálogo Meta)', verifiedAt: D, notes: 'Feed protegido: falha interna responde 503 e nunca um feed vazio.' }, priority: 8,
  },
  {
    id: 'MANUAL_SOCIAL', name: 'Marketplace, grupos e perfis (manual)', aliases: ['facebook marketplace', 'marketplace', 'grupos', 'perfil pessoal', 'whatsapp status'], group: 'MANUAL',
    devStatus: 'DISPONIVEL', verified: 'TESTES_LOCAIS', mechanism: 'MANUAL', direction: 'MANUAL', connect: 'NENHUMA', campaigns: true,
    capabilities: { authenticate: 'NAO', testConnection: 'NAO', validate: 'SIM', publish: 'MANUAL', get: 'MANUAL', update: 'MANUAL', pause: 'MANUAL', resume: 'MANUAL', remove: 'MANUAL', limits: 'NAO', webhooks: 'NAO' },
    auth: 'Nenhuma — o AutoDrive NÃO pede senha de perfil pessoal.', protocol: 'Exportação de fotos (ZIP) e texto para a loja postar à mão.',
    commercial: 'Gratuito.', limits: '—', sandbox: '—', dependencies: [],
    media: { min: 1, max: 20, formats: ['jpg'], watermark: 'PERMITIDA' }, text: { contactsInDescription: true },
    source: { url: 'https://developers.facebook.com/documentation/pages-api/posts', verifiedAt: D, notes: 'Sem suporte oficial vigente verificado para publicar no Marketplace, em grupos ou perfis pessoais por API: fica identificado como MANUAL.' },
    priority: 9,
  },
  evaluating('ICARROS', 'iCarros', ['icarros', 'icarros.com.br', 'portal revenda icarros'], 'API OAuth 2.0 com credenciais pedidas ao atendimento iCarros; a documentação pública (icarros.com.br/apidocs) redireciona para o catálogo em 25/09/2026. Prioritário para expansão.', 'https://www.icarros.com.br/portalrevenda/adesao.jsp', 10),
  {
    id: 'MOBIAUTO', name: 'Mobiauto', aliases: ['mobiauto', 'mobiauto.com.br', 'mobigestor'], group: 'PORTAL',
    devStatus: 'AGUARDANDO_HOMOLOGACAO', verified: 'CONTRATO', mechanism: 'API', direction: 'ENVIO', connect: 'OAUTH', campaigns: false,
    capabilities: { authenticate: 'SIM', testConnection: 'SIM', validate: 'SIM', publish: 'SIM', get: 'SIM', update: 'SIM', pause: 'SIM', resume: 'SIM', remove: 'SIM', limits: 'SIM', webhooks: 'NAO' },
    auth: 'OAuth2 (Keycloak) authorization code em auth.mobiauto.com.br (realm mobiauto). App da plataforma: client_id/segredo pedidos a openapi@mobiauto.com.br; a loja autoriza e escolhe a revenda.',
    protocol: 'Mobiauto Open API 1.0: POST/PUT/DELETE /api/dealer/{dealerId}/inventory/v1.0[/{dealId}], fotos /image (url, position), PUT /api/publish/v1.0/dealer/{dealerId}/deal/{dealId}/publish|unpublish, GET /api/dealer/{dealerId}/plans, tabelas /api/vehicle/v1.0/makes|models|trims|colors|fuels|transmissions.',
    commercial: 'Plano de anúncios da revenda na Mobiauto (quantityAvailable). O AutoDrive não compra planos.',
    limits: 'Cota do plano (GET /plans). Limites de requisição não documentados no Swagger — confirmar na homologação.',
    sandbox: 'Não documentado no Swagger; pedir ambiente de testes a openapi@mobiauto.com.br.',
    dependencies: ['App OAuth da Mobiauto (client_id/segredo) — plataforma', 'Revenda com plano de anúncios ativo', 'De-para de versão (trimId), cor, combustível e câmbio'],
    media: { min: 1, max: 20, formats: ['jpg'], watermark: 'NAO_INFORMADO', notes: 'Fotos por URL com posição (1 = capa). Limite de fotos a confirmar na homologação.' },
    text: { descriptionMax: 4000, contactsInDescription: false },
    source: { url: 'https://open-api.mobiauto.com.br/swagger-ui.html', verifiedAt: '2026-09-26', notes: 'Swagger público (open-api-1.0) lido em 26/09/2026; documentação complementar citada no Swagger e contato openapi@mobiauto.com.br.' },
    priority: 11,
  },
  evaluating('NAPISTA', 'NaPista', ['napista', 'napista.com.br', 'na pista'], 'Portal do Banco BV: só revendas credenciadas no BV anunciam. Integradores usam usuário/senha de integração gerados no portal; o protocolo não é público. Solicitar documentação ao NaPista/BV.', 'https://ajuda.revendamais.com.br/pt-BR/collections/199048-integrador', 12),
  evaluating('CARRO_SP', 'CarroSP', ['carrosp', 'carro sp', 'carrosp.com.br'], 'Integração homologada com o portal a confirmar (contato comercial).', 'https://www.carrosp.com.br', 13),
  evaluating('AUTOLINE', 'Autoline Brasil', ['autoline', 'autoline.com.br', 'autoline brasil'], 'Confirmar o serviço correto em autoline.com.br (não confundir com Autoline internacional de máquinas/caminhões).', 'https://www.autoline.com.br', 14),
  evaluating('SOCARRAO', 'SóCarrão', ['socarrao', 'so carrao', 'socarrao.com.br'], 'Conector adicional, conforme condições do portal.', 'https://www.socarrao.com.br', 15),
  evaluating('USADOSBR', 'Usadosbr', ['usadosbr', 'usados br', 'usadosbr.com'], 'Tem API oficial de veículos (inserir, atualizar, remover, consultar; homologação e produção — manual api_integracao_veiculos v8, 2024), mas o manual saiu do ar em 26/09/2026. Pedir manual e login de integração a suporte@usadosbr.com com o CNPJ.', 'https://ajuda.usadosbr.com', 16),
  evaluating('COMPRECAR', 'Comprecar', ['comprecar', 'comprecar.com.br'], 'Conector adicional, conforme condições do portal.', 'https://www.comprecar.com.br', 17),
  evaluating('SHOPCAR', 'Shopcar', ['shopcar', 'shopcar.com.br'], 'Opção adicional/regional.', 'https://www.shopcar.com.br', 18),
  evaluating('SEMINOVOS', 'Seminovos.com.br', ['seminovos', 'seminovos.com.br'], 'Opção regional.', 'https://seminovos.com.br', 19),
  evaluating('LITORALCAR', 'LitoralCar', ['litoralcar', 'litoral car', 'litoralcar.com.br'], 'Opção regional.', 'https://www.litoralcar.com.br', 20),
  evaluating('CARROS_NA_SERRA', 'Carros na Serra', ['carros na serra', 'carrosnaserra', 'carrosnaserra.com.br'], 'Opção regional.', 'https://www.carrosnaserra.com.br', 21),
  evaluating('SOROCABA_MOTORS', 'SorocabaMotors', ['sorocabamotors', 'sorocaba motors', 'sorocabamotors.com.br'], 'Opção regional.', 'https://www.sorocabamotors.com.br', 22),
  evaluating('CARFLIX', 'Carflix', ['carflix', 'carflix.com.br'], 'Rede de intermediação/franquias de seminovos (Mercado Livre é sócio). Não é portal aberto para qualquer revenda: exige parceria comercial antes de qualquer integração.', 'https://www.carflix.com.br/sua-carflix', 23),
]

const BY_ID = new Map(CHANNELS.map((c) => [c.id, c]))
export function channelSpec(id: string): ChannelSpec | undefined { return BY_ID.get(id as ChannelId) }
export function isChannelId(id: unknown): id is ChannelId { return typeof id === 'string' && BY_ID.has(id as ChannelId) }

export function normalizeChannelName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').replace(/[^a-z0-9.]+/g, ' ').trim()
}

/** Acha o canal por nome, apelido ou domínio (evita cadastrar o mesmo portal duas vezes). */
export function findChannelByName(name: string): ChannelSpec | undefined {
  const n = normalizeChannelName(name)
  if (!n) return undefined
  return CHANNELS.find((c) => normalizeChannelName(c.name) === n || c.aliases.some((a) => normalizeChannelName(a) === n))
}

/** Canal que aceita envio automático (conector implementado) para a loja escolher. */
export function isPublishable(spec: ChannelSpec): boolean {
  return spec.capabilities.publish === 'SIM' && spec.devStatus !== 'EM_AVALIACAO' && spec.devStatus !== 'EM_DESENVOLVIMENTO'
}

export const DEV_STATUS_LABEL: Record<DevStatus, string> = {
  EM_AVALIACAO: 'Em avaliação', EM_DESENVOLVIMENTO: 'Em desenvolvimento', AGUARDANDO_HOMOLOGACAO: 'Aguardando homologação', DISPONIVEL: 'Disponível',
}
export const VERIFIED_LABEL: Record<Verified, string> = {
  NENHUM: 'Não verificado', TESTES_LOCAIS: 'Testes locais', CONTRATO: 'Teste de contrato (simulação)', SANDBOX: 'Sandbox/homologação', PRODUCAO: 'Produção',
}
export const CAPABILITY_LABEL: Record<Capability, string> = {
  authenticate: 'Autenticar', testConnection: 'Testar conexão', validate: 'Validar dados', publish: 'Publicar', get: 'Consultar',
  update: 'Atualizar', pause: 'Pausar', resume: 'Reativar', remove: 'Remover', limits: 'Obter limites', webhooks: 'Receber eventos',
}
