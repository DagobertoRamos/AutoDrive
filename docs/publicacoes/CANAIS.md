# Canais — matriz (verificado em 25/09/2026)

Níveis de verificação: **local** (testes locais/banco local) · **contrato** (protocolo
oficial reproduzido em simulação) · **sandbox** · **produção**.
Catálogo ≠ conector operacional. Nenhum canal externo foi testado em sandbox ou
produção: faltam credenciais/homologação (abaixo).

| Canal | Conector | Mecanismo | Configurado | Testado | Operacional? | Dependências para ir ao ar |
| --- | --- | --- | --- | --- | --- | --- |
| Site próprio | ✅ | interno | ✅ | local + banco local + build local (estoque real, confirmação no site) | **Sim** | site da loja ativo |
| Webmotors | ✅ SOAP | envio (webservice) | ❌ | contrato | Não | usuário de integração (CNPJ/e-mail/senha), modalidade, códigos de motivo de exclusão (F05), homologação em hportal |
| OLX Autos | ✅ API | envio | ❌ | contrato | Não | app OLX (client_id/segredo), plano profissional **Empresa** |
| Mercado Livre | ✅ API | envio + webhook | ❌ | contrato | Não | app DevCenter, pacote de veículos, `listingTypeId`, `cityId`, WhatsApp |
| Chaves na Mão | ✅ API | envio | ❌ | contrato + banco local (simulado) | Não | token de integração; token de homologação (tecnologia@chavesnamao.com.br) |
| Facebook — Página | ✅ Graph | envio | ❌ | contrato | Não | app Meta + App Review (pages_manage_posts etc.) |
| Instagram profissional | ✅ Graph | envio | ❌ | contrato | Não | app Meta + App Review; conta profissional ligada à Página |
| Meta — Catálogo | feed existente | portal consulta | conforme loja | local (proteção de feed) | Feed sim; **não** é Marketplace | catálogo no Commerce Manager |
| Marketplace, grupos, perfis | manual | exportação ZIP + texto | ✅ | local | Manual (identificado) | — |
| iCarros | — | a definir | — | — | Não (em avaliação) | credenciais OAuth via atendimento iCarros; doc pública indisponível em 25/09/2026 |
| Mobiauto | — | a definir | — | — | Não (em avaliação) | autorização da Mobiauto (swagger de teste citado) |
| NaPista, CarroSP, Autoline Brasil, SóCarrão, Usadosbr, Comprecar, Shopcar, Seminovos.com.br, LitoralCar, Carros na Serra, SorocabaMotors | — | a definir | — | — | Não (em avaliação) | contato comercial/técnico e documentação oficial |
| Carflix | — | — | — | — | Não | é rede de intermediação/franquias: exige parceria antes de qualquer integração |

## Fontes e fatos por canal

**Webmotors** — https://integracao.webmotors.com.br/manualintegracao/ + WSDL
(`wsEstoqueRevendedorWebMotors.asmx`, `wsLoginSistemaRevendedor.asmx`).
Auth: `autenticar(cnpj,email,senha)` → hash (~1000 min). Operações: IncluirCarro,
AlterarCarro, ExcluirCarro(motivo), IncluirFotoUrl, ObterFotosCarro, ExcluirFoto,
ObterEstoqueAtual, ObterMarca/Modelo/Versao/Cores/Combustivel/Cambio/Modalidade (cota por
modalidade). Retornos: 500 ok; 401/402/31 sessão; 43|32 e 43|33 cota; 43|xx validação.
Sem pausa. Observação ≤ 500 caracteres. Homologação: hportal.webmotors.com.br.
Integração de **manutenção de anúncios** ≠ API Site/Consultar Estoque (portal Sensedia,
só leitura do Cockpit) ≠ integração de leads.

**OLX** — https://developers.olx.com.br/anuncio/api/ (Autos, não Imóveis/XML).
OAuth `auth.olx.com.br/oauth` (escopo `autoupload`), `PUT apps.olx.com.br/autoupload/import`
(insert = inserir/editar pelo id; delete), status `POST .../import/{token}`
(pending/queued/accepted/refused/error), marcas/modelos/versões `POST .../car_info`.
Códigos: -2 excesso, -6 sem plano, -7/-8 sem slots. Até 20 fotos, 1ª = capa. Sem pausa.

**Mercado Livre** — developers.mercadolivre.com.br › Publicação de automóveis /
Sincronização (28/08/2026). `POST /items` MLB1744, `buying_mode: classified`,
`channels: [marketplace]`, pacote (`listing_type_id`); status paused/active/closed +
`deleted`; desde 01/10/2026 `seller_contact.country_code2/phone2` obrigatórios para
concessionária; placa e 6 últimos do chassi para verificação; descrição sem contato.

**Chaves na Mão** — manual REST v1.0 (cdn.chavesnamao.com.br/documents/...pdf).
`GET /clients/jwt` (header token), `POST/PUT/GET/DELETE /vehicles/{reference}`,
`POST/DELETE /publications/{reference}`, `GET /clients/plan`, trimId por
brands/models/trims. 429 com retry-after (janela de 10 s). Até 16 fotos.

**Meta** — Pages API posts e Instagram Content Publishing (documentação oficial).
Página: fotos `published=false` + `/feed` com `attached_media`; editar texto só de posts
do app; DELETE. Instagram: contêineres → CAROUSEL (até 10) → `media_publish`; 100 posts/24 h
(`content_publishing_limit`); só JPEG; sem edição/remoção documentadas → pendência manual.
Página ≠ Catálogo ≠ anúncios pagos ≠ Marketplace.

## Passos de homologação (por canal)

1. **Webmotors**: pedir usuário de integração e acesso ao hportal; cadastrar conta em
   Canais conectados (ambiente Homologação); "Testar" lista modalidades; informar
   modalidade e códigos de motivo (vendido/retirado); publicar 1 veículo autorizado;
   conferir no Cockpit; alterar preço; retirar; registrar CodigoAnuncio.
2. **OLX**: registrar app (nome, site, até 3 redirect URIs = URL de retorno acima) com
   suporteintegrador@olxbr.com; definir `OLX_CLIENT_ID/SECRET`; conectar conta com plano
   Empresa; publicar 1 veículo autorizado; acompanhar token até `accepted`; retirar.
3. **Mercado Livre**: criar app no DevCenter (redirect + URL de notificações, tópico
   items); usuário de teste + pacote de teste (formulário oficial); conectar; configurar
   `listingTypeId` e `cityId`; publicar/pausar/reativar/retirar; validar webhook.
4. **Chaves na Mão**: pedir token de homologação a tecnologia@chavesnamao.com.br;
   conectar em Homologação (confirmar o caminho base da API de homologação);
   publicar/pausar/retirar; conferir plano.
5. **Meta**: criar app (Facebook Login for Business), pedir Advanced Access
   (pages_manage_posts, pages_read_engagement, pages_show_list, instagram_basic,
   instagram_content_publish) no App Review com vídeo do fluxo; testar com Página/conta
   de teste; publicar post e carrossel; excluir post da Página.

Publicações reais ou que gerem cobrança só com conta, veículo e escopo autorizados pela
loja; remover somente o que foi criado no teste.
