"""
sheets_service.py — Serviço centralizado de leitura do Painel Master (Google Sheets).

Responsabilidades:
  - Gerenciar a conexão autenticada com o Google Sheets (singleton com reconexão).
  - Abrir a planilha correta pelo ID.
  - Navegar entre abas por GID (numérico) ou por nome.
  - Ler, normalizar e retornar os dados de cada aba como lista de dicts.
  - Expor métricas da última importação para o endpoint /status.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import gspread
from gspread.exceptions import APIError, NoValidUrlKeyFound, SpreadsheetNotFound

from services.google_auth import CredentialError, build_gspread_client

logger = logging.getLogger(__name__)


# ── DTOs / resultados ─────────────────────────────────────────────────────────

@dataclass
class ImportResult:
    """Resultado de uma operação de importação."""
    success: bool
    spreadsheet_title: str = ""
    sheet_tab: str = ""
    rows_total: int = 0
    rows_imported: int = 0
    rows_skipped: int = 0          # linhas vazias ignoradas
    columns: list[str] = field(default_factory=list)
    data: list[dict[str, Any]] = field(default_factory=list)
    duration_ms: int = 0
    error: str = ""
    error_code: str = ""
    timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "success": self.success,
            "spreadsheetTitle": self.spreadsheet_title,
            "sheetTab": self.sheet_tab,
            "rowsTotal": self.rows_total,
            "rowsImported": self.rows_imported,
            "rowsSkipped": self.rows_skipped,
            "columns": self.columns,
            "data": self.data,
            "durationMs": self.duration_ms,
            "error": self.error,
            "errorCode": self.error_code,
            "timestamp": self.timestamp,
        }


@dataclass
class AccessResult:
    """Resultado de /test-access."""
    success: bool
    spreadsheet_title: str = ""
    spreadsheet_url: str = ""
    available_tabs: list[dict[str, Any]] = field(default_factory=list)
    service_account_email: str = ""
    duration_ms: int = 0
    error: str = ""
    error_code: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "success": self.success,
            "spreadsheetTitle": self.spreadsheet_title,
            "spreadsheetUrl": self.spreadsheet_url,
            "availableTabs": self.available_tabs,
            "serviceAccountEmail": self.service_account_email,
            "durationMs": self.duration_ms,
            "error": self.error,
            "errorCode": self.error_code,
        }


# ── Serviço principal ─────────────────────────────────────────────────────────

class SheetsService:
    """
    Serviço de acesso ao Google Sheets com conexão reutilizável.

    O client gspread é criado uma vez e reutilizado. Em caso de erro de
    autenticação (token expirado), o client é recriado automaticamente.
    """

    def __init__(self, credentials_raw: str) -> None:
        self._credentials_raw = credentials_raw
        self._client: gspread.Client | None = None
        self._last_import: ImportResult | None = None

    # ── Conexão ───────────────────────────────────────────────────────────────

    def _get_client(self) -> gspread.Client:
        """Retorna o client autenticado, recriando-o se necessário."""
        if self._client is None:
            self._client = build_gspread_client(self._credentials_raw)
        return self._client

    def _reset_client(self) -> None:
        """Força recriação do client na próxima chamada (útil após expiração de token)."""
        self._client = None

    # ── Acesso à planilha ─────────────────────────────────────────────────────

    def _open_spreadsheet(self, spreadsheet_id: str) -> gspread.Spreadsheet:
        """
        Abre a planilha pelo ID, com retry único após erro de autenticação.

        Raises:
            ValueError: ID vazio.
            SpreadsheetNotFound: planilha não encontrada (sem acesso ou ID errado).
            APIError: erro da Google API.
        """
        if not spreadsheet_id.strip():
            raise ValueError(
                "spreadsheet_id não pode ser vazio. "
                "Defina MASTER_SHEET_ID no .env ou passe via parâmetro."
            )

        try:
            return self._get_client().open_by_key(spreadsheet_id)
        except gspread.exceptions.APIError as exc:
            # Token expirado (401) — força reconexão e tenta novamente
            if exc.response.status_code == 401:
                logger.warning("Token expirado, reconectando...")
                self._reset_client()
                return self._get_client().open_by_key(spreadsheet_id)
            raise

    def _resolve_worksheet(
        self,
        spreadsheet: gspread.Spreadsheet,
        gid: int | None,
        tab_name: str | None,
    ) -> gspread.Worksheet:
        """
        Retorna a aba correta por GID (prioridade) ou por nome.

        Raises:
            ValueError: aba não encontrada.
        """
        worksheets = spreadsheet.worksheets()

        # Prioridade: GID numérico
        if gid is not None:
            for ws in worksheets:
                if ws.id == gid:
                    return ws
            available = [f"{ws.title} (gid={ws.id})" for ws in worksheets]
            raise ValueError(
                f"Aba com gid={gid} não encontrada na planilha. "
                f"Abas disponíveis: {available}"
            )

        # Fallback: nome da aba
        if tab_name:
            for ws in worksheets:
                if ws.title.strip().lower() == tab_name.strip().lower():
                    return ws
            available = [ws.title for ws in worksheets]
            raise ValueError(
                f'Aba "{tab_name}" não encontrada. '
                f"Abas disponíveis: {available}"
            )

        # Nenhum critério — usa a primeira aba
        return worksheets[0]

    # ── Operações públicas ────────────────────────────────────────────────────

    def test_access(
        self,
        spreadsheet_id: str,
        service_account_email: str = "",
    ) -> AccessResult:
        """
        Verifica se o servidor consegue abrir o Painel Master.

        Retorna metadados da planilha (título, abas disponíveis) sem importar dados.
        """
        t0 = time.monotonic()
        try:
            spreadsheet = self._open_spreadsheet(spreadsheet_id)
            worksheets  = spreadsheet.worksheets()

            tabs = [
                {"title": ws.title, "gid": ws.id, "rowCount": ws.row_count}
                for ws in worksheets
            ]
            duration_ms = int((time.monotonic() - t0) * 1000)

            logger.info(
                "test_access OK — planilha=%s | abas=%d | %dms",
                spreadsheet.title, len(tabs), duration_ms,
            )
            return AccessResult(
                success=True,
                spreadsheet_title=spreadsheet.title,
                spreadsheet_url=spreadsheet.url,
                available_tabs=tabs,
                service_account_email=service_account_email,
                duration_ms=duration_ms,
            )

        except CredentialError as exc:
            return self._access_error(str(exc), "CREDENTIAL_ERROR", t0)
        except SpreadsheetNotFound:
            return self._access_error(
                "Planilha não encontrada. Verifique se o ID está correto e se a "
                "Service Account foi compartilhada com acesso de 'Leitor'.",
                "SPREADSHEET_NOT_FOUND", t0,
            )
        except NoValidUrlKeyFound:
            return self._access_error(
                "ID de planilha inválido.",
                "INVALID_SPREADSHEET_ID", t0,
            )
        except APIError as exc:
            return self._access_error(
                f"Erro da API Google: {exc}",
                "GOOGLE_API_ERROR", t0,
            )
        except Exception as exc:
            logger.exception("Erro inesperado em test_access")
            return self._access_error(str(exc), "UNKNOWN_ERROR", t0)

    def import_sheet(
        self,
        spreadsheet_id: str,
        gid: int | None = None,
        tab_name: str | None = None,
    ) -> ImportResult:
        """
        Lê todos os dados de uma aba e retorna linhas como lista de dicts.

        A primeira linha da aba é tratada como cabeçalho (nomes das colunas).
        Linhas inteiramente vazias são ignoradas.

        Args:
            spreadsheet_id: ID da planilha.
            gid:            GID numérico da aba (prioridade sobre tab_name).
            tab_name:       Nome da aba (fallback se gid não fornecido).

        Returns:
            ImportResult com os dados e metadados da operação.
        """
        t0 = time.monotonic()
        try:
            spreadsheet = self._open_spreadsheet(spreadsheet_id)
            worksheet   = self._resolve_worksheet(spreadsheet, gid, tab_name)

            logger.info(
                "Lendo aba '%s' (gid=%s) da planilha '%s'...",
                worksheet.title, worksheet.id, spreadsheet.title,
            )

            # get_all_values() retorna lista de listas (string)
            raw_rows: list[list[str]] = worksheet.get_all_values()

            if not raw_rows:
                duration_ms = int((time.monotonic() - t0) * 1000)
                result = ImportResult(
                    success=True,
                    spreadsheet_title=spreadsheet.title,
                    sheet_tab=worksheet.title,
                    rows_total=0,
                    rows_imported=0,
                    duration_ms=duration_ms,
                )
                self._last_import = result
                return result

            # Primeira linha = cabeçalhos; demais = dados
            headers: list[str] = [h.strip() for h in raw_rows[0]]
            data_rows = raw_rows[1:]

            records: list[dict[str, Any]] = []
            skipped = 0

            for row in data_rows:
                # Padeia com strings vazias se a linha tem menos colunas que o header
                padded = row + [""] * (len(headers) - len(row))
                record = {
                    headers[i]: _coerce_value(padded[i])
                    for i in range(len(headers))
                    if headers[i]  # ignora colunas sem nome no cabeçalho
                }

                # Descarta linhas completamente vazias
                if all(v in ("", None) for v in record.values()):
                    skipped += 1
                    continue

                records.append(record)

            duration_ms = int((time.monotonic() - t0) * 1000)

            logger.info(
                "Importação concluída — aba=%s | importadas=%d | ignoradas=%d | %dms",
                worksheet.title, len(records), skipped, duration_ms,
            )

            result = ImportResult(
                success=True,
                spreadsheet_title=spreadsheet.title,
                sheet_tab=worksheet.title,
                rows_total=len(data_rows),
                rows_imported=len(records),
                rows_skipped=skipped,
                columns=headers,
                data=records,
                duration_ms=duration_ms,
            )
            self._last_import = result
            return result

        except CredentialError as exc:
            return self._import_error(str(exc), "CREDENTIAL_ERROR", t0)
        except ValueError as exc:
            return self._import_error(str(exc), "INVALID_ARGUMENT", t0)
        except SpreadsheetNotFound:
            return self._import_error(
                "Planilha não encontrada. Verifique o ID e as permissões da Service Account.",
                "SPREADSHEET_NOT_FOUND", t0,
            )
        except APIError as exc:
            # Erro 403 = sem permissão (Service Account não foi compartilhada)
            if exc.response.status_code == 403:
                return self._import_error(
                    "Acesso negado. Compartilhe a planilha com a Service Account "
                    "(easycar@newagent-irof.iam.gserviceaccount.com) como 'Leitor'.",
                    "PERMISSION_DENIED", t0,
                )
            return self._import_error(f"Erro da API Google: {exc}", "GOOGLE_API_ERROR", t0)
        except Exception as exc:
            logger.exception("Erro inesperado em import_sheet")
            return self._import_error(str(exc), "UNKNOWN_ERROR", t0)

    @property
    def last_import(self) -> ImportResult | None:
        """Retorna o resultado da última importação executada."""
        return self._last_import

    # ── Helpers privados ──────────────────────────────────────────────────────

    @staticmethod
    def _access_error(error: str, code: str, t0: float) -> AccessResult:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.error("test_access FALHOU [%s]: %s", code, error)
        return AccessResult(success=False, error=error, error_code=code, duration_ms=duration_ms)

    @staticmethod
    def _import_error(error: str, code: str, t0: float) -> ImportResult:
        duration_ms = int((time.monotonic() - t0) * 1000)
        logger.error("import_sheet FALHOU [%s]: %s", code, error)
        return ImportResult(success=False, error=error, error_code=code, duration_ms=duration_ms)


# ── Helpers de normalização ───────────────────────────────────────────────────

def _coerce_value(raw: str) -> Any:
    """
    Converte string do Sheets para o tipo Python mais adequado.

    Ordem de tentativas: int → float → bool → string.
    Mantém string vazia como "".
    """
    s = raw.strip()
    if s == "":
        return ""

    # Booleanos comuns em planilhas brasileiras
    if s.upper() in ("TRUE", "VERDADEIRO", "SIM", "S"):
        return True
    if s.upper() in ("FALSE", "FALSO", "NÃO", "NAO", "N"):
        return False

    # Número inteiro (sem ponto/vírgula)
    try:
        return int(s)
    except ValueError:
        pass

    # Número decimal (com ponto ou vírgula BR)
    try:
        return float(s.replace(",", "."))
    except ValueError:
        pass

    return s
