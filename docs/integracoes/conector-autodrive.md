# Conector AutoDrive — especificação para integradoras

O AutoDrive opera RENAVE, transferência de propriedade e consulta veicular **com a conta da loja** na integradora que ela contratou. A loja informa em *Configurações › Operações › Conexões*:

- **Endereço da API** (`baseUrl`, sempre `https://`)
- **Chave de acesso** (`apiKey`)
- **Segredo do webhook** (opcional, recomendado)

Integradoras que já têm API própria podem expor estes endpoints como uma fachada fina sobre ela.

## Convenções

| Item | Regra |
|---|---|
| Autenticação | `Authorization: Bearer <apiKey>` |
| Idempotência | `Idempotency-Key: <chave>` — a mesma chave **devolve o mesmo resultado** e nunca cria uma segunda operação |
| Ambiente | `X-Environment: HOMOLOGACAO` ou `PRODUCAO` |
| Formato | JSON, UTF-8 |
| Tempo de resposta | até 25 s; operações demoradas respondem `PROCESSING` e avisam por webhook |
| Erros | `4xx` = recusa definitiva (com `code` e `message`); `5xx`/timeout = o AutoDrive **consulta o status antes de repetir** |

Resposta padrão de operação:

```json
{ "id": "op-123", "status": "PROCESSING | CONFIRMED | REJECTED | CANCELLED", "protocol": "…", "code": "…", "message": "…", "data": {} }
```

## Saúde

`GET /health` → `200` quando a chave é válida (usado no botão *Testar conexão*).

## RENAVE (Resolução Contran 1.026/2026)

| Método | Caminho | Corpo |
|---|---|---|
| POST | `/renave/entradas` | `{ vehicle: { vehicleId, plate, chassi, renavam }, seller?, amount?, nfeKey? }` |
| POST | `/renave/saidas` | `{ vehicle, buyer?, amount?, nfeKey? }` — o AutoDrive só envia com NF-e de saída e ATPV-e assinada |
| POST | `/renave/entradas/{id}/cancelamento` | `{ reason }` |
| POST | `/renave/saidas/{id}/cancelamento` | `{ reason }` |
| POST | `/renave/consignacoes` | `{ vehicle, owner, amount?, nfeKey? }` |
| POST | `/renave/transferencias` | `{ vehicle, fromDoc, toDoc }` (entre estabelecimentos) |
| GET | `/renave/operacoes/{id}` | — status da operação |
| GET | `/renave/operacoes/{id}/documentos` | `{ items: [{ name, url }] }` |
| GET | `/renave/operacoes/{id}/atpv` | `{ url }` |
| GET | `/renave/estoque` | `{ items: [{ chassi, plate }] }` — usado na reconciliação |
| POST | `/renave/elegibilidade` | `{ plate, chassi, renavam }` → `{ eligible, reasons[] }` |

## Transferência de propriedade (Resolução Contran 1.027/2026)

| Método | Caminho | Corpo |
|---|---|---|
| POST | `/transferencias` | `{ vehicle, buyer, amount? }` (intenção de venda) |
| POST | `/transferencias/{id}/etapas` | `{ stage }` — `ATPV_ISSUED`, `SELLER_SIGNED`, `BUYER_SIGNED`, `INSPECTION_DONE`, `FEES_PAID`, `TRANSFER_DONE`, `CRLV_ISSUED` |
| GET | `/transferencias/{id}` | `{ id, status, stage }` |
| GET | `/transferencias/{id}/atpv` · `/assinaturas` · `/vistoria` · `/crlv` | `{ url }` / `{ seller, buyer }` / `{ status }` / `{ url }` |
| POST | `/veiculos/debitos` · `/veiculos/taxas` | `{ plate, renavam, chassi }` → `{ items: [{ description, amount }] }` |
| POST | `/transferencias/{id}/cancelamento` | `{ reason }` |

## Consulta veicular (débitos e restrições)

`POST /veiculos/consultas` com `{ plate, renavam?, chassi?, uf?, document?, reference }` e `GET /veiculos/consultas/{id}`:

```json
{
  "id": "q-1", "status": "PROCESSING | DONE | NOT_FOUND | UNAVAILABLE | ERROR",
  "debts": [{ "type": "IPVA | LICENCIAMENTO | MULTA | DPVAT | TAXA | OUTRO", "description": "", "year": 2026, "amount": 0, "dueDate": "2026-12-31", "expired": false }],
  "restrictions": [{ "kind": "JUDICIAL | ROUBO_FURTO | ADMINISTRATIVA | TRIBUTARIA | RENAJUD | GRAVAME | OUTRA", "blocking": true, "description": "", "institution": null, "reference": "" }]
}
```

## Webhooks (avisos ao AutoDrive)

O endereço aparece na conexão da loja (`/api/webhook/connections/{id}?t=…`). Envie `POST` com JSON contendo `id` único do evento (repetições são descartadas). Com *segredo do webhook*, assine o corpo cru:

```
x-signature: hex(HMAC-SHA256(segredo, corpo))
```

O AutoDrive **não confia no conteúdo do aviso**: ao receber, ele consulta o status pelos endpoints acima. Para a consulta veicular, o corpo do aviso pode ser a própria resposta de `GET /veiculos/consultas/{id}`.
