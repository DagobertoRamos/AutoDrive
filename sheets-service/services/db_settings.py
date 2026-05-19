"""
db_settings.py — Leitura de configurações do banco de dados PostgreSQL.

Conecta diretamente ao banco do sistema (Next.js / Prisma) e lê os registros
da tabela system_settings para obter credenciais do Google Sheets.

As credenciais são armazenadas criptografadas com AES-256-GCM pelo módulo
src/lib/crypto.ts do Next.js, no formato:
    enc:v1:<ivHex>:<authTagHex>:<dataHex>

Este módulo replica a lógica de descriptografia em Python usando a mesma
chave MASTER_ENCRYPTION_KEY do ambiente.
"""

from __future__ import annotations

import binascii
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

# Prefixo do formato de criptografia (mirror de src/lib/crypto.ts)
_ENC_PREFIX = "enc:v1:"

# Chaves no banco (mirror de src/app/api/master/sheets/settings/route.ts)
_KEY_JSON = "sheets.serviceAccountJson"
_KEY_ID   = "sheets.masterSheetId"


def _get_master_key() -> bytes:
    """
    Lê MASTER_ENCRYPTION_KEY do ambiente e retorna como bytes hex-decodificados.

    Raises:
        RuntimeError: se a variável não estiver definida ou for inválida.
    """
    raw = os.environ.get("MASTER_ENCRYPTION_KEY", "").strip()
    if not raw:
        raise RuntimeError(
            "MASTER_ENCRYPTION_KEY não está definida no ambiente. "
            "Essa variável é necessária para descriptografar as credenciais do banco."
        )
    try:
        key = bytes.fromhex(raw)
    except ValueError as exc:
        raise RuntimeError(
            f"MASTER_ENCRYPTION_KEY deve ser uma string hexadecimal válida: {exc}"
        ) from exc

    if len(key) not in (16, 24, 32):
        raise RuntimeError(
            f"MASTER_ENCRYPTION_KEY deve ter 16, 24 ou 32 bytes (AES-128/192/256). "
            f"Tamanho atual: {len(key)} bytes."
        )
    return key


def _decrypt(encrypted: str) -> str:
    """
    Descriptografa um valor AES-256-GCM no formato  enc:v1:<iv>:<tag>:<data>.

    Replica exatamente a função decrypt() de src/lib/crypto.ts.

    Raises:
        ValueError: se o formato for inválido ou a descriptografia falhar.
    """
    if not encrypted.startswith(_ENC_PREFIX):
        # Valor não criptografado — retorna como está
        return encrypted

    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except ImportError as exc:
        raise RuntimeError(
            "O pacote 'cryptography' não está instalado. "
            "Execute: pip install cryptography"
        ) from exc

    rest = encrypted[len(_ENC_PREFIX):]
    parts = rest.split(":")
    if len(parts) != 3:
        raise ValueError(
            f"Formato de valor criptografado inválido: esperado 3 segmentos após o prefixo, "
            f"encontrado {len(parts)}. Valor: {encrypted[:40]}…"
        )

    iv_hex, tag_hex, data_hex = parts
    try:
        iv       = bytes.fromhex(iv_hex)
        auth_tag = bytes.fromhex(tag_hex)
        ciphertext = bytes.fromhex(data_hex)
    except (ValueError, binascii.Error) as exc:
        raise ValueError(f"Segmentos hex inválidos no valor criptografado: {exc}") from exc

    key = _get_master_key()
    aesgcm = AESGCM(key)

    # AESGCM do Python espera ciphertext + auth_tag concatenados
    try:
        plaintext = aesgcm.decrypt(iv, ciphertext + auth_tag, None)
    except Exception as exc:
        raise ValueError(
            f"Falha na descriptografia AES-GCM (chave incorreta ou dados corrompidos): {exc}"
        ) from exc

    return plaintext.decode("utf-8")


def _fetch_setting(key: str) -> Optional[str]:
    """
    Lê um valor da tabela system_settings pelo campo key.

    Usa psycopg2 com a DATABASE_URL do ambiente.
    Retorna None se o registro não existir ou se DATABASE_URL não estiver configurada.
    """
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        logger.debug("DATABASE_URL não configurada — pulando leitura do banco.")
        return None

    try:
        import psycopg2
    except ImportError:
        logger.warning(
            "psycopg2 não instalado — não é possível ler configurações do banco. "
            "Execute: pip install psycopg2-binary"
        )
        return None

    conn = None
    try:
        conn = psycopg2.connect(database_url)
        with conn.cursor() as cur:
            cur.execute(
                'SELECT value FROM system_settings WHERE key = %s LIMIT 1',
                (key,),
            )
            row = cur.fetchone()
            return row[0] if row else None
    except Exception as exc:
        logger.warning("Erro ao ler system_settings[%s] do banco: %s", key, exc)
        return None
    finally:
        if conn:
            conn.close()


def get_sheets_creds() -> Optional[str]:
    """
    Lê e descriptografa a credencial Service Account JSON do banco de dados.

    Prioridade: banco de dados → None (fallback para .env fica com o chamador).

    Returns:
        String JSON da Service Account (em texto puro) ou None se não configurada.
    """
    raw = _fetch_setting(_KEY_JSON)
    if not raw:
        return None

    if raw.startswith(_ENC_PREFIX):
        try:
            return _decrypt(raw)
        except Exception as exc:
            logger.error(
                "Falha ao descriptografar sheets.serviceAccountJson do banco: %s. "
                "Verifique se MASTER_ENCRYPTION_KEY está correta.",
                exc,
            )
            return None

    # Valor não criptografado (configuração legada) — retorna diretamente
    return raw or None


def get_master_sheet_id() -> Optional[str]:
    """
    Lê o ID da planilha principal do banco de dados.

    Returns:
        String com o spreadsheetId ou None se não configurado.
    """
    value = _fetch_setting(_KEY_ID)
    return value or None
