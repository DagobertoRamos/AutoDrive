"""
sync_job.py — Sincronização automática via APScheduler.

Executa a importação do Painel Master em background a cada N minutos
(configurável via SYNC_INTERVAL_MINUTES no .env), sem depender de nenhuma
requisição HTTP e sem bloquear o servidor FastAPI.

Detalhes de design:
  - Usa BackgroundScheduler (thread separada) para não bloquear o event loop.
  - O lock _sync_running evita execuções concorrentes caso uma rodada demore
    mais que o intervalo configurado.
  - Erros são logados mas nunca levantam exceção — o scheduler continua rodando.
  - O serviço SheetsService é recriado a cada ciclo a partir das settings
    atuais (permite trocar credenciais sem reiniciar o processo).
"""

from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone
from typing import Any

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

from config import get_settings
from services.sheets_service import SheetsService
from services.google_auth    import resolve_credentials_raw, CredentialError
from services.db_settings    import get_master_sheet_id

logger = logging.getLogger(__name__)

# ── Estado compartilhado ──────────────────────────────────────────────────────

_scheduler: BackgroundScheduler | None = None
_sync_lock  = threading.Lock()          # evita execuções simultâneas
_sync_running = False                   # flag de controle
_last_run_summary: dict[str, Any] = {}  # resultado do último ciclo (thread-safe via GIL)


# ── Job principal ─────────────────────────────────────────────────────────────

def _run_sync() -> None:
    """
    Função executada pelo scheduler a cada intervalo.

    Protegida por lock para evitar sobreposição de execuções.
    Todos os erros são capturados — o scheduler nunca para por exceção.
    """
    global _sync_running, _last_run_summary

    # Evita execução concorrente (ex: import lento + scheduler adiantado)
    if not _sync_lock.acquire(blocking=False):
        logger.warning("Sincronização pulada — execução anterior ainda em andamento.")
        return

    _sync_running = True
    started_at = datetime.now(timezone.utc)

    try:
        settings = get_settings()

        if not settings.sync_enabled:
            logger.debug("Scheduler desabilitado (SYNC_ENABLED=false). Pulando.")
            return

        # Resolve sheet ID: banco de dados → .env
        sheet_id = get_master_sheet_id() or settings.master_sheet_id
        if not sheet_id:
            logger.warning(
                "ID da planilha não configurado — sincronização automática ignorada. "
                "Configure via Painel Master ou defina MASTER_SHEET_ID no .env."
            )
            return

        # Resolve credenciais: banco de dados → .env (fresh a cada ciclo)
        try:
            creds = resolve_credentials_raw()
        except CredentialError as exc:
            logger.error("Credencial não encontrada: %s", exc)
            return

        # Resolve aba: GID > nome > primeira aba
        gid      = settings.master_sheet_gid or None
        tab_name = settings.master_sheet_tab or None

        logger.info(
            "▶ Iniciando sincronização automática — planilha=%s | aba=%s",
            sheet_id, tab_name or f"gid={gid}",
        )

        service = SheetsService(credentials_raw=creds)
        result  = service.import_sheet(
            spreadsheet_id=sheet_id,
            gid=gid,
            tab_name=tab_name,
        )

        finished_at = datetime.now(timezone.utc)

        if result.success:
            logger.info(
                "✅ Sincronização concluída — aba=%s | importadas=%d | %dms",
                result.sheet_tab, result.rows_imported, result.duration_ms,
            )
        else:
            logger.error(
                "❌ Sincronização falhou [%s]: %s",
                result.error_code, result.error,
            )

        # Guarda sumário (sem os dados brutos) para /api/sheets/import GET
        _last_run_summary = {
            "success": result.success,
            "scheduledAt": started_at.isoformat(),
            "finishedAt": finished_at.isoformat(),
            "sheetTab": result.sheet_tab,
            "rowsImported": result.rows_imported,
            "rowsSkipped": result.rows_skipped,
            "durationMs": result.duration_ms,
            "error": result.error,
            "errorCode": result.error_code,
        }

    except Exception:
        logger.exception("Erro inesperado no job de sincronização automática.")
        _last_run_summary = {
            "success": False,
            "scheduledAt": started_at.isoformat(),
            "error": "Erro interno inesperado no scheduler. Verifique os logs.",
            "errorCode": "SCHEDULER_INTERNAL_ERROR",
        }
    finally:
        _sync_running = False
        _sync_lock.release()


# ── Ciclo de vida do scheduler ────────────────────────────────────────────────

def start_scheduler() -> None:
    """
    Inicia o BackgroundScheduler com o job de sincronização.

    Deve ser chamado uma única vez no evento `startup` do FastAPI.
    Se SYNC_ENABLED=false, loga e retorna sem criar o scheduler.
    """
    global _scheduler

    settings = get_settings()

    if not settings.sync_enabled:
        logger.info(
            "Scheduler desabilitado (SYNC_ENABLED=false). "
            "Sincronização automática não será executada."
        )
        return

    if _scheduler is not None and _scheduler.running:
        logger.warning("Scheduler já está em execução. Ignorando segunda chamada.")
        return

    interval = settings.sync_interval_minutes
    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.add_job(
        _run_sync,
        trigger=IntervalTrigger(minutes=interval),
        id="sheets_sync",
        name="Painel Master — Sincronização Google Sheets",
        replace_existing=True,
        max_instances=1,          # garante no máximo 1 execução simultânea
        misfire_grace_time=60,    # tolera até 60s de atraso antes de descartar
    )
    _scheduler.start()

    logger.info(
        "✅ Scheduler iniciado — sincronização a cada %d minuto(s).",
        interval,
    )

    # Executa imediatamente na inicialização para popular os dados logo de cara
    threading.Thread(target=_run_sync, name="sheets-sync-startup", daemon=True).start()


def stop_scheduler() -> None:
    """
    Para o scheduler limpa e aguarda jobs em andamento.

    Deve ser chamado no evento `shutdown` do FastAPI.
    """
    global _scheduler

    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=True)
        logger.info("Scheduler encerrado.")
    _scheduler = None


def get_scheduler_status() -> dict[str, Any]:
    """Retorna o estado atual do scheduler para /api/sheets/status."""
    settings = get_settings()
    is_running = _scheduler is not None and _scheduler.running

    next_run: str | None = None
    if is_running:
        job = _scheduler.get_job("sheets_sync")  # type: ignore[union-attr]
        if job and job.next_run_time:
            next_run = job.next_run_time.isoformat()

    return {
        "schedulerRunning": is_running,
        "syncEnabled": settings.sync_enabled,
        "syncIntervalMinutes": settings.sync_interval_minutes,
        "currentlyRunning": _sync_running,
        "nextRunAt": next_run,
        "lastRun": _last_run_summary or None,
    }
