import fs from 'node:fs';
import path from 'node:path';

import { getDb } from './database.js';
import { logger } from './logger.js';
import { sanitizeInput } from './validation.js';

const OLD_CC_FILE = path.join(process.cwd(), 'data', 'customcommands.json');

function migrateFromJson() {
  const db = getDb();
  if (!db.prepare('SELECT name FROM sqlite_master WHERE type="table" AND name="custom_commands"').get()) return;
  if (!fs.existsSync(OLD_CC_FILE)) return;

  try {
    const data = JSON.parse(fs.readFileSync(OLD_CC_FILE, 'utf8')) || {};

    // Migrate commands per guild
    for (const [gid, cmds] of Object.entries(data.commands || {})) {
      db.prepare('INSERT OR REPLACE INTO custom_commands (guild_id, commands_data) VALUES (?, ?)').run(gid, JSON.stringify(cmds));
    }

    // Migrate usage stats to user_settings table  
    for (const [gid, usageByUser] of Object.entries(data.usage || {})) {
      for (const [uid, cmdUsage] of Object.entries(usageByUser)) {
        let settings;
        try { settings = JSON.parse(db.prepare('SELECT settings_data FROM user_settings WHERE user_id = ?').get(uid)?.settings_data || '{}'); } catch { settings = {}; }
        if (!settings.customCommandUsage) settings.customCommandUsage = {};
        settings.customCommandUsage[gid] = cmdUsage;
        db.prepare('INSERT OR REPLACE INTO user_settings (user_id, settings_data) VALUES (?, ?)').run(uid, JSON.stringify(settings));
      }
    }

    // Migrate templates
    if (Object.keys(data.templates || {}).length > 0) {
      const existing = db.prepare('SELECT data FROM custom_commands WHERE guild_id = "__templates__"').get();
      db.prepare('INSERT OR REPLACE INTO custom_commands (guild_id, commands_data) VALUES (?, ?)').run('__templates__', JSON.stringify(data.templates));
    }

    logger.info(`Migrated custom commands for ${Object.keys(data.commands || {}).length} guilds`);
  } catch (err) { logger.error('Custom commands migration failed', err instanceof Error ? err : new Error(String(err))); }
}

// Guild-level command storage helpers
function getGuildCommands(guildId) {
  migrateFromJson();
  const db = getDb();
  const row = db.prepare('SELECT commands_data FROM custom_commands WHERE guild_id = ?').get(guildId);
  try { return JSON.parse(row?.commands_data || '{}'); } catch { return {}; }
}

function saveGuildCommands(guildId, cmds) {
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO custom_commands (guild_id, commands_data) VALUES (?, ?)').run(guildId, JSON.stringify(cmds));
}

function ensureNested(container, ...keys) {
  let cursor = container;
  for (const key of keys) {
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
    cursor = cursor[key];
  }
  return cursor;
}

export function createCommand(guildId, commandData) {
  const cmd = getGuildCommands(guildId);
  const id = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  
  // Sanitize inputs for security
  const name = sanitizeInput(commandData.name || '').slice(0, 64);
  const description = sanitizeInput(commandData.description || '').slice(0, 512);
  const response = sanitizeInput(commandData.response || '').slice(0, 2048);

  if (!name || name.length < 2) return { success: false, reason: 'invalid_name' };
  if (!/^[a-z0-9_-]{2,64}$/i.test(name)) return { success: false, reason: 'invalid_name_format' };
  if (!response) return { success: false, reason: 'no_response' };

  const command = {
    id, name, description, response, type: commandData.type || 'text', permissions: commandData.permissions || [],
    cooldown: commandData.cooldown || 0, usage_count: 0, created_by: commandData.created_by || '', created_at: Date.now(),
    enabled: true, aliases: Array.isArray(commandData.aliases) ? commandData.aliases.map(a => sanitizeInput(a)) : [],
    variables: commandData.variables || {}, embed: commandData.embed,
  };

  cmd[id] = command;
  saveGuildCommands(guildId, cmd);
  return { success: true, command };
}

export async function executeCommand(commandName, guildId, userId, args = {}) {
  const cmds = getGuildCommands(guildId);
  
  let command, cid;
  for (const [id, c] of Object.entries(cmds)) {
    if ((c.name === commandName || (c.aliases || []).includes(commandName)) && c.enabled) { command = c; cid = id; break; }
  }

  if (!command) return { success: false, reason: 'command_not_found' };

  // Increment usage count
  command.usage_count++;
  saveGuildCommands(guildId, cmds);

  // Process response with variable substitution (safe - no eval/exec)
  let response = command.response || '';

  for (const [key, val] of Object.entries(command.variables || {})) {
    response = response.replaceAll(`$${key}`, String(val).slice(0, 100));
  }

  // Replace user context variables  
  response = response.replaceAll('${user}', `<@${userId}>`);
  response = response.replaceAll('${username}', sanitizeInput(args.username || 'User').slice(0, 32));
  response = response.replaceAll('${guild}', sanitizeInput(args.guildName || 'Server').slice(0, 64));

  if (command.type === 'dynamic') {
    // Handle dynamic content safely - random selection and date/time only
    response = processDynamicResponse(response);
  }

  return { success: true, response, embed: command.embed, type: command.type };
}

function processDynamicResponse(text) {
  return text
    .replaceAll(/${random:([^}]+)}/g, (_, options) => (options.split('|') || []).map(s => s.trim())[Math.floor(Math.random() * ((options.split('|').length) || 1))] || '')
    .replaceAll('${date}', new Date().toLocaleDateString())
    .replaceAll('${time}', new Date().toLocaleTimeString());
}

export function updateCommand(guildId, commandId, updates) {
  const cmds = getGuildCommands(guildId);
  if (!cmds[commandId]) return { success: false, reason: 'not_found' };

  // Sanitize updated fields if provided
  if (updates.name && !/^[a-z0-9_-]{2,64}$/i.test(updates.name)) return { success: false, reason: 'invalid_name_format' };
  
  Object.assign(cmds[commandId], {
    name: updates.name ? sanitizeInput(updates.name).slice(0, 64) : undefined,
    description: updates.description ? sanitizeInput(updates.description).slice(0, 512) : undefined, 
    response: updates.response ? sanitizeInput(updates.response).slice(0, 2048) : undefined,
    aliases: Array.isArray(updates.aliases) ? updates.aliases.map(a => sanitizeInput(a)) : undefined,
    permissions: updates.permissions, cooldown: updates.cooldown, enabled: updates.enabled,
    variables: updates.variables, embed: updates.embed, type: updates.type,
    updated_at: Date.now()
  });

  // Remove undefined properties from update to keep original values
  for (const key of Object.keys(cmds[commandId])) {
    if (cmds[commandId][key] === undefined && cmds[commandId][key] !== false && cmds[commandId][key] !== 0) delete cmds[commandId][key];
  }

  saveGuildCommands(guildId, cmds);
  return { success: true, command: cmds[commandId] };
}

export function deleteCommand(guildId, commandId) {
  const cmds = getGuildCommands(guildId);
  if (!cmds[commandId]) return { success: false, reason: 'not_found' };
  delete cmds[commandId];
  saveGuildCommands(guildId, cmds);
  return { success: true };
}

export function searchCommands(guildId, query) {
  const cmds = getGuildCommands(guildId);
  const q = query.toLowerCase();
  return Object.entries(cmds).filter(([, c]) => 
    c.name.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q)
  ).map(([id, c]) => ({ id, ...c }));
}

export function getPopularCommands(guildId, limit = 10) {
  const cmds = getGuildCommands(guildId);
  return Object.entries(cmds).filter(([, c]) => c.enabled)
    .sort(([, a], [, b]) => (b.usage_count || 0) - (a.usage_count || 0))
    .slice(0, limit).map(([id, c]) => ({ id, name: c.name, description: c.description, usage: c.usage_count || 0, created_by: c.created_by }));
}

export function getCommandStats(guildId) {
  const cmds = getGuildCommands(guildId);
  const list = Object.values(cmds).filter(c => c.enabled);
  if (!list.length) return { totalCommands: 0, totalUsage: 0, averageUsage: 0, categories: {} };

  const totalUsage = list.reduce((sum, c) => sum + (c.usage_count || 0), 0);
  return {
    totalCommands: list.length, 
    totalUsage, 
    averageUsage: totalUsage / list.length, 
    mostUsed: [...list].sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0))[0]?.name || 'None'
  };
}

// Import/Export for cross-guild sharing
export function exportCommands(guildId) {
  const cmds = getGuildCommands(guildId);
  return { commands: Object.values(cmds), exported_at: Date.now(), guild_id: guildId, version: '1.0' };
}

export function importCommands(guildId, importData) {
  if (importData.version !== '1.0') return { success: false, reason: 'incompatible_version' };
  
  const cmds = getGuildCommands(guildId);
  let count = 0;
  
  for (const cmd of (importData.commands || [])) {
    const id = `imported_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    cmds[id] = { ...cmd, id, imported_at: Date.now(), usage_count: 0 };
    count++;
  }

  saveGuildCommands(guildId, cmds);
  return { success: true, imported: count };
}

// Command validation helper for UI/commands layer
export function validateCommand(commandData) {
  const errors = [];
  
  if (!commandData.name || commandData.name.length < 2) errors.push('Name too short');
  else if (!/^[a-z0-9_-]{2,64}$/i.test(commandData.name)) errors.push('Invalid name format');
  
  if (!commandData.response || !commandData.response.trim()) errors.push('Response required');
  
  return { valid: !errors.length, errors };
}

// Backward-compatible singleton API for callers using customCommandManager.*
export const customCommandManager = { createCommand, executeCommand, updateCommand, deleteCommand, searchCommands, getPopularCommands, getCommandStats, exportCommands, importCommands, validateCommand };
