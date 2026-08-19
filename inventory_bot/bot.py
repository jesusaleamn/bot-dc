from __future__ import annotations

import asyncio
import logging

from aiohttp import web
import discord
from discord.ext import commands

from inventory_bot.config import Settings, load_settings
from inventory_bot.database import create_engine, create_session_factory, initialize_database

logger = logging.getLogger(__name__)


class InventoryBot(commands.Bot):
    def __init__(self, settings: Settings) -> None:
        intents = discord.Intents.default()
        intents.guilds = True

        super().__init__(command_prefix=commands.when_mentioned, intents=intents)
        self.settings = settings
        self.db_engine = create_engine(settings.database_url)
        self.session_factory = create_session_factory(self.db_engine)
        self.health_runner: web.AppRunner | None = None

    async def setup_hook(self) -> None:
        await initialize_database(self.db_engine)
        await self.load_extension("inventory_bot.cogs.inventory")
        await self._start_healthcheck()

        if not self.settings.sync_commands:
            logger.info("Sincronización de slash commands desactivada por SYNC_COMMANDS=false.")
            return

        if self.settings.command_guild_id is not None:
            guild = discord.Object(id=self.settings.command_guild_id)
            self.tree.copy_global_to(guild=guild)
            synced = await self.tree.sync(guild=guild)
            logger.info("Slash commands sincronizados en guild %s: %s", self.settings.command_guild_id, len(synced))
        else:
            synced = await self.tree.sync()
            logger.info("Slash commands globales sincronizados: %s", len(synced))

    async def on_ready(self) -> None:
        if self.user is None:
            logger.info("Bot conectado.")
            return
        logger.info("Bot conectado como %s (%s).", self.user, self.user.id)

    async def close(self) -> None:
        if self.health_runner is not None:
            await self.health_runner.cleanup()
        await super().close()
        await self.db_engine.dispose()

    async def _start_healthcheck(self) -> None:
        if self.settings.healthcheck_port is None:
            return

        async def health(_: web.Request) -> web.Response:
            return web.json_response({"status": "ok", "bot": "inventory"})

        app = web.Application()
        app.router.add_get("/", health)
        app.router.add_get("/health", health)

        self.health_runner = web.AppRunner(app)
        await self.health_runner.setup()
        site = web.TCPSite(
            self.health_runner,
            self.settings.healthcheck_host,
            self.settings.healthcheck_port,
        )
        await site.start()
        logger.info(
            "Healthcheck HTTP activo en %s:%s.",
            self.settings.healthcheck_host,
            self.settings.healthcheck_port,
        )


async def run_bot() -> None:
    settings = load_settings()
    logging.basicConfig(
        level=settings.log_level,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )

    bot = InventoryBot(settings)
    async with bot:
        await bot.start(settings.discord_token)


def main() -> None:
    try:
        asyncio.run(run_bot())
    except KeyboardInterrupt:
        pass
