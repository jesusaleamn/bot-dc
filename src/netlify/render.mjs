const MATERIAL_WIDTH = 28;

function shorten(value, width) {
  const clean = value.trim();
  if (clean.length <= width) return clean;
  return `${clean.slice(0, width - 3)}...`;
}

export function renderInventory(name, items) {
  const title = `🧪 INVENTARIO — ${name.trim().toUpperCase()}`;

  if (!items.length) {
    return {
      title,
      description: "> No hay objetos registrados.",
      color: 0x2f855a,
    };
  }

  const lines = [
    `${"ID".padStart(2)} │ ${"MATERIAL".padEnd(MATERIAL_WIDTH)} │ ${"CANTIDAD".padStart(8)}`,
    `${"─".repeat(2)}─┼─${"─".repeat(MATERIAL_WIDTH)}─┼─${"─".repeat(8)}`,
  ];

  for (const item of [...items].sort((a, b) => a.item_id - b.item_id)) {
    const material = shorten(item.name, MATERIAL_WIDTH);
    lines.push(
      `${String(item.item_id).padStart(2)} │ ${material.padEnd(MATERIAL_WIDTH)} │ ${String(item.quantity).padStart(8)}`,
    );
  }

  return {
    title,
    description: `\`\`\`text\n${lines.join("\n")}\n\`\`\``,
    color: 0x2f855a,
  };
}

export function buildInventoryEmbed(name, items) {
  return {
    ...renderInventory(name, items),
    footer: {
      text: "Inventario compartido de este canal",
    },
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
      "`/borrar id:1` elimina un objeto.",
      "`/ver` muestra el inventario solo para ti.",
      "`/recrear_inventario` vuelve a publicar el mensaje fijo.",
      "`/historial limite:10` muestra cambios recientes a responsables.",
    ].join("\n"),
  };
}
