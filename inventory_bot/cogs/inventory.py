from __future__ import annotations

import logging
from datetime import timezone

import discord
from discord import app_commands
from discord.ext import commands
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from inventory_bot.dtos import HistoryEntryDTO, InventoryViewDTO
from inventory_bot.errors import InventoryError, InventoryMessageMissingError
from inventory_bot.locks import InventoryLockManager
from inventory_bot.rendering import build_inventory_embed
from inventory_bot import repository

logger = logging.getLogger(__name__)

ItemId = app_commands.Range[int, 1, 999]
PositiveAmount = app_commands.Range[int, 1, 2_147_483_647]
InitialQuantity = app_commands.Range[int, 0, 2_147_483_647]
HistoryLimit = app_commands.Range[int, 1, 20]


class InventoryCog(commands.Cog):
    def __init__(self, bot: commands.Bot, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self.bot = bot
        self.session_factory = session_factory
        self.locks = InventoryLockManager()

    async def _send_ephemeral(
        self,
        interaction: discord.Interaction,
        content: str | None = None,
        *,
        embed: discord.Embed | None = None,
    ) -> None:
        if interaction.response.is_done():
            await interaction.followup.send(content=content, embed=embed, ephemeral=True)
        else:
            await interaction.response.send_message(content=content, embed=embed, ephemeral=True)

    async def _defer(self, interaction: discord.Interaction) -> None:
        if not interaction.response.is_done():
            await interaction.response.defer(ephemeral=True, thinking=True)

    def _require_guild_context(self, interaction: discord.Interaction) -> tuple[int, int]:
        if interaction.guild_id is None or interaction.channel_id is None:
            raise InventoryError("⚠️ Este bot solo funciona dentro de canales de un servidor.")
        return interaction.guild_id, interaction.channel_id

    async def _require_admin(self, interaction: discord.Interaction) -> bool:
        if not isinstance(interaction.user, discord.Member):
            await self._send_ephemeral(interaction, "❌ Este comando solo se puede usar dentro de un servidor.")
            return False

        permissions = interaction.user.guild_permissions
        if permissions.administrator or permissions.manage_guild or permissions.manage_channels:
            return True

        await self._send_ephemeral(
            interaction,
            "❌ Necesitas permiso de administrador, gestionar servidor o gestionar canales.",
        )
        return False

    async def _publish_inventory_message(self, interaction: discord.Interaction, view: InventoryViewDTO) -> discord.Message:
        channel = interaction.channel
        send = getattr(channel, "send", None)
        if send is None:
            raise InventoryError("❌ No puedo publicar mensajes en este tipo de canal.")
        return await send(embed=build_inventory_embed(view.inventory.name, view.items))

    async def _edit_inventory_message(self, interaction: discord.Interaction, view: InventoryViewDTO) -> None:
        if view.inventory.message_id is None:
            raise InventoryMessageMissingError()

        channel = interaction.channel
        fetch_message = getattr(channel, "fetch_message", None)
        if fetch_message is None:
            raise InventoryError("❌ No puedo recuperar mensajes en este tipo de canal.")

        try:
            message = await fetch_message(int(view.inventory.message_id))
            await message.edit(embed=build_inventory_embed(view.inventory.name, view.items))
        except discord.NotFound as exc:
            raise InventoryMessageMissingError() from exc
        except discord.Forbidden as exc:
            raise InventoryError("❌ No tengo permisos para leer historial o editar el mensaje permanente.") from exc
        except discord.HTTPException as exc:
            logger.exception("Error de Discord al editar el mensaje del inventario")
            raise InventoryError("❌ Discord rechazó la actualización del mensaje. Inténtalo de nuevo.") from exc

    async def _refresh_inventory_message(self, interaction: discord.Interaction) -> None:
        guild_id, channel_id = self._require_guild_context(interaction)
        view = await repository.get_inventory_view(
            self.session_factory,
            guild_id=guild_id,
            channel_id=channel_id,
        )
        await self._edit_inventory_message(interaction, view)

    async def _run_and_refresh(
        self,
        interaction: discord.Interaction,
        success_message: str,
    ) -> None:
        try:
            await self._refresh_inventory_message(interaction)
            await self._send_ephemeral(interaction, success_message)
        except InventoryMessageMissingError as exc:
            await self._send_ephemeral(interaction, f"{success_message}\n\n{exc.user_message}")

    @app_commands.command(name="inventario", description="Crea el inventario permanente de este canal.")
    @app_commands.describe(nombre="Nombre visible del inventario, por ejemplo Alquimia.")
    @app_commands.guild_only()
    async def inventario(self, interaction: discord.Interaction, nombre: str) -> None:
        if not await self._require_admin(interaction):
            return

        await self._defer(interaction)
        guild_id, channel_id = self._require_guild_context(interaction)
        lock = self.locks.for_inventory(guild_id, channel_id)

        async with lock:
            try:
                await repository.create_inventory(
                    self.session_factory,
                    guild_id=guild_id,
                    channel_id=channel_id,
                    name=nombre,
                    user_id=interaction.user.id,
                )
                view = await repository.get_inventory_view(
                    self.session_factory,
                    guild_id=guild_id,
                    channel_id=channel_id,
                )
                message = await self._publish_inventory_message(interaction, view)
                await repository.set_inventory_message_id(
                    self.session_factory,
                    guild_id=guild_id,
                    channel_id=channel_id,
                    message_id=message.id,
                )
                await self._send_ephemeral(interaction, "✅ Inventario creado en este canal.")
            except InventoryError as exc:
                await self._send_ephemeral(interaction, exc.user_message)
            except ValueError as exc:
                await self._send_ephemeral(interaction, f"❌ {exc}")

    @app_commands.command(name="crear", description="Registra un objeto en el inventario de este canal.")
    @app_commands.describe(id="ID del objeto, del 1 al 999.", nombre="Nombre del material.", cantidad="Cantidad inicial.")
    @app_commands.guild_only()
    async def crear(self, interaction: discord.Interaction, id: ItemId, nombre: str, cantidad: InitialQuantity) -> None:
        if not await self._require_admin(interaction):
            return

        await self._defer(interaction)
        guild_id, channel_id = self._require_guild_context(interaction)
        lock = self.locks.for_inventory(guild_id, channel_id)

        async with lock:
            try:
                item = await repository.create_item(
                    self.session_factory,
                    guild_id=guild_id,
                    channel_id=channel_id,
                    item_id=id,
                    name=nombre,
                    quantity=cantidad,
                    user_id=interaction.user.id,
                )
                await self._run_and_refresh(
                    interaction,
                    f"✅ ID {item.item_id} creado: {item.name} → {item.quantity}",
                )
            except InventoryError as exc:
                await self._send_ephemeral(interaction, exc.user_message)
            except ValueError as exc:
                await self._send_ephemeral(interaction, f"❌ {exc}")

    @app_commands.command(name="sumar", description="Suma cantidad a un objeto del inventario de este canal.")
    @app_commands.describe(id="ID del objeto, del 1 al 999.", cantidad="Cantidad positiva que se va a sumar.")
    @app_commands.guild_only()
    async def sumar(self, interaction: discord.Interaction, id: ItemId, cantidad: PositiveAmount) -> None:
        await self._defer(interaction)
        guild_id, channel_id = self._require_guild_context(interaction)
        lock = self.locks.for_inventory(guild_id, channel_id)

        async with lock:
            try:
                change = await repository.add_quantity(
                    self.session_factory,
                    guild_id=guild_id,
                    channel_id=channel_id,
                    item_id=id,
                    amount=cantidad,
                    user_id=interaction.user.id,
                )
                await self._run_and_refresh(
                    interaction,
                    f"✅ ID {change.item_id} actualizado: {change.name} → {change.after_quantity}",
                )
            except InventoryError as exc:
                await self._send_ephemeral(interaction, exc.user_message)

    @app_commands.command(name="restar", description="Resta cantidad a un objeto sin permitir valores negativos.")
    @app_commands.describe(id="ID del objeto, del 1 al 999.", cantidad="Cantidad positiva que se va a restar.")
    @app_commands.guild_only()
    async def restar(self, interaction: discord.Interaction, id: ItemId, cantidad: PositiveAmount) -> None:
        await self._defer(interaction)
        guild_id, channel_id = self._require_guild_context(interaction)
        lock = self.locks.for_inventory(guild_id, channel_id)

        async with lock:
            try:
                change = await repository.subtract_quantity(
                    self.session_factory,
                    guild_id=guild_id,
                    channel_id=channel_id,
                    item_id=id,
                    amount=cantidad,
                    user_id=interaction.user.id,
                )
                await self._run_and_refresh(
                    interaction,
                    f"✅ ID {change.item_id} actualizado: {change.name} → {change.after_quantity}",
                )
            except InventoryError as exc:
                await self._send_ephemeral(interaction, exc.user_message)

    @app_commands.command(name="editar", description="Cambia el nombre de un objeto sin modificar su cantidad.")
    @app_commands.describe(id="ID del objeto, del 1 al 999.", nombre="Nuevo nombre del material.")
    @app_commands.guild_only()
    async def editar(self, interaction: discord.Interaction, id: ItemId, nombre: str) -> None:
        if not await self._require_admin(interaction):
            return

        await self._defer(interaction)
        guild_id, channel_id = self._require_guild_context(interaction)
        lock = self.locks.for_inventory(guild_id, channel_id)

        async with lock:
            try:
                item = await repository.edit_item_name(
                    self.session_factory,
                    guild_id=guild_id,
                    channel_id=channel_id,
                    item_id=id,
                    name=nombre,
                    user_id=interaction.user.id,
                )
                await self._run_and_refresh(
                    interaction,
                    f"✅ ID {item.item_id} renombrado: {item.name} → {item.quantity}",
                )
            except InventoryError as exc:
                await self._send_ephemeral(interaction, exc.user_message)
            except ValueError as exc:
                await self._send_ephemeral(interaction, f"❌ {exc}")

    @app_commands.command(name="borrar", description="Elimina un objeto del inventario de este canal.")
    @app_commands.describe(id="ID del objeto que se va a borrar, del 1 al 999.")
    @app_commands.guild_only()
    async def borrar(self, interaction: discord.Interaction, id: ItemId) -> None:
        if not await self._require_admin(interaction):
            return

        await self._defer(interaction)
        guild_id, channel_id = self._require_guild_context(interaction)
        lock = self.locks.for_inventory(guild_id, channel_id)

        async with lock:
            try:
                item = await repository.delete_item(
                    self.session_factory,
                    guild_id=guild_id,
                    channel_id=channel_id,
                    item_id=id,
                    user_id=interaction.user.id,
                )
                await self._run_and_refresh(interaction, f"✅ ID {item.item_id} borrado: {item.name}")
            except InventoryError as exc:
                await self._send_ephemeral(interaction, exc.user_message)

    @app_commands.command(name="ver", description="Muestra el inventario de este canal solo para ti.")
    @app_commands.guild_only()
    async def ver(self, interaction: discord.Interaction) -> None:
        try:
            guild_id, channel_id = self._require_guild_context(interaction)
            view = await repository.get_inventory_view(
                self.session_factory,
                guild_id=guild_id,
                channel_id=channel_id,
            )
            await self._send_ephemeral(
                interaction,
                embed=build_inventory_embed(view.inventory.name, view.items),
            )
        except InventoryError as exc:
            await self._send_ephemeral(interaction, exc.user_message)

    @app_commands.command(name="recrear_inventario", description="Recrea el mensaje permanente si fue eliminado.")
    @app_commands.guild_only()
    async def recrear_inventario(self, interaction: discord.Interaction) -> None:
        if not await self._require_admin(interaction):
            return

        await self._defer(interaction)
        guild_id, channel_id = self._require_guild_context(interaction)
        lock = self.locks.for_inventory(guild_id, channel_id)

        async with lock:
            try:
                view = await repository.get_inventory_view(
                    self.session_factory,
                    guild_id=guild_id,
                    channel_id=channel_id,
                )

                if view.inventory.message_id is not None:
                    try:
                        await self._edit_inventory_message(interaction, view)
                        await self._send_ephemeral(
                            interaction,
                            "✅ El mensaje permanente seguía existiendo y ha sido actualizado.",
                        )
                        return
                    except InventoryMessageMissingError:
                        pass

                message = await self._publish_inventory_message(interaction, view)
                await repository.set_inventory_message_id(
                    self.session_factory,
                    guild_id=guild_id,
                    channel_id=channel_id,
                    message_id=message.id,
                    user_id=interaction.user.id,
                    record_recreate=True,
                )
                await self._send_ephemeral(interaction, "✅ Mensaje permanente recreado.")
            except InventoryError as exc:
                await self._send_ephemeral(interaction, exc.user_message)

    @app_commands.command(name="historial", description="Muestra los últimos cambios del inventario de este canal.")
    @app_commands.describe(limite="Número de entradas, entre 1 y 20.")
    @app_commands.guild_only()
    async def historial(self, interaction: discord.Interaction, limite: HistoryLimit = 10) -> None:
        if not await self._require_admin(interaction):
            return

        try:
            guild_id, channel_id = self._require_guild_context(interaction)
            entries = await repository.list_history(
                self.session_factory,
                guild_id=guild_id,
                channel_id=channel_id,
                limit=limite,
            )
            embed = discord.Embed(
                title="Historial del inventario",
                description=self._format_history(entries),
                color=0x5865F2,
            )
            await self._send_ephemeral(interaction, embed=embed)
        except InventoryError as exc:
            await self._send_ephemeral(interaction, exc.user_message)

    @app_commands.command(name="ayuda", description="Muestra los comandos de inventario disponibles.")
    @app_commands.guild_only()
    async def ayuda(self, interaction: discord.Interaction) -> None:
        embed = discord.Embed(
            title="Comandos del inventario",
            description=(
                "`/inventario nombre:Alquimia` crea el inventario del canal.\n"
                "`/crear id:1 nombre:Flor de montaña cantidad:50` registra un objeto.\n"
                "`/sumar id:1 cantidad:20` suma cantidad.\n"
                "`/restar id:1 cantidad:5` resta sin permitir negativos.\n"
                "`/editar id:1 nombre:Nuevo nombre` renombra un objeto.\n"
                "`/borrar id:1` elimina un objeto.\n"
                "`/ver` muestra el inventario solo para ti.\n"
                "`/recrear_inventario` vuelve a publicar el mensaje fijo.\n"
                "`/historial limite:10` muestra cambios recientes a responsables."
            ),
            color=0x2F855A,
        )
        await self._send_ephemeral(interaction, embed=embed)

    def _format_history(self, entries: list[HistoryEntryDTO]) -> str:
        if not entries:
            return "> No hay cambios registrados."

        lines: list[str] = []
        for entry in entries:
            created_at = entry.created_at
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=timezone.utc)
            stamp = created_at.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
            item = f"ID {entry.item_id}" if entry.item_id is not None else "Inventario"
            if entry.item_name:
                item = f"{item} · {entry.item_name}"
            change = self._format_change(entry)
            lines.append(f"`{stamp}` <@{entry.user_id}> **{entry.operation}** {item}{change}")

        return "\n".join(lines)

    def _format_change(self, entry: HistoryEntryDTO) -> str:
        if entry.before_quantity is not None and entry.after_quantity is not None:
            return f" ({entry.before_quantity} → {entry.after_quantity})"
        if entry.after_quantity is not None:
            return f" (→ {entry.after_quantity})"
        if entry.before_quantity is not None:
            return f" ({entry.before_quantity} → borrado)"
        return ""


async def setup(bot: commands.Bot) -> None:
    session_factory = getattr(bot, "session_factory")
    await bot.add_cog(InventoryCog(bot, session_factory))
