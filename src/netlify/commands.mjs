import { ApplicationCommandOptionType, ApplicationCommandType, MAX_ITEM_ID } from "./constants.mjs";

const itemIdOption = {
  name: "id",
  description: `ID del objeto, del 1 al ${MAX_ITEM_ID}.`,
  type: ApplicationCommandOptionType.INTEGER,
  required: true,
  min_value: 1,
  max_value: MAX_ITEM_ID,
};

const positiveAmountOption = {
  name: "cantidad",
  description: "Cantidad opcional. Si lo dejas vacio usa 1.",
  type: ApplicationCommandOptionType.INTEGER,
  required: false,
  min_value: 1,
  max_value: 2147483647,
};

const requiredAmountOption = {
  name: "cantidad",
  description: "Cantidad.",
  type: ApplicationCommandOptionType.INTEGER,
  required: true,
  min_value: 1,
  max_value: 2147483647,
};

const initialQuantityOption = {
  name: "cantidad",
  description: "Cantidad inicial.",
  type: ApplicationCommandOptionType.INTEGER,
  required: true,
  min_value: 0,
  max_value: 2147483647,
};

const nameOption = {
  name: "nombre",
  description: "Nombre del material.",
  type: ApplicationCommandOptionType.STRING,
  required: true,
  min_length: 1,
  max_length: 100,
};

const orderNumberOption = {
  name: "pedido",
  description: "Numero del pedido.",
  type: ApplicationCommandOptionType.INTEGER,
  required: true,
  min_value: 1,
  max_value: 2147483647,
};

const inventoryTableOption = {
  name: "tabla",
  description: "ID de la tabla de inventario, por ejemplo 101.",
  type: ApplicationCommandOptionType.INTEGER,
  required: true,
  min_value: 101,
  max_value: 2147483647,
};

const priorityOption = {
  name: "nivel",
  description: "Prioridad visual del objeto.",
  type: ApplicationCommandOptionType.STRING,
  required: true,
  choices: [
    { name: "🔴 Alta", value: "high" },
    { name: "🟠 Media", value: "medium" },
    { name: "🟢 Baja", value: "low" },
    { name: "⚪ Ninguna", value: "none" },
  ],
};

const requesterOption = {
  name: "usuario",
  description: "Quien pide el material. Si lo dejas vacio eres tu.",
  type: ApplicationCommandOptionType.USER,
  required: false,
};

const inventoryChannelOption = {
  name: "canal",
  description: "Canal donde esta el inventario que quieres vincular.",
  type: ApplicationCommandOptionType.CHANNEL,
  required: true,
};

const optionalUserOption = {
  name: "usuario",
  description: "Filtra por usuario.",
  type: ApplicationCommandOptionType.USER,
  required: false,
};

const optionalItemIdOption = {
  ...itemIdOption,
  required: false,
};

const optionalLimitOption = {
  name: "limite",
  description: "Numero de entradas, entre 1 y 20.",
  type: ApplicationCommandOptionType.INTEGER,
  required: false,
  min_value: 1,
  max_value: 20,
};

const viewFormatOption = {
  name: "formato",
  description: "Formato para mostrar la tabla solo para ti.",
  type: ApplicationCommandOptionType.STRING,
  required: false,
  choices: [
    { name: "Embed bonito", value: "embed" },
    { name: "Texto compatible", value: "texto" },
  ],
};

export const ADMIN_COMMANDS = new Set(["borrar"]);

export const COMMANDS = [
  {
    name: "inventario",
    description: "Crea el inventario permanente de este canal.",
    type: ApplicationCommandType.CHAT_INPUT,
    dm_permission: false,
    options: [
      {
        name: "nombre",
        description: "Nombre visible del inventario, por ejemplo Alquimia.",
        type: ApplicationCommandOptionType.STRING,
        required: true,
        min_length: 1,
        max_length: 100,
      },
    ],
  },
  {
    name: "crear",
    description: "Registra un objeto en el inventario de este canal.",
    type: ApplicationCommandType.CHAT_INPUT,
    dm_permission: false,
    options: [itemIdOption, nameOption, initialQuantityOption],
  },
  {
    name: "sumar",
    description: "Suma cantidad a un objeto del inventario de este canal.",
    type: ApplicationCommandType.CHAT_INPUT,
    dm_permission: false,
    options: [itemIdOption, positiveAmountOption],
  },
  {
    name: "restar",
    description: "Resta cantidad a un objeto sin permitir valores negativos.",
    type: ApplicationCommandType.CHAT_INPUT,
    dm_permission: false,
    options: [itemIdOption, positiveAmountOption],
  },
  {
    name: "editar",
    description: "Cambia el nombre de un objeto sin modificar su cantidad.",
    type: ApplicationCommandType.CHAT_INPUT,
    dm_permission: false,
    options: [itemIdOption, nameOption],
  },
  {
    name: "borrar",
    description: "Elimina un objeto del inventario de este canal.",
    type: ApplicationCommandType.CHAT_INPUT,
    dm_permission: false,
    options: [itemIdOption],
  },
  {
    name: "ver",
    description: "Muestra el inventario de este canal solo para ti.",
    type: ApplicationCommandType.CHAT_INPUT,
    dm_permission: false,
    options: [viewFormatOption],
  },
  {
    name: "recrear_inventario",
    description: "Recrea el mensaje permanente si fue eliminado.",
    type: ApplicationCommandType.CHAT_INPUT,
    dm_permission: false,
  },
  {
    name: "historial",
    description: "Muestra los últimos cambios del inventario de este canal.",
    type: ApplicationCommandType.CHAT_INPUT,
    dm_permission: false,
    options: [optionalLimitOption],
  },
  {
    name: "prioridad",
    description: "Marca la prioridad visual de un objeto del inventario.",
    type: ApplicationCommandType.CHAT_INPUT,
    dm_permission: false,
    options: [itemIdOption, priorityOption],
  },
  {
    name: "general",
    description: "Publica o actualiza la tabla general de inventarios.",
    type: ApplicationCommandType.CHAT_INPUT,
    dm_permission: false,
  },
  {
    name: "general_sumar",
    description: "Suma cantidad a una tabla de inventario desde el tablero general.",
    type: ApplicationCommandType.CHAT_INPUT,
    dm_permission: false,
    options: [inventoryTableOption, itemIdOption, requiredAmountOption],
  },
  {
    name: "general_restar",
    description: "Resta cantidad a una tabla de inventario desde el tablero general.",
    type: ApplicationCommandType.CHAT_INPUT,
    dm_permission: false,
    options: [inventoryTableOption, itemIdOption, requiredAmountOption],
  },
  {
    name: "general_prioridad",
    description: "Cambia la prioridad de un objeto desde el tablero general.",
    type: ApplicationCommandType.CHAT_INPUT,
    dm_permission: false,
    options: [inventoryTableOption, itemIdOption, priorityOption],
  },
  {
    name: "pedidos",
    description: "Publica o actualiza la tabla de pedidos activos.",
    type: ApplicationCommandType.CHAT_INPUT,
    dm_permission: false,
  },
  {
    name: "pedidos_vincular",
    description: "Vincula este canal de pedidos a un inventario de otro canal.",
    type: ApplicationCommandType.CHAT_INPUT,
    dm_permission: false,
    options: [inventoryChannelOption],
  },
  {
    name: "pedido_crear",
    description: "Crea un pedido para un material del inventario.",
    type: ApplicationCommandType.CHAT_INPUT,
    dm_permission: false,
    options: [itemIdOption, requiredAmountOption, requesterOption],
  },
  {
    name: "pedido_llevar",
    description: "Suma cantidad llevada a un pedido activo.",
    type: ApplicationCommandType.CHAT_INPUT,
    dm_permission: false,
    options: [orderNumberOption, requiredAmountOption],
  },
  {
    name: "pedido_completar",
    description: "Marca un pedido como completado.",
    type: ApplicationCommandType.CHAT_INPUT,
    dm_permission: false,
    options: [orderNumberOption],
  },
  {
    name: "pedidos_completados",
    description: "Muestra pedidos completados recientes.",
    type: ApplicationCommandType.CHAT_INPUT,
    dm_permission: false,
    options: [optionalLimitOption],
  },
  {
    name: "actividad",
    description: "Resume quien ha sumado y restado materiales.",
    type: ApplicationCommandType.CHAT_INPUT,
    dm_permission: false,
    options: [optionalUserOption, optionalItemIdOption, optionalLimitOption],
  },
  {
    name: "ayuda",
    description: "Muestra los comandos de inventario disponibles.",
    type: ApplicationCommandType.CHAT_INPUT,
    dm_permission: false,
  },
];
