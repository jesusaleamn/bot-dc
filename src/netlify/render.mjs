import { ITEM_ID_WIDTH } from "./constants.mjs";

const MATERIAL_WIDTH = 24;
const QUANTITY_WIDTH = 8;
const PRIORITY_WIDTH = 1;
const INVENTORY_EMBED_DESCRIPTION_LIMIT = 3600;
const GENERAL_EMBED_DESCRIPTION_LIMIT = 3600;
const GENERAL_PAGE_EMBED_LIMIT = 10;
const GENERAL_PAGE_TEXT_LIMIT = 5200;
const MESSAGE_CONTENT_LIMIT = 1800;

const PRIORITY_META = {
  high: { mark: "A", icon: "🔴", label: "Alta" },
  medium: { mark: "M", icon: "🟠", label: "Media" },
  low: { mark: "B", icon: "🟢", label: "Baja" },
  none: { mark: "-", icon: "⚪", label: "Ninguna" },
};

function shorten(value, width) {
  const clean = value.trim();
  if (clean.length <= width) return clean;
  return `${clean.slice(0, width - 3)}...`;
}

function formatSigned(value) {
  return value > 0 ? `+${value}` : String(value);
}

function inventoryName(inventory) {
  return typeof inventory === "string" ? inventory : inventory.name;
}

function inventoryTableId(inventory) {
  return typeof inventory === "string" ? null : inventory.table_id;
}

function formatPriorityMark(priority) {
  return PRIORITY_META[priority]?.mark ?? PRIORITY_META.none.mark;
}

function priorityLegend() {
  return "Prioridad: A 🔴 alta · M 🟠 media · B 🟢 baja · - ⚪ ninguna";
}

function inventoryHeaderLines() {
  return [
    `${"ID".padStart(ITEM_ID_WIDTH)} │ ${"P".padEnd(PRIORITY_WIDTH)} │ ${"MATERIAL".padEnd(MATERIAL_WIDTH)} │ ${"CANTIDAD".padStart(QUANTITY_WIDTH)}`,
    `${"─".repeat(ITEM_ID_WIDTH)}─┼─${"─".repeat(PRIORITY_WIDTH)}─┼─${"─".repeat(MATERIAL_WIDTH)}─┼─${"─".repeat(QUANTITY_WIDTH)}`,
  ];
}

function inventoryItemLine(item) {
  const material = shorten(item.name, MATERIAL_WIDTH);
  return `${String(item.item_id).padStart(ITEM_ID_WIDTH)} │ ${formatPriorityMark(item.priority).padEnd(PRIORITY_WIDTH)} │ ${material.padEnd(MATERIAL_WIDTH)} │ ${String(item.quantity).padStart(QUANTITY_WIDTH)}`;
}

function formatInventoryTableDescription(lines) {
  return `\`\`\`text\n${lines.join("\n")}\n\`\`\``;
}

export function renderInventory(inventory, items) {
  return buildInventoryPages(inventory, items)[0];
}

export function buildInventoryPages(inventory, items) {
  const name = inventoryName(inventory);
  const tableId = inventoryTableId(inventory);

  if (!items.length) {
    return [{
      title: inventoryTitle(name, tableId),
      description: "> No hay objetos registrados.",
      color: 0x2f855a,
      footer: {
        text: `Inventario compartido de este canal · ${priorityLegend()}`,
      },
    }];
  }

  const chunks = splitInventoryItems(items, INVENTORY_EMBED_DESCRIPTION_LIMIT);

  return chunks.map((chunk, index) => ({
    title: inventoryTitle(name, tableId, chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : ""),
    description: formatInventoryTableDescription([...inventoryHeaderLines(), ...chunk.map(inventoryItemLine)]),
    color: 0x2f855a,
    footer: {
      text: `Inventario compartido de este canal · ${priorityLegend()}`,
    },
  }));
}

export function buildInventoryMessagePages(inventory, items) {
  const name = inventoryName(inventory);
  const tableId = inventoryTableId(inventory);
  const footerText = `Inventario compartido de este canal · ${priorityLegend()}`;

  if (!items.length) {
    return [
      messagePayload(inventoryTextContent(inventoryTitle(name, tableId), [], footerText)),
    ];
  }

  const chunks = splitInventoryItemsForMessage(items, inventoryTitle(name, tableId), footerText);
  return chunks.map((chunk, index) => {
    const suffix = chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : "";
    return messagePayload(inventoryTextContent(inventoryTitle(name, tableId, suffix), chunk, footerText));
  });
}

export function buildInventoryEmbed(inventory, items) {
  return buildInventoryPages(inventory, items)[0];
}

export function buildGeneralInventoryEmbeds({ inventories }) {
  if (!inventories.length) {
    return [
      {
        title: "📚 TABLA GENERAL",
        description: "> No hay inventarios creados en este servidor.",
        color: 0x5865f2,
      },
    ];
  }

  return inventories.flatMap((inventory) => buildGeneralInventoryEmbedsForInventory(inventory));
}

export function buildGeneralInventoryPages(view) {
  const embeds = buildGeneralInventoryEmbeds(view);
  const pages = [];
  let currentPage = [];
  let currentLength = 0;

  for (const embed of embeds) {
    const embedLength = embedTextLength(embed);
    if (
      currentPage.length > 0
      && (currentPage.length >= GENERAL_PAGE_EMBED_LIMIT || currentLength + embedLength > GENERAL_PAGE_TEXT_LIMIT)
    ) {
      pages.push(currentPage);
      currentPage = [];
      currentLength = 0;
    }

    currentPage.push(embed);
    currentLength += embedLength;
  }

  if (currentPage.length) {
    pages.push(currentPage);
  }

  return pages;
}

export function buildGeneralInventoryMessagePages(view) {
  const sections = buildGeneralInventoryTextSections(view);
  const pages = [];
  let currentPage = "";

  for (const section of sections) {
    const nextPage = currentPage ? `${currentPage}\n\n${section}` : section;
    if (currentPage && nextPage.length > MESSAGE_CONTENT_LIMIT) {
      pages.push(messagePayload(currentPage));
      currentPage = section;
    } else {
      currentPage = nextPage;
    }
  }

  if (currentPage) {
    pages.push(messagePayload(currentPage));
  }

  return pages;
}

function buildGeneralInventoryEmbedsForInventory(inventory) {
  const items = [...inventory.items].sort((a, b) => a.item_id - b.item_id);
  if (!items.length) {
    return [buildGeneralInventoryEmbed(inventory, "> No hay objetos registrados.")];
  }

  const chunks = [];
  chunks.push(...splitInventoryItems(items, GENERAL_EMBED_DESCRIPTION_LIMIT));

  return chunks.map((chunk, index) => {
    const suffix = chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : "";
    return buildGeneralInventoryEmbed(
      inventory,
      formatInventoryTableDescription([...inventoryHeaderLines(), ...chunk.map(inventoryItemLine)]),
      suffix,
    );
  });
}

function buildGeneralInventoryEmbed(inventory, description, titleSuffix = "") {
  return {
    title: `📚 TABLA ${inventory.table_id} — ${inventory.name.trim().toUpperCase()}${titleSuffix}`,
    description,
    color: 0x2f855a,
    footer: {
      text: `Canal <#${inventory.channel_id}> · ${priorityLegend()}`,
    },
  };
}

function buildGeneralInventoryTextSections({ inventories }) {
  if (!inventories.length) {
    return [
      "**📚 TABLA GENERAL**\n> No hay inventarios creados en este servidor.",
    ];
  }

  return inventories.flatMap((inventory) => buildGeneralInventoryTextSectionsForInventory(inventory));
}

function buildGeneralInventoryTextSectionsForInventory(inventory) {
  const items = [...inventory.items].sort((a, b) => a.item_id - b.item_id);
  const baseTitle = `📚 TABLA ${inventory.table_id} — ${inventory.name.trim().toUpperCase()}`;
  const footerText = `Canal <#${inventory.channel_id}> · ${priorityLegend()}`;

  if (!items.length) {
    return [inventoryTextContent(baseTitle, [], footerText)];
  }

  const chunks = splitInventoryItemsForMessage(items, baseTitle, footerText);
  return chunks.map((chunk, index) => {
    const suffix = chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : "";
    return inventoryTextContent(`${baseTitle}${suffix}`, chunk, footerText);
  });
}

function inventoryTextContent(title, items, footerText) {
  const description = items.length
    ? formatInventoryTableDescription([...inventoryHeaderLines(), ...items.map(inventoryItemLine)])
    : "> No hay objetos registrados.";

  return `**${title}**\n${description}\n${footerText}`;
}

function messagePayload(content) {
  return {
    content,
    embeds: [],
  };
}

function embedTextLength(embed) {
  const fieldsLength = (embed.fields ?? []).reduce(
    (total, field) => total + String(field.name ?? "").length + String(field.value ?? "").length,
    0,
  );
  return (
    String(embed.title ?? "").length
    + String(embed.description ?? "").length
    + String(embed.footer?.text ?? "").length
    + fieldsLength
  );
}

function splitInventoryItems(items, descriptionLimit) {
  const sortedItems = [...items].sort((a, b) => a.item_id - b.item_id);
  const chunks = [];
  let currentItems = [];

  for (const item of sortedItems) {
    const nextItems = [...currentItems, item];
    const nextDescription = formatInventoryTableDescription([
      ...inventoryHeaderLines(),
      ...nextItems.map(inventoryItemLine),
    ]);

    if (currentItems.length > 0 && nextDescription.length > descriptionLimit) {
      chunks.push(currentItems);
      currentItems = [item];
    } else {
      currentItems = nextItems;
    }
  }

  if (currentItems.length) {
    chunks.push(currentItems);
  }

  return chunks;
}

function splitInventoryItemsForMessage(items, baseTitle, footerText) {
  const sortedItems = [...items].sort((a, b) => a.item_id - b.item_id);
  const chunks = [];
  let currentItems = [];

  for (const item of sortedItems) {
    const nextItems = [...currentItems, item];
    const nextContent = inventoryTextContent(`${baseTitle} (999/999)`, nextItems, footerText);

    if (currentItems.length > 0 && nextContent.length > MESSAGE_CONTENT_LIMIT) {
      chunks.push(currentItems);
      currentItems = [item];
    } else {
      currentItems = nextItems;
    }
  }

  if (currentItems.length) {
    chunks.push(currentItems);
  }

  return chunks;
}

function inventoryTitle(name, tableId, suffix = "") {
  return tableId
    ? `🧪 INVENTARIO ${tableId} — ${name.trim().toUpperCase()}${suffix}`
    : `🧪 INVENTARIO — ${name.trim().toUpperCase()}${suffix}`;
}

export function buildOrdersEmbed({ inventory, orders, completedThisWeek, completedTotal }) {
  const description = [];

  if (!orders.length) {
    description.push("> No hay pedidos activos.");
  } else {
    for (const order of orders.slice(0, 12)) {
      const missing = Math.max(order.requested_quantity - order.delivered_quantity, 0);
      description.push(
        [
          `#${order.order_no}  <@${order.requester_user_id}>`,
          `   ${String(order.item_id).padStart(ITEM_ID_WIDTH)}   ${shorten(order.item_name, 34)}`,
          `   Pedido: ${order.requested_quantity}   Llevado: ${order.delivered_quantity}   Falta: ${missing}`,
        ].join("\n"),
      );
    }

    if (orders.length > 12) {
      description.push(`... y ${orders.length - 12} pedidos activos mas.`);
    }
  }

  description.push("");
  description.push(`Completados esta semana: ${completedThisWeek}`);
  description.push(`Completados totales: ${completedTotal}`);

  return {
    title: `📦 PEDIDOS — ${inventory.name.trim().toUpperCase()}`,
    description: description.join("\n\n"),
    color: 0x2f855a,
    footer: {
      text: "Pedidos vinculados al inventario",
    },
  };
}

export function buildCompletedOrdersEmbed(orders) {
  if (!orders.length) {
    return {
      title: "Pedidos completados",
      description: "> No hay pedidos completados registrados.",
      color: 0x2f855a,
    };
  }

  return {
    title: "Pedidos completados",
    description: orders
      .map((order) => {
        const completedAt = order.completed_at
          ? new Date(order.completed_at).toISOString().slice(0, 16).replace("T", " ")
          : "sin fecha";
        return `#${order.order_no}  <@${order.requester_user_id}>  ${order.item_id} ${shorten(order.item_name, 26)}  ${order.delivered_quantity}/${order.requested_quantity}  \`${completedAt} UTC\``;
      })
      .join("\n"),
    color: 0x2f855a,
  };
}

export function buildActivityEmbed(entries) {
  if (!entries.length) {
    return {
      title: "Actividad de inventario",
      description: "> No hay sumas ni restas registradas.",
      color: 0x5865f2,
    };
  }

  const lines = entries.map((entry) => {
    const material = shorten(entry.item_name, 30);
    const net = entry.total_added - entry.total_removed;
    return [
      `<@${entry.user_id}> · \`${String(entry.item_id).padStart(ITEM_ID_WIDTH)}\` ${material}`,
      `Sumado: \`${entry.total_added}\`   Restado: \`${entry.total_removed}\`   Neto: \`${formatSigned(net)}\``,
      `Movimientos: ${entry.add_count} sumas, ${entry.subtract_count} restas`,
    ].join("\n");
  });

  return {
    title: "Actividad de inventario",
    description: lines.join("\n\n"),
    color: 0x5865f2,
  };
}

export function buildHelpEmbed() {
  return {
    title: "Comandos del inventario",
    color: 0x2f855a,
    description: [
      "`/inventario nombre:Alquimia` crea el inventario del canal.",
      "`/crear id:1 nombre:Flor de montaña cantidad:50` registra un objeto.",
      "`/sumar id:2 cantidad:101` suma cantidad. Si omites cantidad, suma 1.",
      "`/restar id:2 cantidad:101` resta cantidad. Si omites cantidad, resta 1.",
      "`/editar id:1 nombre:Nuevo nombre` renombra un objeto.",
      "`/borrar id:1` elimina un objeto. Requiere permisos.",
      "`/ver` muestra el inventario solo para ti.",
      "`/recrear_inventario` vuelve a publicar el mensaje fijo.",
      "`/historial limite:10` muestra cambios recientes.",
      "`/prioridad id:1 nivel:alta` marca la prioridad de un objeto.",
      "`/general` publica o actualiza la tabla general del servidor.",
      "`/general_sumar tabla:101 id:1 cantidad:10` suma desde la tabla general.",
      "`/general_restar tabla:101 id:1 cantidad:10` resta desde la tabla general.",
      "`/general_prioridad tabla:101 id:1 nivel:alta` cambia prioridad desde la tabla general.",
      "`/pedidos` publica o actualiza la tabla de pedidos.",
      "`/pedidos_vincular canal:#alquimia` vincula este canal a otro inventario.",
      "`/pedido_crear id:101 cantidad:120 usuario:@alguien` crea un pedido.",
      "`/pedido_llevar pedido:1 cantidad:20` suma cantidad llevada.",
      "`/actividad` resume sumas y restas por usuario.",
    ].join("\n"),
  };
}
