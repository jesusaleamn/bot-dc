import { ApplicationCommandOptionType, ApplicationCommandType } from "./constants.mjs";

const itemIdOption = {
  name: "id",
  description: "ID del objeto, del 1 al 9.",
  type: ApplicationCommandOptionType.INTEGER,
  required: true,
  min_value: 1,
  max_value: 9,
};

const positiveAmountOption = {
  name: "cantidad",
  description: "Cantidad positiva.",
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

export const ADMIN_COMMANDS = new Set([
  "inventario",
  "crear",
  "editar",
  "borrar",
  "recrear_inventario",
  "historial",
]);

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
    options: [
      {
        name: "limite",
        description: "Número de entradas, entre 1 y 20.",
        type: ApplicationCommandOptionType.INTEGER,
        required: false,
        min_value: 1,
        max_value: 20,
      },
    ],
  },
  {
    name: "ayuda",
    description: "Muestra los comandos de inventario disponibles.",
    type: ApplicationCommandType.CHAT_INPUT,
    dm_permission: false,
  },
];

