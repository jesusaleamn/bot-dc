import { ITEM_ID_WIDTH } from "./constants.mjs";

const MATERIAL_WIDTH = 24;
const QUANTITY_WIDTH = 8;
const PRIORITY_WIDTH = 1;
const INVENTORY_EMBED_DESCRIPTION_LIMIT = 3600;
const GENERAL_EMBED_DESCRIPTION_LIMIT = 3600;
const GENERAL_PAGE_EMBED_LIMIT = 10;
const GENERAL_PAGE_TEXT_LIMIT = 5200;
const INVENTORY_TEXT_MESSAGE_LIMIT = 1800;

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

export function buildInventoryTextPages(inventory, items) {
  const name = inventoryName(inventory);
  const tableId = inventoryTableId(inventory);
  const footerText = `Inventario compartido de este canal · ${priorityLegend()}`;

  if (!items.length) {
    return [inventoryTextContent(inventoryTitle(name, tableId), [], footerText)];
  }

  const chunks = splitInventoryItemsForText(items, inventoryTitle(name, tableId), footerText);
  return chunks.map((chunk, index) => {
    const suffix = chunks.length > 1 ? ` (${index + 1}/${chunks.length})` : "";
    return inventoryTextContent(inventoryTitle(name, tableId, suffix), chunk, footerText);
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

function inventoryTextContent(title, items, footerText) {
  const description = items.length
    ? formatInventoryTableDescription([...inventoryHeaderLines(), ...items.map(inventoryItemLine)])
    : "> No hay objetos registrados.";

  return `**${title}**\n${description}\n${footerText}`;
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

function splitInventoryItemsForText(items, baseTitle, footerText) {
  const sortedItems = [...items].sort((a, b) => a.item_id - b.item_id);
  const chunks = [];
  let currentItems = [];

  for (const item of sortedItems) {
    const nextItems = [...currentItems, item];
    const nextContent = inventoryTextContent(`${baseTitle} (999/999)`, nextItems, footerText);

    if (currentItems.length > 0 && nextContent.length > INVENTORY_TEXT_MESSAGE_LIMIT) {
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

export function buildMemberActivityEmbed({ inventory, summaries, recentReasons }) {
  if (!summaries.length) {
    return {
      title: `👥 MIEMBROS — ${inventory.name.trim().toUpperCase()}`,
      description: "> Todavía no hay sumas ni restas registradas.",
      color: 0x5865f2,
      footer: {
        text: "Actividad vinculada al inventario",
      },
    };
  }

  const fields = buildMemberActivityFields(summaries);
  const description = [
    "Resumen por usuario e ID. Neto positivo = aportó más de lo que retiró.",
    formatRecentReasons(recentReasons),
  ].filter(Boolean).join("\n\n");

  return {
    title: `👥 MIEMBROS — ${inventory.name.trim().toUpperCase()}`,
    description,
    color: 0x5865f2,
    fields,
    footer: {
      text: `Tabla ${inventory.table_id} · ${summaries.length} filas de actividad`,
    },
  };
}

export function buildMemberActivityPages(view) {
  if (!view.summaries.length) return [buildMemberActivityEmbed(view)];
  const users = new Map();
  for (const row of view.summaries) {
    const rows = users.get(row.user_id) ?? [];
    rows.push(row);
    users.set(row.user_id, rows);
  }
  const pages = [];
  for (const [userId, rows] of users) {
    const prefix = `<@${userId}>\n\n`;
    let chunk = [];
    const publish = () => {
      pages.push({
        title: `👥 MIEMBROS — ${view.inventory.name.trim().toUpperCase()}`,
        description: `${prefix}${formatMemberActivityTable(chunk)}`,
        color: 0x5865f2,
        footer: { text: `Tabla ${view.inventory.table_id} · ${chunk.length} filas de actividad · Neto = aportado menos retirado` },
      });
    };
    for (const row of rows) {
      const candidate = [...chunk, row];
      if (chunk.length && prefix.length + formatMemberActivityTable(candidate).length > 4096) {
        publish();
        chunk = [];
      }
      chunk.push(row);
    }
    if (chunk.length) publish();
  }
  const reasons = formatRecentReasons(view.recentReasons);
  if (reasons) {
    pages.push({ title: `👥 MOTIVOS — ${view.inventory.name.trim().toUpperCase()}`, description: reasons, color: 0x5865f2 });
  }
  return pages.map((page, index) => ({ ...page, title: `${page.title} (${index + 1}/${pages.length})` }));
}

export function buildEconomyPages(view) {
  const pages = [];
  for (let offset = 0; offset < Math.max(1, view.summaries.length); offset += 6) {
    pages.push(buildEconomyEmbed({ ...view, summaries: view.summaries.slice(offset, offset + 6), recentEntries: offset ? [] : view.recentEntries }));
  }
  return pages.map((page, index) => ({ ...page, title: `${page.title} (${index + 1}/${pages.length})` }));
}

export function buildEconomyEmbed({ inventory, totals, summaries, recentEntries }) {
  const fields = [
    {
      name: "Balance",
      value: [
        `Ingresos: \`${formatMoney(totals.incomeTotal)}\``,
        `Gastos: \`${formatMoney(totals.expenseTotal)}\``,
        `Neto: \`${formatSignedMoney(totals.balance)}\``,
      ].join(" · "),
      inline: false,
    },
  ];

  if (summaries.length) {
    fields.push({
      name: "Por material",
      value: formatEconomySummaryTable(summaries),
      inline: false,
    });
  }

  if (recentEntries.length) {
    fields.push({
      name: "Últimos movimientos",
      value: formatRecentEconomyEntries(recentEntries),
      inline: false,
    });
  }

  return {
    title: `💰 ECONOMÍA — ${inventory.name.trim().toUpperCase()}`,
    description: summaries.length
      ? "Ventas y compras vinculadas a IDs del inventario. No modifica el stock automáticamente."
      : "> Todavía no hay ventas ni compras registradas.",
    color: totals.balance >= 0 ? 0x2f855a : 0xc53030,
    fields,
    footer: {
      text: `Tabla ${inventory.table_id} · economía vinculada al inventario`,
    },
  };
}

function buildMemberActivityFields(summaries) {
  const byUser = new Map();
  for (const summary of summaries) {
    const entries = byUser.get(summary.user_id) ?? [];
    entries.push(summary);
    byUser.set(summary.user_id, entries);
  }

  return [...byUser.entries()].slice(0, 10).map(([userId, entries]) => ({
    name: "Miembro",
    value: `<@${userId}>\n${formatMemberActivityTable(entries)}`,
    inline: false,
  }));
}

function formatMemberActivityTable(entries) {
  const visibleEntries = entries;
  const lines = [
    `${"ID".padStart(ITEM_ID_WIDTH)} MATERIAL             ${"+".padStart(6)} ${"-".padStart(6)} ${"NETO".padStart(7)}`,
    ...visibleEntries.map((entry) => {
      const material = shorten(entry.item_name, 20);
      return [
        String(entry.item_id).padStart(ITEM_ID_WIDTH),
        material.padEnd(20),
        String(entry.total_added).padStart(6),
        String(entry.total_removed).padStart(6),
        formatSigned(entry.net_total).padStart(7),
      ].join(" ");
    }),
  ];

  if (entries.length > visibleEntries.length) {
    lines.push(`... y ${entries.length - visibleEntries.length} materiales mas`);
  }

  return formatPlainCodeBlock(lines);
}

function formatRecentReasons(entries) {
  if (!entries.length) {
    return "";
  }

  return [
    "Motivos recientes:",
    ...entries.slice(0, 5).map((entry) => (
      `\`${formatShortDate(entry.created_at)}\` <@${entry.user_id}> ${entry.operation} ${entry.item_id} x${entry.amount}: ${shorten(entry.reason, 56)}`
    )),
  ].join("\n");
}

function formatEconomySummaryTable(summaries) {
  const visibleSummaries = summaries.slice(0, 12);
  const lines = [
    `${"ID".padStart(ITEM_ID_WIDTH)} MATERIAL             ${"VEND".padStart(6)} ${"COMP".padStart(6)} ${"NETO".padStart(9)}`,
    ...visibleSummaries.map((summary) => {
      const material = shorten(summary.item_name, 20);
      return [
        String(summary.item_id).padStart(ITEM_ID_WIDTH),
        material.padEnd(20),
        String(summary.sold_quantity).padStart(6),
        String(summary.bought_quantity).padStart(6),
        formatSignedMoney(summary.balance).padStart(9),
      ].join(" ");
    }),
  ];

  if (summaries.length > visibleSummaries.length) {
    lines.push(`... y ${summaries.length - visibleSummaries.length} materiales mas`);
  }

  return formatPlainCodeBlock(lines);
}

function formatRecentEconomyEntries(entries) {
  return entries.slice(0, 4).map((entry) => {
    const reason = entry.reason ? ` · ${shorten(entry.reason, 42)}` : "";
    return `\`${formatShortDate(entry.created_at)}\` ${entry.operation} \`${String(entry.item_id).padStart(ITEM_ID_WIDTH)}\` x${entry.quantity} · ${formatMoney(entry.total)} · <@${entry.user_id}>${reason}`;
  }).join("\n");
}

function formatPlainCodeBlock(lines) {
  return `\`\`\`text\n${lines.join("\n")}\n\`\`\``;
}

function formatMoney(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function formatSignedMoney(value) {
  return value > 0 ? `+${formatMoney(value)}` : formatMoney(value);
}

function formatShortDate(value) {
  if (!value) {
    return "sin fecha";
  }

  return new Date(value).toISOString().slice(5, 16).replace("T", " ");
}

export function buildHelpEmbed() {
  return {
    title: "Comandos del inventario",
    color: 0x2f855a,
    description: [
      "`/inventario nombre:Alquimia` crea el inventario del canal.",
      "`/crear id:1 nombre:Flor de montaña cantidad:50` registra un objeto.",
      "`/sumar id:2 cantidad:101 motivo:Entrega` suma cantidad. Si omites cantidad, suma 1.",
      "`/restar id:2 cantidad:101 motivo:Retirada` resta cantidad. Si omites cantidad, resta 1.",
      "`/editar id:1 nombre:Nuevo nombre` renombra un objeto.",
      "`/borrar id:1` elimina un objeto. Requiere permisos.",
      "`/ver formato:embed` muestra el inventario bonito solo para ti.",
      "`/ver formato:texto` muestra el inventario compatible solo para ti.",
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
      "`/miembros` publica la tabla de actividad de miembros.",
      "`/miembros_vincular canal:#alquimia` vincula este canal/hilo a la actividad de otro inventario.",
      "`/economia` publica la tabla de economia.",
      "`/economia_vincular canal:#alquimia` vincula este canal/hilo a la economia de otro inventario.",
      "`/economia_venta id:1 cantidad:10 total:500 motivo:Venta` registra ingresos.",
      "`/economia_compra id:1 cantidad:10 total:300 motivo:Compra` registra gastos.",
    ].join("\n"),
  };
}
