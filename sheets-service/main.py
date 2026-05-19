"""
main.py — Entry point do AutoDrive Sheets Service (FastAPI).

Execução:
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload

Ou via Python:
    python main.py
"""

from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.sheets_router import router as sheets_router
from config import get_settings
from scheduler.sync_job import get_scheduler_status, start_scheduler, stop_scheduler

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


# ── Lifecycle ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Gerencia o ciclo de vida da aplicação:
      - Startup:  valida configurações mínimas, inicia o scheduler.
      - Shutdown: encerra o scheduler ordenadamente.
    """
    settings = get_settings()

    logger.info("=" * 60)
    logger.info("AutoDrive Sheets Service iniciando...")
    logger.info("Host:           %s:%d", settings.host, settings.port)
    logger.info("Sheet ID:       %s", settings.master_sheet_id or "(não configurado)")
    logger.info("Sheet Tab/GID:  %s / gid=%d", settings.master_sheet_tab, settings.master_sheet_gid)
    logger.info("Sync enabled:   %s (%dmin)", settings.sync_enabled, settings.sync_interval_minutes)
    logger.info("Credentials:    %s", "✅ configuradas" if settings.google_sheets_credentials.strip() else "❌ AUSENTES")
    logger.info("=" * 60)

    # Aviso visível se credenciais ausentes (não bloqueia o start)
    if not settings.google_sheets_credentials.strip():
        logger.warning(
            "⚠️  GOOGLE_SHEETS_CREDENTIALS não configurada. "
            "Os endpoints de importação retornarão erro 503 até que seja definida no .env."
        )

    start_scheduler()
    logger.info("Servidor pronto. Documentação: http://%s:%d/docs", settings.host, settings.port)

    yield  # ← aplicação em execução

    logger.info("Encerrando AutoDrive Sheets Service...")
    stop_scheduler()
    logger.info("Serviço encerrado.")


# ── App ───────────────────────────────────────────────────────────────────────

settings = get_settings()

app = FastAPI(
    title="AutoDrive — Sheets Importer",
    description=(
        "Backend de importação do Painel Master (Google Sheets) para o sistema AutoDrive/EasyCar. "
        "Fornece autenticação via Service Account, importação por aba (GID ou nome) "
        "e sincronização automática configurável."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# Ajuste as origens conforme o ambiente (dev/prod).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",    # Next.js dev
        "http://localhost:3001",
        "https://easycar.com.br",  # prod — ajuste conforme necessário
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(sheets_router)


# ── Rotas raiz ────────────────────────────────────────────────────────────────

@app.get("/", tags=["Health"])
async def root() -> dict:
    """Health check básico."""
    return {
        "service": "AutoDrive Sheets Importer",
        "status": "ok",
        "docs": "/docs",
        "version": "1.0.0",
    }


@app.get("/health", tags=["Health"])
async def health() -> dict:
    """Health check detalhado com status do scheduler."""
    return {
        "status": "ok",
        "scheduler": get_scheduler_status(),
    }


# ── Handler global de exceções ────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Exceção não tratada em %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Erro interno do servidor.",
            "errorCode": "INTERNAL_SERVER_ERROR",
            "detail": str(exc),
        },
    )


# ── Entrypoint direto ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level="info",
    )
