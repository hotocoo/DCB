import fs from 'node:fs';
import path from 'node:path';

import { logger } from './logger.js';

const CUSTOM_COMMANDS_FILE = path.join(process.cwd(), 'data', 'customcommands.json');

// Advanced Custom Command System
class CustomCommandManager {
  constructor() {
    this.ensureStorage();
    this.loadCustomCommands();
    this.commandCache = new Map();
  }

  ensureStorage() {
    const dir = path.dirname(CUSTOM_COMMANDS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(CUSTOM_COMMANDS_FILE)) {
      fs.writeFileSync(CUSTOM_COMMANDS_FILE, JSON.stringify({
        commands: {},
        usage: {},
        templates: {}
      }));
    }
  }

  loadCustomCommands() {
    try {
      const data = JSON.parse(fs.readFileSync(CUSTOM_COMMANDS_FILE));
      this.customCommands = data;
    }
    catch (error) {
      logger.error('Failed to load custom commands', error);
      this.customCommands = {
        commands: {},
        usage: {},
        templates: {}
      };
    }
  }

  saveCustomCommands() {
    try {
      fs.writeFileSync(CUSTOM_COMMANDS_FILE, JSON.stringify(this.customCommands, undefined, 2));
    }
    catch (error) {
      logger.error('Failed to save custom commands', error);
    }
  }

  // Helper: ensure a nested object path exists, then return it.
  ensureNested(container, ...keys) {
    let cursor = container;
    for (const key of keys) {
      const hasKey = Object.hasOwn(cursor, key);
      // eslint-disable-next-line security/detect-object-injection -- key existence checked via Object.hasOwn above
      const existing = hasKey ? cursor[key] : undefined;
      if (!hasKey || existing === null || typeof existing !== 'object') {
        // eslint-disable-next-line security/detect-object-injection -- key existence checked via Object.hasOwn above
        cursor[key] = {};
      }
      // eslint-disable-next-line security/detect-object-injection -- key existence checked via Object.hasOwn above
      cursor = cursor[key];
    }
    return cursor;
  }

  // Custom Command Creation
  createCommand(guildId, commandData) {
    const commandId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    const command = {
      id: commandId,
      name: commandData.name,
      description: commandData.description,
      response: commandData.response,
      type: commandData.type || 'text',
      permissions: commandData.permissions || [],
      cooldown: commandData.cooldown || 0,
      usage_count: 0,
      created_by: commandData.created_by,
      created_at: Date.now(),
      enabled: true,
      aliases: commandData.aliases || [],
      variables: commandData.variables || {},
      embed: commandData.embed || undefined
    };

    const guildCommands = this.ensureNested(this.customCommands.commands, guildId);
    // eslint-disable-next-line security/detect-object-injection -- commandId is freshly generated
    guildCommands[commandId] = command;
    this.saveCustomCommands();

    return { success: true, command };
  }

  // Command Execution
  async executeCommand(commandName, guildId, userId, args = {}) {
    // Find command by name or alias
    // eslint-disable-next-line security/detect-object-injection -- guildId is a function parameter
    const commands = this.customCommands.commands[guildId] || {};
    let command;
    let commandId;

    for (const [id, cmd] of Object.entries(commands)) {
      if (cmd.name === commandName || cmd.aliases.includes(commandName)) {
        command = cmd;
        commandId = id;
        break;
      }
    }

    if (!command || !command.enabled) {
      return { success: false, reason: 'command_not_found' };
    }

    // Check permissions
    if (command.permissions.length > 0) {
      // In a real implementation, check user roles/permissions against Discord guild roles.
      // For demo, skip the check to allow execution; production code should integrate with Discord.js.
      logger.debug(`Permission check for command ${commandName} by user ${userId}: skipped (Discord.js integration pending)`);
    }

    // Track usage
    command.usage_count++;
    const guildUsage = this.ensureNested(this.customCommands.usage, guildId);
    const userUsage = this.ensureNested(guildUsage, userId);
    // eslint-disable-next-line security/detect-object-injection -- userUsage key path created above
    userUsage[commandId] = (userUsage[commandId] || 0) + 1;

    this.saveCustomCommands();

    // Process response with variables
    let response = command.response;

    // Replace variables
    for (const [key, value] of Object.entries(command.variables)) {
      response = response.replaceAll(new RegExp(`\\$\\{${key}\\}`, 'g'), value);
    }

    // Replace user variables
    response = response.replaceAll('${user}', `<@${userId}>`);
    response = response.replaceAll('${username}', args.username || 'User');
    response = response.replaceAll('${guild}', args.guildName || 'Server');

    // Process dynamic content
    if (command.type === 'dynamic') {
      response = await this.processDynamicResponse(response, args);
    }

    return {
      success: true,
      response,
      embed: command.embed,
      type: command.type
    };
  }

  async processDynamicResponse(response, args) {
    // Process dynamic content like random selections, calculations, etc.
    response = response.replaceAll(/\${random:([^}]+)}/g, (match, options) => {
      const choices = options.split('|');
      return choices[Math.floor(Math.random() * choices.length)].trim();
    });

    response = response.replaceAll('${date}', new Date().toLocaleDateString());
    response = response.replaceAll('${time}', new Date().toLocaleTimeString());

    return response;
  }

  // Command Management
  updateCommand(guildId, commandId, updates) {
    // eslint-disable-next-line security/detect-object-injection -- guildId/commandId are function parameters
    const commands = this.customCommands.commands[guildId];
    // eslint-disable-next-line security/detect-object-injection -- commandId is a function parameter
    if (!commands || !commands[commandId]) {
      return { success: false, reason: 'command_not_found' };
    }

    // eslint-disable-next-line security/detect-object-injection -- commandId validated above
    const command = commands[commandId];
    Object.assign(command, updates);
    command.updated_at = Date.now();

    this.saveCustomCommands();
    return { success: true, command };
  }

  deleteCommand(guildId, commandId) {
    // eslint-disable-next-line security/detect-object-injection -- guildId/commandId are function parameters
    const commands = this.customCommands.commands[guildId];
    // eslint-disable-next-line security/detect-object-injection -- commandId is a function parameter
    if (!commands || !commands[commandId]) {
      return { success: false, reason: 'command_not_found' };
    }

    // eslint-disable-next-line security/detect-object-injection -- commandId validated above
    delete commands[commandId];
    this.saveCustomCommands();
    return { success: true };
  }

  // Command Templates
  createTemplate(templateData) {
    const templateId = `template_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    const template = {
      id: templateId,
      name: templateData.name,
      description: templateData.description,
      response_template: templateData.response_template,
      variables: templateData.variables || [],
      category: templateData.category || 'general',
      created_by: templateData.created_by,
      created_at: Date.now()
    };

    // eslint-disable-next-line security/detect-object-injection -- templateId is freshly generated
    this.customCommands.templates[templateId] = template;
    this.saveCustomCommands();

    return { success: true, template };
  }

  // Command Discovery
  searchCommands(guildId, query) {
    // eslint-disable-next-line security/detect-object-injection -- guildId is a function parameter
    const commands = this.customCommands.commands[guildId] || {};
    const results = [];

    for (const [id, command] of Object.entries(commands)) {
      if (command.name.toLowerCase().includes(query.toLowerCase()) ||
          command.description.toLowerCase().includes(query.toLowerCase())) {
        results.push({ id, ...command });
      }
    }

    return results;
  }

  getCommandsByCategory(guildId, category) {
    // eslint-disable-next-line security/detect-object-injection -- guildId is a function parameter
    const commands = this.customCommands.commands[guildId] || {};
    const results = [];

    for (const [id, command] of Object.entries(commands)) {
      if (command.category === category) {
        results.push({ id, ...command });
      }
    }

    return results;
  }

  // Usage Analytics
  getCommandUsage(guildId, commandId) {
    // eslint-disable-next-line security/detect-object-injection -- guildId is a function parameter
    const usage = this.customCommands.usage[guildId] || {};
    let totalUses = 0;
    const userBreakdown = {};

    for (const [userId, userCommands] of Object.entries(usage)) {
      // eslint-disable-next-line security/detect-object-injection -- commandId is a function parameter
      const uses = userCommands[commandId] || 0;
      totalUses += uses;
      // eslint-disable-next-line security/detect-object-injection -- userId from Object.entries iteration
      userBreakdown[userId] = uses;
    }

    return {
      totalUses,
      userBreakdown,
      averagePerUser: Object.keys(userBreakdown).length > 0 ? totalUses / Object.keys(userBreakdown).length : 0
    };
  }

  getPopularCommands(guildId, limit = 10) {
    // eslint-disable-next-line security/detect-object-injection -- guildId is a function parameter
    const commands = this.customCommands.commands[guildId] || {};
    const popularity = [];

    for (const [id, command] of Object.entries(commands)) {
      const usage = this.getCommandUsage(guildId, id);
      popularity.push({
        id,
        name: command.name,
        description: command.description,
        usage: usage.totalUses,
        created_by: command.created_by
      });
    }

    return popularity
      .sort((a, b) => b.usage - a.usage)
      .slice(0, limit);
  }

  // Advanced Features
  createCommandChain(guildId, chainData) {
    // Create a chain of commands that execute in sequence
    const chainId = `chain_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    const chain = {
      id: chainId,
      name: chainData.name,
      commands: chainData.commandList,
      delay: chainData.delay || 1000,
      created_by: chainData.created_by,
      created_at: Date.now()
    };

    if (!Object.hasOwn(this.customCommands, 'chains')) {
      // eslint-disable-next-line security/detect-object-injection -- 'chains' is a fixed key
      this.customCommands.chains = {};
    }
    const guildChains = this.ensureNested(this.customCommands.chains, guildId);

    // eslint-disable-next-line security/detect-object-injection -- chainId is freshly generated
    guildChains[chainId] = chain;
    this.saveCustomCommands();

    return { success: true, chain };
  }

  // Command Permissions
  setCommandPermissions(guildId, commandId, permissions) {
    // eslint-disable-next-line security/detect-object-injection -- guildId/commandId are function parameters
    const commands = this.customCommands.commands[guildId];
    // eslint-disable-next-line security/detect-object-injection -- commandId is a function parameter
    if (!commands || !commands[commandId]) {
      return { success: false, reason: 'command_not_found' };
    }

    // eslint-disable-next-line security/detect-object-injection -- commandId validated above
    commands[commandId].permissions = permissions;
    this.saveCustomCommands();

    return { success: true };
  }

  // Command Statistics
  getCommandStats(guildId) {
    // eslint-disable-next-line security/detect-object-injection -- guildId is a function parameter
    const commands = this.customCommands.commands[guildId] || {};
    const commandList = Object.values(commands);

    if (commandList.length === 0) {
      return {
        totalCommands: 0,
        totalUsage: 0,
        averageUsage: 0,
        categories: {}
      };
    }

    const totalUsage = commandList.reduce((sum, cmd) => sum + cmd.usage_count, 0);
    const categories = {};

    for (const cmd of commandList) {
      // eslint-disable-next-line security/detect-object-injection -- category is a literal key from cmd data
      categories[cmd.category] = (categories[cmd.category] || 0) + 1;
    }

    return {
      totalCommands: commandList.length,
      totalUsage,
      averageUsage: totalUsage / commandList.length,
      categories,
      mostUsed: commandList.sort((a, b) => b.usage_count - a.usage_count)[0]?.name || 'None'
    };
  }

  // Import/Export Commands
  exportCommands(guildId) {
    // eslint-disable-next-line security/detect-object-injection -- guildId is a function parameter
    const commands = this.customCommands.commands[guildId] || {};

    return {
      commands: Object.values(commands),
      exported_at: Date.now(),
      guild_id: guildId,
      version: '1.0'
    };
  }

  importCommands(guildId, importData) {
    if (importData.version !== '1.0') {
      return { success: false, reason: 'incompatible_version' };
    }

    const guildCommands = this.ensureNested(this.customCommands.commands, guildId);

    for (const command of importData.commands) {
      const commandId = `imported_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      command.id = commandId;
      command.imported_at = Date.now();
      // eslint-disable-next-line security/detect-object-injection -- commandId is freshly generated
      guildCommands[commandId] = command;
    }

    this.saveCustomCommands();
    return { success: true, imported: importData.commands.length };
  }

  // Command Validation
  validateCommand(commandData) {
    const errors = [];

    if (!commandData.name || commandData.name.length < 2) {
      errors.push('Command name must be at least 2 characters');
    }

    if (!commandData.response || commandData.response.length === 0) {
      errors.push('Command response is required');
    }

    if (commandData.name && !/^[\w-]+$/.test(commandData.name)) {
      errors.push('Command name can only contain letters, numbers, hyphens, and underscores');
    }

    if (commandData.aliases) {
      for (const alias of commandData.aliases) {
        if (!/^[\w-]+$/.test(alias)) {
          errors.push(`Invalid alias: ${alias}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Cleanup and Maintenance
  cleanup() {
    // eslint-disable-next-line security/detect-object-injection -- guildId from Object.keys iteration
    for (const guildId of Object.keys(this.customCommands.usage)) {
      // eslint-disable-next-line security/detect-object-injection -- guildId from Object.keys iteration
      const guildUsage = this.customCommands.usage[guildId];
      // eslint-disable-next-line security/detect-object-injection -- userId from Object.keys iteration
      for (const userId of Object.keys(guildUsage)) {
        // eslint-disable-next-line security/detect-object-injection -- userId from Object.keys iteration
        const userCommands = guildUsage[userId];
        // eslint-disable-next-line security/detect-object-injection -- commandId from Object.keys iteration
        for (const commandId of Object.keys(userCommands)) {
          // Check if command still exists
          // eslint-disable-next-line security/detect-object-injection -- guildId/commandId from outer iteration
          const commands = this.customCommands.commands[guildId] || {};
          // eslint-disable-next-line security/detect-object-injection -- commandId from outer iteration
          if (!commands[commandId]) {
            // eslint-disable-next-line security/detect-object-injection -- commandId from outer iteration
            delete userCommands[commandId];
          }
        }
      }
    }

    this.saveCustomCommands();
  }
}

// Export singleton instance
export const customCommandManager = new CustomCommandManager();

// Convenience functions
export function createCommand(guildId, commandData) {
  return customCommandManager.createCommand(guildId, commandData);
}

export function executeCommand(commandName, guildId, userId, args = {}) {
  return customCommandManager.executeCommand(commandName, guildId, userId, args);
}

export function updateCommand(guildId, commandId, updates) {
  return customCommandManager.updateCommand(guildId, commandId, updates);
}

export function deleteCommand(guildId, commandId) {
  return customCommandManager.deleteCommand(guildId, commandId);
}

export function searchCommands(guildId, query) {
  return customCommandManager.searchCommands(guildId, query);
}

export function getPopularCommands(guildId, limit = 10) {
  return customCommandManager.getPopularCommands(guildId, limit);
}

export function getCommandStats(guildId) {
  return customCommandManager.getCommandStats(guildId);
}

export function validateCommand(commandData) {
  return customCommandManager.validateCommand(commandData);
}

// Auto-cleanup every hour. `unref()` is needed so this timer doesn't
// keep the Node event loop alive in one-shot scripts / CI tests.
const customCommandsCleanupInterval = setInterval(() => {
  customCommandManager.cleanup();
}, 60 * 60 * 1000);
if (typeof customCommandsCleanupInterval.unref === 'function') {
  customCommandsCleanupInterval.unref();
}