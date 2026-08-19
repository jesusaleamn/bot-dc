export const DISCORD_API_BASE = "https://discord.com/api/v10";

export const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
};

export const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
};

export const EPHEMERAL_DELETE_DELAY_MS = 5000;

export const MessageFlags = {
  EPHEMERAL: 1 << 6,
};

export const ApplicationCommandType = {
  CHAT_INPUT: 1,
};

export const ApplicationCommandOptionType = {
  STRING: 3,
  INTEGER: 4,
};

export const PermissionBits = {
  ADMINISTRATOR: 1n << 3n,
  MANAGE_CHANNELS: 1n << 4n,
  MANAGE_GUILD: 1n << 5n,
};
