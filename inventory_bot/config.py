from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv


@dataclass(frozen=True, slots=True)
class Settings:
    discord_token: str
    database_url: str
    command_guild_id: int | None = None
    sync_commands: bool = True
    log_level: str = "INFO"
    healthcheck_host: str = "0.0.0.0"
    healthcheck_port: int | None = None


def _get_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on", "si", "sí"}


def _get_optional_int(name: str) -> int | None:
    raw = os.getenv(name)
    if not raw:
        return None
    return int(raw)


def load_settings() -> Settings:
    load_dotenv()

    token = os.getenv("DISCORD_TOKEN")
    if not token:
        raise RuntimeError("Falta DISCORD_TOKEN en las variables de entorno.")

    return Settings(
        discord_token=token,
        database_url=os.getenv(
            "DATABASE_URL",
            "sqlite+aiosqlite:///data/inventory.sqlite3",
        ),
        command_guild_id=_get_optional_int("COMMAND_GUILD_ID"),
        sync_commands=_get_bool("SYNC_COMMANDS", True),
        log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
        healthcheck_host=os.getenv("HEALTHCHECK_HOST", "0.0.0.0"),
        healthcheck_port=_get_optional_int("HEALTHCHECK_PORT") or _get_optional_int("PORT"),
    )
