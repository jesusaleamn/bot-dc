import { getDiscordPublicKeyStatus, getRawBody, verifyDiscordSignature } from "./security.mjs";
import { InteractionType } from "./constants.mjs";
import { ADMIN_COMMANDS } from "./commands.mjs";
import { hasInventoryAdminPermission } from "./permissions.mjs";
import { httpJson, interactionMessage, pongResponse } from "./responses.mjs";
import {
  buildActivityEmbed,
  buildCompletedOrdersEmbed,
  buildHelpEmbed,
  buildInventoryEmbed,
  buildOrdersEmbed,
} from "./render.mjs";
import { editInventoryMessage, sendInventoryMessage } from "./discord-api.mjs";
import { scheduleEphemeralResponseDeletion } from "./ephemeral-cleanup.mjs";
import {
  addQuantity,
  completeOrder,
  createInventory,
  createItem,
  createOrder,
  deleteItem,
  deliverOrder,
  editItemName,
  getOrderBoardsForInventory,
  getOrdersView,
  getInventoryVersion,
  getInventoryView,
  linkOrdersBoard,
  listActivitySummary,
  listCompletedOrders,
  listHistory,
  setOrdersMessageId,
  setInventoryMessageId,
  subtractQuantity,
} from "./database.mjs";
import {
  BotPermissionError,
  InventoryError,
  InventoryMessageMissingError,
  OrdersMessageMissingError,
} from "./errors.mjs";

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
      content: "❌ Solo `/borrar` requiere permiso de administrador, gestionar servidor o gestionar canales.",
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
    case "pedidos":
      return handleOrdersBoard(context);
    case "pedidos_vincular":
      return handleLinkOrdersBoard(context, options);
    case "pedido_crear":
      return handleCreateOrder(context, options);
    case "pedido_llevar":
      return handleDeliverOrder(context, options);
    case "pedido_completar":
      return handleCompleteOrder(context, options);
    case "pedidos_completados":
      return handleCompletedOrders(context, options);
    case "actividad":
      return handleActivity(context, options);
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

  try {
    const view = await getInventoryView(context);
    const message = await sendInventoryMessage(
      context.channelId,
      buildInventoryEmbed(view.inventory.name, view.items),
    );

    await setInventoryMessageId({
      ...context,
      messageId: message.id,
    });
  } catch (error) {
    if (error instanceof BotPermissionError) {
      return interactionMessage({
        content: `${SUCCESS_MESSAGE}\n\n${error.userMessage}\n\nEl inventario se ha guardado, pero no puedo publicar el mensaje permanente hasta que el bot tenga permisos en este canal.`,
      });
    }
    throw error;
  }

  return temporarySuccessMessage(context);
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
      return temporarySuccessMessage(context);
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

  return temporarySuccessMessage(context);
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

async function handleOrdersBoard(context) {
  await publishOrdersBoard(context);
  return temporarySuccessMessage(context);
}

async function handleLinkOrdersBoard(context, options) {
  try {
    const view = await linkOrdersBoard({
      ...context,
      boardChannelId: context.channelId,
      inventoryChannelId: options.canal,
    });

    await publishOrdersBoard(context, view);
  } catch (error) {
    if (error instanceof BotPermissionError) {
      return interactionMessage({
        content: `${SUCCESS_MESSAGE}\n\n${error.userMessage}\n\nLa vinculacion se ha guardado, pero no puedo publicar la tabla de pedidos hasta que el bot tenga permisos en este canal.`,
      });
    }
    throw error;
  }

  return temporarySuccessMessage(context);
}

async function handleCreateOrder(context, options) {
  await createOrder({
    ...context,
    itemId: options.id,
    quantity: options.cantidad,
    requesterUserId: options.usuario ?? context.userId,
  });

  return refreshOrdersThenReply(context);
}

async function handleDeliverOrder(context, options) {
  await deliverOrder({
    ...context,
    orderNo: options.pedido,
    amount: options.cantidad,
  });

  return refreshOrdersThenReply(context);
}

async function handleCompleteOrder(context, options) {
  await completeOrder({
    ...context,
    orderNo: options.pedido,
  });

  return refreshOrdersThenReply(context);
}

async function handleCompletedOrders(context, options) {
  const orders = await listCompletedOrders({
    ...context,
    limit: options.limite ?? 10,
  });

  return interactionMessage({
    embeds: [buildCompletedOrdersEmbed(orders)],
  });
}

async function handleActivity(context, options) {
  const entries = await listActivitySummary({
    ...context,
    userId: options.usuario ?? null,
    itemId: options.id ?? null,
    limit: options.limite ?? 12,
  });

  return interactionMessage({
    embeds: [buildActivityEmbed(entries)],
  });
}

async function refreshThenReply(context, successMessage) {
  try {
    await refreshPermanentMessage(context);
    if (successMessage === SUCCESS_MESSAGE) {
      return temporarySuccessMessage(context);
    }
    return interactionMessage({ content: successMessage });
  } catch (error) {
    if (error instanceof InventoryMessageMissingError) {
      return interactionMessage({
        content: `${successMessage}\n\n${error.userMessage}`,
      });
    }
    if (error instanceof BotPermissionError) {
      return interactionMessage({
        content: `${successMessage}\n\n${error.userMessage}\n\nEl cambio se ha guardado, pero no puedo actualizar el mensaje permanente hasta que el bot tenga permisos en este canal.`,
      });
    }
    throw error;
  }
}

async function refreshOrdersThenReply(context) {
  try {
    await refreshOrdersBoards(context);
    return temporarySuccessMessage(context);
  } catch (error) {
    if (error instanceof OrdersMessageMissingError) {
      return interactionMessage({
        content: `${SUCCESS_MESSAGE}\n\n${error.userMessage}`,
      });
    }
    if (error instanceof BotPermissionError) {
      return interactionMessage({
        content: `${SUCCESS_MESSAGE}\n\n${error.userMessage}\n\nEl pedido se ha guardado, pero no puedo actualizar la tabla de pedidos hasta que el bot tenga permisos en este canal.`,
      });
    }
    throw error;
  }
}

async function publishOrdersBoard(context, currentView = null) {
  const view = currentView ?? (await getOrdersView(context));
  const messageId = view.board?.messageId ?? view.inventory.orders_message_id;

  if (messageId) {
    try {
      await editInventoryMessage(
        context.channelId,
        messageId,
        buildOrdersEmbed(view),
      );
      await setOrdersMessageId({
        ...context,
        inventoryId: view.inventory.id,
        messageId,
      });
      return;
    } catch (error) {
      if (!(error instanceof InventoryMessageMissingError)) {
        throw error;
      }
    }
  }

  const message = await sendInventoryMessage(context.channelId, buildOrdersEmbed(view));
  await setOrdersMessageId({
    ...context,
    inventoryId: view.inventory.id,
    messageId: message.id,
  });
}

async function refreshOrdersBoards(context) {
  const view = await getOrdersView(context);
  const boards = await getOrderBoardsForInventory({ inventoryId: view.inventory.id });
  if (!boards.length) {
    throw new OrdersMessageMissingError();
  }

  let updated = 0;
  let firstMissingError = null;
  let firstPermissionError = null;

  for (const board of boards) {
    try {
      await editInventoryMessage(board.channelId, board.messageId, buildOrdersEmbed(view));
      updated += 1;
    } catch (error) {
      if (error instanceof InventoryMessageMissingError) {
        firstMissingError ??= error;
        continue;
      }
      if (error instanceof BotPermissionError) {
        firstPermissionError ??= error;
        continue;
      }
      throw error;
    }
  }

  if (updated > 0) {
    return;
  }

  if (firstPermissionError) {
    throw firstPermissionError;
  }
  throw firstMissingError ?? new OrdersMessageMissingError();
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
    applicationId: interaction.application_id,
    interactionToken: interaction.token,
  };
}

async function temporarySuccessMessage(context) {
  await scheduleEphemeralResponseDeletion({
    applicationId: context.applicationId,
    interactionToken: context.interactionToken,
  });

  return interactionMessage({ content: SUCCESS_MESSAGE });
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
