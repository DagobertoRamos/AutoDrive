"""
google_auth.py — Parsing e validação de credenciais Google Service Account.

Suporta 4 formatos de entrada para GOOGLE_SHEETS_CREDENTIALS:
  1. JSON puro em linha única  ({"type":"service_account",...})
  2. JSON com \\n literais      (private_key com \\n em vez de newline real)
  3. Base64 puro               (eyJ0eXBlIjoic2Vydm...)
  4. Prefixo "base64:"          (base64:eyJ0eXBlIjo...)

A função parse_credentials() retorna um dict validado com todos os campos
obrigatórios de uma Service Account Google.

Prioridade de resolução de credenciais em build_gspread_client():
  1. Argumento explícito credentials_raw
  2. Banco de dados (system_settings via db_settings.get_sheets_creds())
  3. Variável de ambiente GOOGLE_SHEETS_CREDENTIALS
"""

from __future__ import annotations

import base64
import json
import logging
from typing import Any

import gspread
from google.oauth2.service_account import Credentials

logger = logging.getLogger(__name__)

# Escopos necessários para leitura do Google Sheets
_SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]

# Campos obrigatórios em qualquer JSON de Service Account Google
_REQUIRED_FIELDS = {
    "type",
    "project_id",
    "private_key_id",
    "private_key",
    "client_email",
    "client_id",
    "auth_uri",
    "token_uri",
}


class CredentialError(Exception):
    """Erro específico de parsing/validação de credencial."""


def parse_credentials(raw: str) -> dict[str, Any]:
    """
    Converte a string bruta da env var num dicionário de credenciais validado.

    Raises:
        CredentialError: se o valor estiver vazio, malformado ou incompleto.
    """
    value = (raw or "").strip()

    if not value:
        raise CredentialError(
            "GOOGLE_SHEETS_CREDENTIALS está vazia. "
            "Preencha a variável de ambiente com o JSON da Service Account."
        )

    # ── Detectar e decodificar Base64 ─────────────────────────────────────────
    if value.startswith("base64:"):
        value = _decode_base64(value[len("base64:"):].strip(), source="prefixo base64:")
    elif not value.startswith("{"):
        # Tenta decodificar como Base64 puro (sem prefixo)
        value = _decode_base64(value, source="Base64 sem prefixo")

    # ── Corrigir \\n literais na private_key (comum ao salvar em .env) ─────────
    # Substitui o escape literal "\\n" por newline real ANTES do JSON parse,
    # apenas dentro da string bruta (evita afetar outras chaves).
    value = value.replace("\\n", "\n")

    # ── Parse JSON ────────────────────────────────────────────────────────────
    try:
        data: dict[str, Any] = json.loads(value)
    except json.JSONDecodeError as exc:
        raise CredentialError(
            f"GOOGLE_SHEETS_CREDENTIALS não é um JSON válido: {exc}. "
            "Certifique-se de que todo o JSON está em uma única linha no .env."
        ) from exc

    if not isinstance(data, dict):
        raise CredentialError(
            "GOOGLE_SHEETS_CREDENTIALS deve ser um objeto JSON ({}), não uma lista ou valor simples."
        )

    # ── Validar tipo ──────────────────────────────────────────────────────────
    account_type = data.get("type", "")
    if account_type != "service_account":
        raise CredentialError(
            f'GOOGLE_SHEETS_CREDENTIALS: campo "type" deve ser "service_account", '
            f'mas encontrado: "{account_type}". '
            "Use a credencial de Service Account (não OAuth2 user)."
        )

    # ── Validar campos obrigatórios ───────────────────────────────────────────
    missing = _REQUIRED_FIELDS - data.keys()
    if missing:
        raise CredentialError(
            f"GOOGLE_SHEETS_CREDENTIALS: campos obrigatórios ausentes: {sorted(missing)}. "
            "Verifique se o JSON da Service Account está completo."
        )

    # ── Validar private_key ───────────────────────────────────────────────────
    pk: str = data.get("private_key", "")
    if "BEGIN PRIVATE KEY" not in pk:
        raise CredentialError(
            'GOOGLE_SHEETS_CREDENTIALS: campo "private_key" inválido. '
            "Verifique se a chave privada começa com '-----BEGIN PRIVATE KEY-----'."
        )

    logger.info(
        "Credencial validada — client_email=%s | project=%s",
        data.get("client_email"),
        data.get("project_id"),
    )
    return data


def resolve_credentials_raw(credentials_raw: str | None = None) -> str:
    """
    Resolve a string de credenciais seguindo a cadeia de prioridade:
      1. Argumento explícito (credentials_raw não vazio)
      2. Banco de dados (system_settings)
      3. Variável de ambiente GOOGLE_SHEETS_CREDENTIALS

    Raises:
        CredentialError: se nenhuma fonte retornar credencial válida.
    """
    import os
    from services.db_settings import get_sheets_creds

    # 1. Argumento explícito
    if credentials_raw and credentials_raw.strip():
        logger.debug("Usando credencial passada explicitamente.")
        return credentials_raw.strip()

    # 2. Banco de dados
    try:
        db_creds = get_sheets_creds()
        if db_creds and db_creds.strip():
            logger.debug("Usando credencial do banco de dados.")
            return db_creds.strip()
    except Exception as exc:
        logger.warning("Erro ao buscar credencial do banco (fallback para env): %s", exc)

    # 3. Variável de ambiente
    env_creds = os.environ.get("GOOGLE_SHEETS_CREDENTIALS", "").strip()
    if env_creds:
        logger.debug("Usando credencial da variável de ambiente GOOGLE_SHEETS_CREDENTIALS.")
        return env_creds

    raise CredentialError(
        "Nenhuma credencial Google Sheets configurada. "
        "Configure via Painel Master (banco de dados) ou defina GOOGLE_SHEETS_CREDENTIALS no .env."
    )


def build_gspread_client(credentials_raw: str | None = None) -> gspread.Client:
    """
    Autentica com a Service Account e retorna um gspread.Client pronto para uso.

    Args:
        credentials_raw: credencial bruta opcional. Se None ou vazia, resolve
                         automaticamente via banco de dados → variável de ambiente.

    Returns:
        gspread.Client autenticado.

    Raises:
        CredentialError: se as credenciais forem inválidas ou não encontradas.
        Exception: se a autenticação com a Google API falhar.
    """
    raw = resolve_credentials_raw(credentials_raw)
    cred_dict = parse_credentials(raw)

    google_creds = Credentials.from_service_account_info(cred_dict, scopes=_SCOPES)
    client = gspread.authorize(google_creds)

    logger.info("gspread.Client autenticado com sucesso.")
    return client


# ── Helpers internos ──────────────────────────────────────────────────────────

def _decode_base64(encoded: str, *, source: str) -> str:
    """Decodifica uma string Base64 para UTF-8, levantando CredentialError se inválida."""
    # Adiciona padding se necessário (Base64 deve ser múltiplo de 4)
    padding = 4 - len(encoded) % 4
    if padding != 4:
        encoded += "=" * padding

    try:
        decoded = base64.b64decode(encoded).decode("utf-8")
    except Exception as exc:
        raise CredentialError(
            f"GOOGLE_SHEETS_CREDENTIALS detectada como {source}, "
            f"mas falhou ao decodificar Base64: {exc}"
        ) from exc

    logger.debug("Credencial decodificada de %s com sucesso.", source)
    return decoded
