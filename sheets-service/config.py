"""
config.py — Configurações centrais via Pydantic Settings + python-dotenv.

Lê variáveis do arquivo .env e valida os tipos em tempo de inicialização.
Qualquer ausência de variável obrigatória levanta um erro claro na startup.
"""

from __future__ import annotations

import os
from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Google Sheets ──────────────────────────────────────────────────────────
    # JSON da Service Account (inline JSON ou base64: prefixado).
    google_sheets_credentials: str = Field(
        default="",
        description="JSON completo da Service Account (1 linha) ou base64:<encoded>",
    )

    # ── Painel Master ──────────────────────────────────────────────────────────
    master_sheet_id: str = Field(
        default="",
        description="ID da planilha do Painel Master",
    )
    master_sheet_gid: int = Field(
        default=0,
        description="GID numérico da aba padrão (0 = primeira aba)",
    )
    master_sheet_tab: str = Field(
        default="",
        description="Nome da aba padrão (ignorado se master_sheet_gid != 0)",
    )

    # ── Banco de Dados ─────────────────────────────────────────────────────────
    database_url: str = Field(
        default="",
        description="PostgreSQL/SQLite connection string (opcional)",
    )

    # ── Servidor ───────────────────────────────────────────────────────────────
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=8000)
    debug: bool = Field(default=False)

    # ── Scheduler ─────────────────────────────────────────────────────────────
    sync_interval_minutes: int = Field(
        default=5,
        ge=1,
        description="Intervalo de sincronização automática em minutos",
    )
    sync_enabled: bool = Field(
        default=True,
        description="Habilita o scheduler de sincronização automática",
    )

    @field_validator("sync_interval_minutes")
    @classmethod
    def validate_interval(cls, v: int) -> int:
        if v < 1:
            raise ValueError("sync_interval_minutes deve ser >= 1")
        return v


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Retorna a instância singleton de Settings.
    O lru_cache garante que o .env é lido apenas uma vez.
    """
    return Settings()
