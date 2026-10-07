# CRM Omnichannel + Hub de Canais — arquitetura e roteiro

Evolução do CRM existente (nada paralelo): `MarketingLead` continua sendo o lead/oportunidade,
`Customer` a pessoa, `Publication` a projeção do estoque nos portais, a Central de Publicações
o Listing Hub e os canais de captação o Lead Ingestion Gateway.

## 1. Auditoria (Fase 1) — situação encontrada em 07/10/2026

| Área | Situação | Observação |
|---|---|---|
| Lead / funil / etapas / tarefas / visitas | OK | `MarketingLead` + `CrmStage`/pipelines/placements |
| Criação de lead | DUPLICADA | 6 caminhos (inbound, manual, Mesa SDR, telefonia, fila, AutoConf), regras de dedup diferentes |
| Entrada externa (canais/site) | PROBLEMÁTICA → **corrigida** | não gravava o bruto; idempotência check-then-insert; erro = lead perdido |
| Atribuição (first/last touch, gclid, fbclid) | INEXISTENTE → **feita** | só `source` + metadata solta |
| Identidade | PARCIAL | dedup por CPF/telefone/e-mail; sem identificador por canal (agora: conversa guarda o wa_id) |
| Lead → veículo interno | INEXISTENTE → **feita** | agora por id do anúncio no portal (`Publication.remoteId/externalRef`) e placa |
| Conversas / WhatsApp do cliente no CRM | INEXISTENTE → **feita** | webhook só tratava retorno de pendência do vendedor |
| Distribuição | PARCIAL | rodízio/carga/performance; regras por origem/veículo e aceite com prazo ainda não |
| SLA | DUPLICADA | `MarketingLeadSla` (SDR) × `metadata.sla` (CRM) |
| Publicação em portais | PARCIAL | conectores prontos, só testados por contrato; **agora trava publicação real até homologar** |
| Vendido → retirada | OK com lacunas → **corrigida** | feed do site sem gancho; agora avisa gestor se vendido continua anunciado > 2 h |
| Cofres de segredo | DUPLICADA | 5 cofres; token do WhatsApp da loja em texto aberto → **agora cifrado** |
| Webhook Meta | PROBLEMÁTICA → **corrigida** p/ CRM | sem dedup; aceitava sem assinatura. Mensagem de cliente só vira conversa com a assinatura conferida |
| Relatórios de canal/ROI | INEXISTENTE | próximo passo (dados de atribuição já gravados) |

## 2. Arquitetura entregue

```
Canal (portal, rede, site, WhatsApp, e-mail, parceiro)
  → rota de entrada (valida autenticidade)
  → Gateway de Entrada  (webhook_inbox: grava o BRUTO antes; único por provedor+evento)
  → despachante (inbox-dispatch.ts: provedor → processador)
  → regra única do lead (crm/inbound-lead.ts): idempotência, cliente com lead aberto,
     veículo (anúncio/placa; vendido → semelhantes), atribuição (primeiro/último toque),
     funil, distribuição, automações, avisos
  → Conversa (conversations/conversation_messages) quando o canal é de mensagens
falha → nova tentativa (1, 2, 5, 10, 30, 60, 180 min) → DEAD → Detalhes técnicos (Reprocessar)
```

- **Gateway**: `src/lib/integrations/inbox*.ts`. Identificador legível `EVT-AAAA-XXXXXXXX` em cada lead
  (`metadata.correlationId`). Corpo original guardado 30 dias (retenção LGPD), chaves de autenticação removidas.
- **Atribuição**: `src/lib/crm/attribution-core.ts` → `metadata.attribution = { firstTouch, lastTouch, touches[≤20] }`
  com campanha, conjunto, anúncio, formulário, UTM, gclid/gbraid/wbraid, fbclid, ttclid, página e id do anúncio no portal.
  O site guarda a campanha de entrada no navegador (`SiteCampaignMemory`).
- **E-mail de leads**: cada canal tem `leads+<chave>@INBOUND_EMAIL_DOMAIN`; o serviço de recebimento
  (Postmark/SendGrid/Mailgun/Cloudflare) entrega em `POST /api/integrations/email/inbound`.
  Leitura determinística (rótulos, telefone, e-mail, placa, link e id do anúncio, portal) — sem IA.
- **Caixa de Entrada**: `CRM › Conversas` (`/crm/conversas`). WhatsApp oficial recebe e responde
  (janela de 24 h respeitada). Canais sem resposta integrada mostram "Abrir WhatsApp" / "Ligar".
  A conversa acompanha o responsável do lead.
- **Hub**: `Configurações › Canais e integrações` (`/configuracoes/canais`). Catálogo por capacidades
  (`src/lib/integrations/hub/catalog-core.ts`): publicar, receber leads, receber/responder mensagens,
  sincronizar estoque, devolver conversões — por canal, com estado real por loja
  (Conectado / Configuração necessária / Atenção / Desconectado) e disponibilidade
  (Disponível / Em homologação / Requer contrato / Em breve). Canal novo = item no catálogo + processador.
- **Trava de homologação**: `needsHomologation` — conta de produção só publica em canal comprovado
  (SANDBOX/PRODUCAO). Piloto controlado: env `PUBLICATIONS_PILOT_CHANNELS=OLX,TIKTOK`.

## 3. Configuração da plataforma (uma vez, não é do lojista)

| Variável | Para quê |
|---|---|
| `META_WEBHOOK_APP_SECRET` | assinatura do webhook do WhatsApp — **sem ela, conversas de clientes não entram no CRM** |
| `INBOUND_EMAIL_DOMAIN` + `INBOUND_EMAIL_SECRET` | e-mail exclusivo de leads (MX do domínio → serviço de recebimento → rota acima) |
| `PUBLICATIONS_PILOT_CHANNELS` | opcional: libera publicação real de um canal ainda em homologação |

## 4. Roteiro (fases do pedido)

| Fase | Situação |
|---|---|
| 1 Auditoria | feita (acima) |
| 2–3 Domínio: Contato / LeadEvent / Conversa / Oportunidade | feita sem tabela paralela: LeadEvent = `webhook_inbox`; Conversa nova; lead = oportunidade |
| 4 Integration Hub | feito (catálogo por capacidades + estado + saúde + área técnica) |
| 5 Cofre de segredos | parcial: WhatsApp da loja cifrado; unificar os 5 cofres numa fase própria |
| 6 Conector universal | feito (URL de entrada + e-mail exclusivo, ambos pelo Gateway) |
| 7 Site + WhatsApp | feito |
| 8–14 Portais (Webmotors, OLX, ML, Meta, TikTok, Google, demais) | leads: por URL/e-mail hoje; publicação: em homologação. Nativo (OAuth de leads/chat OLX, perguntas ML, Lead Ads Meta, Embedded Signup) depende de app aprovado em cada plataforma |
| 15 Listing Hub | existente (Central de Publicações) + trava de homologação + alerta de vendido anunciado |
| 16 Inbox | feita para WhatsApp; Instagram/Messenger/OLX/ML entram como processadores do Gateway |
| 17–18 Distribuição/SLA | existentes; faltam regras por origem/veículo e aceite com prazo |
| 19 Inteligência | a fazer (resumo, intenção, próxima ação — sem prometer crédito/desconto) |
| 20 Closed loop | dados guardados desde já (gclid, fbclid, ttclid, ids de anúncio); envio de conversões a fazer |
| 21 Relatórios/ROI | a fazer (lead → visita → proposta → venda → margem por canal) |
| 22–23 Testes/auditoria | testes puros + integração em banco local (`omnichannel.db.test.ts`) |

Teste de integração (banco local 5433):
`OMNI_DB_TEST=1 DATABASE_URL=postgresql://postgres@localhost:5433/autodrive_dev npx vitest run src/lib/integrations/omnichannel.db.test.ts`
