import fs from 'fs';
import path from 'path';

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
      const data = JSON.parse(fs.readFileSync(CUSTOM_COMMANDS_FILE, 'utf8'));
      this.customCommands = data;
    } catch (error) {
      console.error('Failed to load custom commands:', error);
      this.customCommands = {
        commands: {},
        usage: {},
        templates: {}
      };
    }
  }

  saveCustomCommands() {
    try {
      fs.writeFileSync(CUSTOM_COMMANDS_FILE, JSON.stringify(this.customCommands, null, 2));
    } catch (error) {
      console.error('Failed to save custom commands:', error);
    }
  }

  // Custom Command Creation
  createCommand(guildId, commandData) {
    const commandId = `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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
      embed: commandData.embed || null
    };

    if (!this.customCommands.commands[guildId]) {
      this.customCommands.commands[guildId] = {};
    }

    this.customCommands.commands[guildId][commandId] = command;
    this.saveCustomCommands();

    return { success: true, command };
  }

  // Command Execution
  async executeCommand(commandName, guildId, userId, args = {}) {
    // Find command by name or alias
    const commands = this.customCommands.commands[guildId] || {};
    let command = null;
    let commandId = null;

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
      // In a real implementation, check user roles/permissions against Discord guild roles
      // For demo, assume permissions are role IDs or names, and check if user has them
      // This would require access to Discord.js client and guild member
      // Example: if (!member.roles.cache.has(permission)) return { success: false, reason: 'insufficient_permissions' };
      // For now, skip permission check to allow execution
      console.log(`Permission check for command ${commandName} by user ${userId}: Skipped (implement with Discord.js)`);
    }

    // Track usage
    command.usage_count++;
    if (!this.customCommands.usage[guildId]) {
      this.customCommands.usage[guildId] = {};
    }
    if (!this.customCommands.usage[guildId][userId]) {
      this.customCommands.usage[guildId][userId] = {};
    }
    this.customCommands.usage[guildId][userId][commandId] =
      (this.customCommands.usage[guildId][userId][commandId] || 0) + 1;

    this.saveCustomCommands();

    // Process response with variables
    let response = command.response;

    // Replace variables
    for (const [key, value] of Object.entries(command.variables)) {
      response = response.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value);
    }

    // Replace user variables
    response = response.replace(/\$\{user\}/g, `<@${userId}>`);
    response = response.replace(/\$\{username\}/g, args.username || 'User');
    response = response.replace(/\$\{guild\}/g, args.guildName || 'Server');

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
    response = response.replace(/\$\{random:([^}]+)\}/g, (match, options) => {
      const choices = options.split('|');
      return choices[Math.floor(Math.random() * choices.length)].trim();
    });

    response = response.replace(/\$\{date\}/g, new Date().toLocaleDateString());
    response = response.replace(/\$\{time\}/g, new Date().toLocaleTimeString());

    return response;
  }

  // Command Management
  updateCommand(guildId, commandId, updates) {
    const commands = this.customCommands.commands[guildId];
    if (!commands || !commands[commandId]) {
      return { success: false, reason: 'command_not_found' };
    }

    const command = commands[commandId];
    Object.assign(command, updates);
    command.updated_at = Date.now();

    this.saveCustomCommands();
    return { success: true, command };
  }

  deleteCommand(guildId, commandId) {
    const commands = this.customCommands.commands[guildId];
    if (!commands || !commands[commandId]) {
      return { success: false, reason: 'command_not_found' };
    }

    delete commands[commandId];
    this.saveCustomCommands();
    return { success: true };
  }

  // Command Templates
  createTemplate(templateData) {
    const templateId = `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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

    this.customCommands.templates[templateId] = template;
    this.saveCustomCommands();

    return { success: true, template };
  }

  // Command Discovery
  searchCommands(guildId, query) {
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
    const usage = this.customCommands.usage[guildId] || {};
    let totalUses = 0;
    const userBreakdown = {};

    for (const [userId, userCommands] of Object.entries(usage)) {
      const uses = userCommands[commandId] || 0;
      totalUses += uses;
      userBreakdown[userId] = uses;
    }

    return {
      totalUses,
      userBreakdown,
      averagePerUser: Object.keys(userBreakdown).length > 0 ? totalUses / Object.keys(userBreakdown).length : 0
    };
  }

  getPopularCommands(guildId, limit = 10) {
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
  createCommandChain(guildId, commands) {
    // Create a chain of commands that execute in sequence
    const chainId = `chain_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const chain = {
      id: chainId,
      name: commands.name,
      commands: commands.commandList,
      delay: commands.delay || 1000,
      created_by: commands.created_by,
      created_at: Date.now()
    };

    if (!this.customCommands.chains) {
      this.customCommands.chains = {};
    }
    if (!this.customCommands.chains[guildId]) {
      this.customCommands.chains[guildId] = {};
    }

    this.customCommands.chains[guildId][chainId] = chain;
    this.saveCustomCommands();

    return { success: true, chain };
  }

  // Command Permissions
  setCommandPermissions(guildId, commandId, permissions) {
    const commands = this.customCommands.commands[guildId];
    if (!commands || !commands[commandId]) {
      return { success: false, reason: 'command_not_found' };
    }

    commands[commandId].permissions = permissions;
    this.saveCustomCommands();

    return { success: true };
  }

  // Command Statistics
  getCommandStats(guildId) {
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

    commandList.forEach(cmd => {
      categories[cmd.category] = (categories[cmd.category] || 0) + 1;
    });

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

    if (!this.customCommands.commands[guildId]) {
      this.customCommands.commands[guildId] = {};
    }

    for (const command of importData.commands) {
      const commandId = `imported_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      command.id = commandId;
      command.imported_at = Date.now();
      this.customCommands.commands[guildId][commandId] = command;
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

    if (commandData.name && !/^[a-zA-Z0-9_-]+$/.test(commandData.name)) {
      errors.push('Command name can only contain letters, numbers, hyphens, and underscores');
    }

    if (commandData.aliases) {
      for (const alias of commandData.aliases) {
        if (!/^[a-zA-Z0-9_-]+$/.test(alias)) {
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
    // Remove old usage data
    const cutoffTime = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days

    for (const guildId in this.customCommands.usage) {
      for (const userId in this.customCommands.usage[guildId]) {
        for (const commandId in this.customCommands.usage[guildId][userId]) {
          // Check if command still exists
          const commands = this.customCommands.commands[guildId] || {};
          if (!commands[commandId]) {
            delete this.customCommands.usage[guildId][userId][commandId];
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

// Auto-cleanup every hour
setInterval(() => {
  customCommandManager.cleanup();
}, 60 * 60 * 1000);