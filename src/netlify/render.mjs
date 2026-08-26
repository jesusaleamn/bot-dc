import { ITEM_ID_WIDTH } from "./constants.mjs";

const MATERIAL_WIDTH = 24;
const QUANTITY_WIDTH = 8;
const PRIORITY_WIDTH = 2;
const GENERAL_INVENTORY_LIMIT = 9;

const PRIORITY_META = {
  high: { icon: "🔴", label: "Alta" },
  medium: { icon: "🟠", label: "Media" },
  low: { icon: "🟢", label: "Baja" },
  none: { icon: "⚪", label: "Ninguna" },
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

function formatPriorityIcon(priority) {
  return PRIORITY_META[priority]?.icon ?? PRIORITY_META.none.icon;
}

function priorityLegend() {
  return "Prioridad: 🔴 alta · 🟠 media · 🟢 baja · ⚪ ninguna";
}

export function renderInventory(inventory, items) {
  const name = inventoryName(inventory);
  const tableId = inventoryTableId(inventory);
  const title = tableId
    ? `🧪 INVENTARIO ${tableId} — ${name.trim().toUpperCase()}`
    : `🧪 INVENTARIO — ${name.trim().toUpperCase()}`;

  if (!items.length) {
    return {
      title,
      description: "> No hay objetos registrados.",
      color: 0x2f855a,
    };
  }

  const lines = [
    `${"ID".padStart(ITEM_ID_WIDTH)} │ ${"P".padEnd(PRIORITY_WIDTH)} │ ${"MATERIAL".padEnd(MATERIAL_WIDTH)} │ ${"CANTIDAD".padStart(QUANTITY_WIDTH)}`,
    `${"─".repeat(ITEM_ID_WIDTH)}─┼─${"─".repeat(PRIORITY_WIDTH)}─┼─${"─".repeat(MATERIAL_WIDTH)}─┼─${"─".repeat(QUANTITY_WIDTH)}`,
  ];

  for (const item of [...items].sort((a, b) => a.item_id - b.item_id)) {
    const material = shorten(item.name, MATERIAL_WIDTH);
    lines.push(
      `${String(item.item_id).padStart(ITEM_ID_WIDTH)} │ ${formatPriorityIcon(item.priority).padEnd(PRIORITY_WIDTH)} │ ${material.padEnd(MATERIAL_WIDTH)} │ ${String(item.quantity).padStart(QUANTITY_WIDTH)}`,
    );
  }

  return {
    title,
    description: `\`\`\`text\n${lines.join("\n")}\n\`\`\``,
    color: 0x2f855a,
  };
}

export function buildInventoryEmbed(inventory, items) {
  return {
    ...renderInventory(inventory, items),
    footer: {
      text: `Inventario compartido de este canal · ${priorityLegend()}`,
    },
  };
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

  const visibleInventories = inventories.slice(0, GENERAL_INVENTORY_LIMIT);
  const embeds = visibleInventories.map((inventory) => {
    const rendered = renderInventory(inventory, inventory.items);
    return {
      ...rendered,
      title: `📚 TABLA ${inventory.table_id} — ${inventory.name.trim().toUpperCase()}`,
      footer: {
        text: `Canal <#${inventory.channel_id}> · ${priorityLegend()}`,
      },
    };
  });

  if (inventories.length > visibleInventories.length) {
    embeds.push({
      title: "📚 Más tablas",
      description: `Hay ${inventories.length - visibleInventories.length} inventarios más. Crea otra tabla general si necesitas separarlos por canal.`,
      color: 0x5865f2,
    });
  }

  return embeds;
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
