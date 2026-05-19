# AutoDrive — Sheets Service

Microserviço Python (FastAPI) para importação do **Painel Master** (Google Sheets) no sistema EasyCar/AutoDrive.

---

## Pré-requisitos

- Python 3.11+
- Acesso à internet (Google Sheets API)
- Service Account compartilhada com a planilha como **Leitor**

---

## Instalação

```bash
cd sheets-service

# Crie e ative o virtualenv
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Linux/Mac

# Instale as dependências
pip install -r requirements.txt
```

---

## Configuração

### 1. Arquivo `.env`

Copie `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

| Variável | Descrição |
|---|---|
| `GOOGLE_SHEETS_CREDENTIALS` | JSON completo da Service Account em **uma linha** |
| `MASTER_SHEET_ID` | ID da planilha (extraído da URL) |
| `MASTER_SHEET_GID` | GID numérico da aba (`0` = primeira) |
| `MASTER_SHEET_TAB` | Nome da aba (fallback se GID = 0) |
| `SYNC_INTERVAL_MINUTES` | Intervalo da sincronização automática (padrão: `5`) |
| `SYNC_ENABLED` | Ativa/desativa o scheduler (`true`/`false`) |

### 2. Como preencher `GOOGLE_SHEETS_CREDENTIALS`

Cole o JSON inteiro **em uma única linha** — sem quebras de linha externas.
As quebras dentro de `private_key` devem ser `\n` (barra-n literal):

```
GOOGLE_SHEETS_CREDENTIALS={"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\nMII...\n-----END PRIVATE KEY-----\n","client_email":"..."}
```

### 3. Como obter o `MASTER_SHEET_ID`

Abra a planilha no browser. A URL será:
```
https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit
```
O ID é: `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms`

### 4. Compartilhar a planilha com a Service Account

No Google Drive, clique em **Compartilhar** e adicione:
```
easycar@newagent-irof.iam.gserviceaccount.com
```
Com papel de **Leitor**.

---

## Execução

```bash
# Desenvolvimento (com reload automático)
uvicorn main:app --reload --port 8000

# Produção
python main.py
```

Acesse a documentação interativa em: **http://localhost:8000/docs**

---

## Endpoints

| Método | URL | Descrição |
|--------|-----|-----------|
| `GET`  | `/` | Health check básico |
| `GET`  | `/health` | Status detalhado + scheduler |
| `GET`  | `/api/sheets/status` | Configurações ativas |
| `POST` | `/api/sheets/test-access` | Valida acesso à planilha |
| `POST` | `/api/sheets/import` | Importa dados de uma aba |
| `GET`  | `/api/sheets/import` | Resumo da última importação |
| `POST` | `/api/sheets/sync/trigger` | Dispara sincronização manual |

---

## Sincronização automática

O scheduler inicia junto com o servidor e executa `import_sheet()` a cada `SYNC_INTERVAL_MINUTES` minutos. Também roda **imediatamente** ao iniciar para popular os dados sem esperar o primeiro ciclo.

Para desativar: `SYNC_ENABLED=false` no `.env`.

Para disparar manualmente:
```bash
curl -X POST "http://localhost:8000/api/sheets/sync/trigger"
```

---

## Estrutura

```
sheets-service/
├── main.py               # FastAPI app + lifecycle
├── config.py             # Settings (Pydantic + .env)
├── requirements.txt
├── .env.example
├── services/
│   ├── google_auth.py    # Parse de credenciais (JSON/Base64)
│   └── sheets_service.py # Conexão, leitura e normalização de dados
├── api/
│   └── sheets_router.py  # Endpoints FastAPI
└── scheduler/
    └── sync_job.py       # APScheduler (sincronização automática)
```
