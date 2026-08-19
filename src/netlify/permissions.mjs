import { PermissionBits } from "./constants.mjs";

export function hasInventoryAdminPermission(interaction) {
  const rawPermissions = interaction.member?.permissions;
  if (!rawPermissions) return false;

  const permissions = BigInt(rawPermissions);
  return Boolean(
    permissions & PermissionBits.ADMINISTRATOR ||
      permissions & PermissionBits.MANAGE_CHANNELS ||
      permissions & PermissionBits.MANAGE_GUILD,
  );
}

