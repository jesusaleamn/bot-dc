import { getDiscordPublicKeyStatus, getRawBody, verifyDiscordSignature } from "./security.mjs";
import { InteractionType } from "./constants.mjs";
import { ADMIN_COMMANDS } from "./commands.mjs";
import { hasInventoryAdminPermission } from "./permissions.mjs";
import { httpJson, interactionMessage, pongResponse } from "./responses.mjs";
import { buildHelpEmbed, buildInventoryEmbed } from "./render.mjs";
import { editInventoryMessage, sendInventoryMessage } from "./discord-api.mjs";
import {
  addQuantity,
  createInventory,
  createItem,
  deleteItem,
  editItemName,
  getInventoryVersion,
  getInventoryView,
  listHistory,
  setInventoryMessageId,
  subtractQuantity,
} from "./database.mjs";
import { InventoryError, InventoryMessageMissingError } from "./errors.mjs";

const SUCCESS_MESSAGE = "Listo.";

export async function handleDiscordInteraction(event) {
  if (event.httpMethod !== "POST") {
    return httpJson(405, { error: "method_not_allowed" });
  }

  const publicKeyStatus = getDiscordPublicKeyStatus(process.env.DISCORD_PUBLIC_KEY);
  if (!publicKeyStatus.valid) {
    console.error("DISCORD_PUBLIC_KEY is not configured correctly", publicKeyStatus);
  }

  if (!verifyDiscordSignature(event, process.env.DISCORD_PUBLIC_KEY)) {
    return {
      statusCode: 401,
      body: "invalid request signature",
    };
  }

  let interaction;
  try {
    interaction = JSON.parse(getRawBody(event).toString("utf8"));
  } catch {
    return httpJson(400, { error: "invalid_json" });
  }

  if (interaction.type === InteractionType.PING) {
    return pongResponse();
  }

  if (interaction.type !== InteractionType.APPLICATION_COMMAND) {
    return interactionMessage({
      content: "⚠️ Este endpoint solo acepta slash commands del inventario.",
    });
  }

  try {
    return await handleCommand(interaction);
  } catch (error) {
    if (error instanceof InventoryError) {
      return interactionMessage({ content: error.userMessage });
    }

    console.error("Unexpected interaction error", error);
    return interactionMessage({
      content: "❌ Ha ocurrido un error inesperado. Revisa los logs de Netlify.",
    });
  }
}

async function handleCommand(interaction) {
  const commandName = interaction.data?.name;

  if (ADMIN_COMMANDS.has(commandName) && !hasInventoryAdminPermission(interaction)) {
    return interactionMessage({
      content: "❌ Necesitas permiso de administrador, gestionar servidor o gestionar canales.",
    });
  }

  const context = getContext(interaction);
  const options = parseOptions(interaction.data?.options ?? []);

  switch (commandName) {
    case "inventario":
      return handleCreateInventory(context, options);
    case "crear":
      return handleCreateItem(context, options);
    case "sumar":
      return handleAdd(context, options);
    case "restar":
      return handleSubtract(context, options);
    case "editar":
      return handleEdit(context, options);
    case "borrar":
      return handleDelete(context, options);
    case "ver":
      return handleView(context);
    case "recrear_inventario":
      return handleRecreate(context);
    case "historial":
      return handleHistory(context, options);
    case "ayuda":
      return interactionMessage({ embeds: [buildHelpEmbed()] });
    default:
      return interactionMessage({ content: "⚠️ Comando no reconocido." });
  }
}

async function handleCreateInventory(context, options) {
  await createInventory({
    ...context,
    name: options.nombre,
  });

  const view = await getInventoryView(context);
  const message = await sendInventoryMessage(
    context.channelId,
    buildInventoryEmbed(view.inventory.name, view.items),
  );

  await setInventoryMessageId({
    ...context,
    messageId: message.id,
  });

  return interactionMessage({ content: SUCCESS_MESSAGE });
}

async function handleCreateItem(context, options) {
  await createItem({
    ...context,
    itemId: options.id,
    name: options.nombre,
    quantity: options.cantidad,
  });

  return refreshThenReply(context, SUCCESS_MESSAGE);
}

async function handleAdd(context, options) {
  await addQuantity({
    ...context,
    itemId: options.id,
    amount: options.cantidad ?? 1,
  });

  return refreshThenReply(context, SUCCESS_MESSAGE);
}

async function handleSubtract(context, options) {
  await subtractQuantity({
    ...context,
    itemId: options.id,
    amount: options.cantidad ?? 1,
  });

  return refreshThenReply(context, SUCCESS_MESSAGE);
}

async function handleEdit(context, options) {
  await editItemName({
    ...context,
    itemId: options.id,
    name: options.nombre,
  });

  return refreshThenReply(context, SUCCESS_MESSAGE);
}

async function handleDelete(context, options) {
  await deleteItem({
    ...context,
    itemId: options.id,
  });

  return refreshThenReply(context, SUCCESS_MESSAGE);
}

async function handleView(context) {
  const view = await getInventoryView(context);
  return interactionMessage({
    embeds: [buildInventoryEmbed(view.inventory.name, view.items)],
  });
}

async function handleRecreate(context) {
  const view = await getInventoryView(context);

  if (view.inventory.message_id) {
    try {
      await editInventoryMessage(
        context.channelId,
        view.inventory.message_id,
        buildInventoryEmbed(view.inventory.name, view.items),
      );
      return interactionMessage({
        content: SUCCESS_MESSAGE,
      });
    } catch (error) {
      if (!(error instanceof InventoryMessageMissingError)) {
        throw error;
      }
    }
  }

  const message = await sendInventoryMessage(
    context.channelId,
    buildInventoryEmbed(view.inventory.name, view.items),
  );
  await setInventoryMessageId({
    ...context,
    messageId: message.id,
    recordRecreate: true,
  });

  return interactionMessage({ content: SUCCESS_MESSAGE });
}

async function handleHistory(context, options) {
  const entries = await listHistory({
    ...context,
    limit: options.limite ?? 10,
  });

  return interactionMessage({
    embeds: [
      {
        title: "Historial del inventario",
        color: 0x5865f2,
        description: formatHistory(entries),
      },
    ],
  });
}

async function refreshThenReply(context, successMessage) {
  try {
    await refreshPermanentMessage(context);
    return interactionMessage({ content: successMessage });
  } catch (error) {
    if (error instanceof InventoryMessageMissingError) {
      return interactionMessage({
        content: `${successMessage}\n\n${error.userMessage}`,
      });
    }
    throw error;
  }
}

async function refreshPermanentMessage(context) {
  let lastView = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const view = await getInventoryView(context);
    if (!view.inventory.message_id) {
      throw new InventoryMessageMissingError();
    }

    await editInventoryMessage(
      context.channelId,
      view.inventory.message_id,
      buildInventoryEmbed(view.inventory.name, view.items),
    );

    lastView = view;
    const currentVersion = await getInventoryVersion(context);
    if (currentVersion === Number(view.inventory.version)) {
      return;
    }
  }

  if (lastView?.inventory?.message_id) {
    const latest = await getInventoryView(context);
    await editInventoryMessage(
      context.channelId,
      latest.inventory.message_id,
      buildInventoryEmbed(latest.inventory.name, latest.items),
    );
  }
}

function getContext(interaction) {
  if (!interaction.guild_id || !interaction.channel_id) {
    throw new InventoryError("⚠️ Este bot solo funciona dentro de canales de un servidor.");
  }

  const userId = interaction.member?.user?.id ?? interaction.user?.id;
  if (!userId) {
    throw new InventoryError("⚠️ No he podido identificar al usuario.");
  }

  return {
    guildId: interaction.guild_id,
    channelId: interaction.channel_id,
    userId,
  };
}

function parseOptions(options) {
  return Object.fromEntries(options.map((option) => [option.name, option.value]));
}

function formatHistory(entries) {
  if (!entries.length) {
    return "> No hay cambios registrados.";
  }

  return entries
    .map((entry) => {
      const stamp = new Date(entry.created_at).toISOString().slice(0, 16).replace("T", " ");
      const item = entry.item_id ? `ID ${entry.item_id}${entry.item_name ? ` · ${entry.item_name}` : ""}` : "Inventario";
      const change = formatChange(entry);
      return `\`${stamp} UTC\` <@${entry.user_id}> **${entry.operation}** ${item}${change}`;
    })
    .join("\n");
}

function formatChange(entry) {
  if (entry.before_quantity !== null && entry.after_quantity !== null) {
    return ` (${entry.before_quantity} → ${entry.after_quantity})`;
  }
  if (entry.after_quantity !== null) {
    return ` (→ ${entry.after_quantity})`;
  }
  if (entry.before_quantity !== null) {
    return ` (${entry.before_quantity} → borrado)`;
  }
  return "";
}
