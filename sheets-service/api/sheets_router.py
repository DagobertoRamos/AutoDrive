"""
sheets_router.py — Endpoints FastAPI do módulo Importador Google Sheets.

Rotas disponíveis:
  GET  /api/sheets/status          — Status do serviço e última importação
  POST /api/sheets/test-access     — Valida acesso ao Painel Master
  POST /api/sheets/import          — Importa dados de uma aba específica
  GET  /api/sheets/import          — Retorna resultado da última importação
  POST /api/sheets/sync/trigger    — Dispara sincronização manual (mesma lógica do scheduler)
"""

from __future__ import annotations

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from config import Settings, get_settings
from services.google_auth import CredentialError
from services.sheets_service import SheetsService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sheets", tags=["Google Sheets"])


# ── Dependências ──────────────────────────────────────────────────────────────

def get_service(settings: Annotated[Settings, Depends(get_settings)]) -> SheetsService:
    """
    Cria (ou reutiliza) o SheetsService com as credenciais do .env.

    Levanta 503 se GOOGLE_SHEETS_CREDENTIALS não está configurada,
    e 500 com mensagem clara se o JSON for inválido.
    """
    if not settings.google_sheets_credentials.strip():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "Credencial Google não configurada.",
                "errorCode": "CREDENTIALS_MISSING",
                "hint": "Defina GOOGLE_SHEETS_CREDENTIALS no arquivo .env do servidor.",
            },
        )
    try:
        return SheetsService(credentials_raw=settings.google_sheets_credentials)
    except CredentialError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": str(exc), "errorCode": "CREDENTIAL_PARSE_ERROR"},
        ) from exc


# ── Schemas de Request ────────────────────────────────────────────────────────

class TestAccessRequest(BaseModel):
    spreadsheet_id: str = Field(
        default="",
        description="ID da planilha. Se vazio, usa MASTER_SHEET_ID do .env.",
    )


class ImportRequest(BaseModel):
    spreadsheet_id: str = Field(
        default="",
        description="ID da planilha. Se vazio, usa MASTER_SHEET_ID do .env.",
    )
    gid: int | None = Field(
        default=None,
        description="GID numérico da aba (prioridade sobre tab_name).",
    )
    tab_name: str | None = Field(
        default=None,
        description="Nome da aba (usado se gid não fornecido).",
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/status", summary="Status do serviço e última importação")
async def get_status(
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    """
    Retorna se o serviço está ativo, configurações básicas e o resumo
    da última importação (sem retornar os dados completos).
    """
    has_creds = bool(settings.google_sheets_credentials.strip())
    return {
        "service": "AutoDrive Sheets Importer",
        "status": "ok",
        "credentialsConfigured": has_creds,
        "masterSheetId": settings.master_sheet_id or None,
        "masterSheetTab": settings.master_sheet_tab or None,
        "masterSheetGid": settings.master_sheet_gid,
        "syncEnabled": settings.sync_enabled,
        "syncIntervalMinutes": settings.sync_interval_minutes,
    }


@router.post("/test-access", summary="Valida acesso ao Painel Master")
async def test_access(
    body: TestAccessRequest,
    service: Annotated[SheetsService, Depends(get_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    """
    Abre o Painel Master e retorna título, URL e lista de abas disponíveis.

    Não importa nenhum dado — apenas valida conectividade e permissões.

    **Erros comuns:**
    - `SPREADSHEET_NOT_FOUND`: ID errado ou Service Account sem acesso → compartilhe a planilha.
    - `CREDENTIAL_ERROR`: JSON da Service Account inválido → verifique o .env.
    - `PERMISSION_DENIED`: Service Account existe mas não tem permissão de leitura.
    """
    sheet_id = body.spreadsheet_id.strip() or settings.master_sheet_id

    if not sheet_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "spreadsheet_id não fornecido e MASTER_SHEET_ID não está configurado no .env.",
                "errorCode": "MISSING_SPREADSHEET_ID",
            },
        )

    # Extrai o e-mail da Service Account para retornar como hint de compartilhamento
    sa_email = _extract_client_email(settings.google_sheets_credentials)
    result = service.test_access(spreadsheet_id=sheet_id, service_account_email=sa_email)

    if not result.success:
        # Retorna 200 com success=false para que o frontend possa exibir a mensagem
        return _error_envelope(result.error, result.error_code, result.duration_ms, sa_email)

    return result.to_dict()


@router.post("/import", summary="Importa dados de uma aba do Painel Master")
async def import_sheet(
    body: ImportRequest,
    service: Annotated[SheetsService, Depends(get_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    """
    Lê todos os dados de uma aba e retorna como lista de objetos JSON.

    **Regras de resolução da aba:**
    1. `body.gid` (se fornecido)
    2. `body.tab_name` (se fornecido)
    3. `MASTER_SHEET_GID` do .env
    4. `MASTER_SHEET_TAB` do .env
    5. Primeira aba da planilha (fallback)
    """
    sheet_id = body.spreadsheet_id.strip() or settings.master_sheet_id

    if not sheet_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "spreadsheet_id não fornecido e MASTER_SHEET_ID não está configurado no .env.",
                "errorCode": "MISSING_SPREADSHEET_ID",
            },
        )

    # Resolve aba: prioridade body > .env > primeira aba
    resolved_gid      = body.gid if body.gid is not None else (settings.master_sheet_gid or None)
    resolved_tab_name = body.tab_name or settings.master_sheet_tab or None

    result = service.import_sheet(
        spreadsheet_id=sheet_id,
        gid=resolved_gid,
        tab_name=resolved_tab_name,
    )

    if not result.success:
        return _error_envelope(result.error, result.error_code, result.duration_ms)

    return result.to_dict()


@router.get("/import", summary="Retorna resultado da última importação")
async def get_last_import(
    service: Annotated[SheetsService, Depends(get_service)],
) -> dict[str, Any]:
    """
    Retorna o resultado (sem os dados completos) da última importação executada.
    Útil para checar se o scheduler está funcionando.
    """
    last = service.last_import
    if last is None:
        return {
            "success": False,
            "error": "Nenhuma importação foi executada ainda.",
            "errorCode": "NO_IMPORT_YET",
        }

    # Retorna apenas metadados, sem os dados completos (potencialmente grande)
    summary = last.to_dict()
    summary.pop("data", None)
    return summary


@router.post("/sync/trigger", summary="Dispara sincronização manual")
async def trigger_sync(
    service: Annotated[SheetsService, Depends(get_service)],
    settings: Annotated[Settings, Depends(get_settings)],
    spreadsheet_id: str = Query(default="", description="Override do ID da planilha"),
    gid: int | None = Query(default=None, description="Override do GID da aba"),
    tab_name: str | None = Query(default=None, description="Override do nome da aba"),
) -> dict[str, Any]:
    """
    Executa imediatamente a mesma lógica do scheduler automático.

    Útil para testar a sincronização sem esperar o próximo ciclo.
    """
    sheet_id = spreadsheet_id.strip() or settings.master_sheet_id

    if not sheet_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "MASTER_SHEET_ID não configurado.", "errorCode": "MISSING_SPREADSHEET_ID"},
        )

    resolved_gid      = gid if gid is not None else (settings.master_sheet_gid or None)
    resolved_tab_name = tab_name or settings.master_sheet_tab or None

    result = service.import_sheet(
        spreadsheet_id=sheet_id,
        gid=resolved_gid,
        tab_name=resolved_tab_name,
    )

    summary = result.to_dict()
    summary.pop("data", None)   # não retorna dados brutos no trigger manual
    return summary


# ── Helpers ───────────────────────────────────────────────────────────────────

def _error_envelope(
    error: str,
    error_code: str,
    duration_ms: int,
    service_account_email: str = "",
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "success": False,
        "error": error,
        "errorCode": error_code,
        "durationMs": duration_ms,
    }
    if service_account_email:
        payload["hint"] = (
            f"Compartilhe a planilha com '{service_account_email}' como 'Leitor' "
            "no Google Drive."
        )
    return payload


def _extract_client_email(credentials_raw: str) -> str:
    """Extrai o client_email sem lançar exceção (para uso em hints)."""
    import json, base64
    try:
        v = credentials_raw.strip()
        if v.startswith("base64:"):
            v = base64.b64decode(v[7:] + "==").decode()
        elif not v.startswith("{"):
            v = base64.b64decode(v + "==").decode()
        return json.loads(v.replace("\\n", "\n")).get("client_email", "")
    except Exception:
        return ""
