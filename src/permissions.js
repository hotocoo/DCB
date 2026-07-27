/**
 * Permission and role-checking utilities for commands.
 */

import { logger } from './logger.js';

// Discord built-in permission flags
const DISCORD_PERMISSIONS = {
  ADMINISTRATOR: 'Administrator',
  MANAGE_GUILD: 'ManageGuild',
  MANAGE_MESSAGES: 'ManageMessages',
  KICK_MEMBERS: 'KickMembers',
  BAN_MEMBERS: 'BanMembers',
};

// Command-level permission requirements
const ADMIN_ONLY_COMMANDS = new Set(['admin', 'guild']);
const MOD_ONLY_COMMANDS = new Set(['remind']); // extensible

export function hasDiscordPermission(member, required) {
  if (!member || !required) return false;
  if (member.permissions.has(DISCORD_PERMISSIONS.ADMINISTRATOR)) return true;
  return member.permissions.has(required);
}

/**
 * Returns {allowed:true} or {allowed:false, reason:'...'} explaining denial.
 */
export function checkCommandPermission(interaction, commandName) {
  const user = interaction.user || {};
  const guildId = interaction.guild?.id;

  // Guild admin-only commands: require Administrator permission or bot owner ID match
  if (ADMIN_ONLY_COMMANDS.has(commandName)) {
    if (!guildId) return { allowed: false, reason: 'This command can only be used in a server.' };
    const member = interaction.member;
    const requiredPerm = DISCORD_PERMISSIONS.ADMINISTRATOR;
    if (!hasDiscordPermission(member, requiredPerm)) {
      return { allowed: false, reason: `Requires Administrator permission to use \`${commandName}\`.` };
    }
  }

  // Mod-level commands
  if (MOD_ONLY_COMMANDS.has(commandName)) {
    if (!guildId) return { allowed: false, reason: 'This command can only be used in a server.' };
    const member = interaction.member;
    if (!member.permissions.has(DISCORD_PERMISSIONS.MANAGE_MESSAGES)) {
      return { allowed: false, reason: `Requires Manage Messages permission to use \`${commandName}\`.` };
    }
  }

  return { allowed: true };
}

export { DISCORD_PERMISSIONS };
