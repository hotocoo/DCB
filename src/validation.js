// Comprehensive Input Validation System
class InputValidator {

  // String validation
  validateString(input, options = {}) {
    const {
      minLength = 0,
      maxLength = 1000,
      allowedChars = null,
      blockedWords = [],
      required = false
    } = options;

    if (required && (!input || input.trim() === '')) {
      return { valid: false, reason: 'This field is required' };
    }

    if (input && input.length < minLength) {
      return { valid: false, reason: `Must be at least ${minLength} characters` };
    }

    if (input && input.length > maxLength) {
      return { valid: false, reason: `Must be no more than ${maxLength} characters` };
    }

    if (input && allowedChars && !new RegExp(`^[${allowedChars}]+$`).test(input)) {
      return { valid: false, reason: `Contains invalid characters` };
    }

    if (input && blockedWords.length > 0) {
      const lowerInput = input.toLowerCase();
      for (const word of blockedWords) {
        if (lowerInput.includes(word.toLowerCase())) {
          return { valid: false, reason: 'Contains inappropriate content' };
        }
      }
    }

    return { valid: true };
  }

  // Number validation
  validateNumber(input, options = {}) {
    const {
      min = -Infinity,
      max = Infinity,
      integer = false,
      positive = false,
      required = false
    } = options;

    if (required && (input === null || input === undefined || input === '')) {
      return { valid: false, reason: 'This field is required' };
    }

    const num = Number(input);
    if (isNaN(num)) {
      return { valid: false, reason: 'Must be a valid number' };
    }

    if (integer && !Number.isInteger(num)) {
      return { valid: false, reason: 'Must be a whole number' };
    }

    if (positive && num <= 0) {
      return { valid: false, reason: 'Must be a positive number' };
    }

    if (num < min) {
      return { valid: false, reason: `Must be at least ${min}` };
    }

    if (num > max) {
      return { valid: false, reason: `Must be no more than ${max}` };
    }

    return { valid: true, value: num };
  }

  // Username validation
  validateUsername(username, options = {}) {
    const {
      minLength = 2,
      maxLength = 32,
      allowSpaces = false,
      allowSpecialChars = false
    } = options;

    let allowedChars = 'a-zA-Z0-9';
    if (allowSpaces) allowedChars += ' ';
    if (allowSpecialChars) allowedChars += '_-';

    return this.validateString(username, {
      minLength,
      maxLength,
      allowedChars,
      required: true
    });
  }

  // Item name validation
  validateItemName(itemName) {
    const validItems = [
      'rusty_sword', 'iron_sword', 'magic_staff', 'legendary_blade',
      'leather_armor', 'chain_mail', 'plate_armor', 'dragon_armor',
      'health_potion', 'mana_potion', 'revive_crystal',
      'iron_ore', 'magic_crystal', 'dragon_scale'
    ];

    if (!validItems.includes(itemName)) {
      return { valid: false, reason: 'Invalid item name' };
    }

    return { valid: true };
  }

  // Guild name validation
  validateGuildName(guildName) {
    return this.validateString(guildName, {
      minLength: 3,
      maxLength: 20,
      allowedChars: 'a-zA-Z0-9 ',
      required: true
    });
  }

  // Location validation
  validateLocation(locationName) {
    const validLocations = [
      'whispering_woods', 'crystal_caverns', 'volcano_summit',
      'forgotten_temple', 'shadow_realm', 'celestial_spire'
    ];

    if (!validLocations.includes(locationName)) {
      return { valid: false, reason: 'Invalid location' };
    }

    return { valid: true };
  }

  // RPG stat validation
  validateRPGStat(stat) {
    const validStats = ['hp', 'maxhp', 'atk', 'def', 'spd'];

    if (!validStats.includes(stat)) {
      return { valid: false, reason: 'Invalid stat. Use: hp, maxhp, atk, def, spd' };
    }

    return { valid: true };
  }

  // Character class validation
  validateCharacterClass(charClass) {
    const validClasses = ['warrior', 'mage', 'rogue', 'paladin'];

    if (!validClasses.includes(charClass)) {
      return { valid: false, reason: 'Invalid class. Use: warrior, mage, rogue, paladin' };
    }

    return { valid: true };
  }

  // Command-specific validation
  validateCommandInput(interaction) {
    const commandName = interaction.commandName;
    const options = {};

    // Extract all option values
    for (const option of interaction.options.data) {
      options[option.name] = interaction.options.get(option.name)?.value || null;
    }

    switch (commandName) {
      case 'rpg':
        return this.validateRPGCommand(options);
      case 'guild':
        return this.validateGuildCommand(options);
      case 'trade':
        return this.validateTradeCommand(options);
      case 'inventory':
        return this.validateInventoryCommand(options);
      case 'weather':
        return this.validateWeatherCommand(options);
      case 'poll':
        return this.validatePollCommand(options);
      default:
        return { valid: true };
    }
  }

  validateRPGCommand(options) {
    const subcommand = options.subcommand || options.sub;
    const subOptions = options;

    switch (subcommand) {
      case 'start':
        if (subOptions.name) {
          const nameValidation = this.validateUsername(subOptions.name);
          if (!nameValidation.valid) return nameValidation;
        }
        if (subOptions.class) {
          const classValidation = this.validateCharacterClass(subOptions.class);
          if (!classValidation.valid) return classValidation;
        }
        break;

      case 'levelup':
        if (subOptions.stat) {
          const statValidation = this.validateRPGStat(subOptions.stat);
          if (!statValidation.valid) return statValidation;
        }
        if (subOptions.amount) {
          const amountValidation = this.validateNumber(subOptions.amount, {
            min: 1, max: 100, integer: true, positive: true, required: true
          });
          if (!amountValidation.valid) return amountValidation;
        }
        break;

      case 'fight':
      case 'explore':
      case 'boss':
        // No additional validation needed for these
        break;

      default:
        return { valid: false, reason: 'Invalid RPG subcommand' };
    }

    return { valid: true };
  }

  validateGuildCommand(options) {
    const subcommand = options.subcommand || options.sub;

    switch (subcommand) {
      case 'create':
        if (options.name) {
          const nameValidation = this.validateGuildName(options.name);
          if (!nameValidation.valid) return nameValidation;
        }
        break;

      case 'join':
        if (options.name) {
          const nameValidation = this.validateGuildName(options.name);
          if (!nameValidation.valid) return nameValidation;
        }
        break;

      case 'party':
        if (options.action) {
          const validActions = ['create', 'join', 'leave'];
          if (!validActions.includes(options.action)) {
            return { valid: false, reason: 'Invalid party action. Use: create, join, leave' };
          }
        }
        if (options.action === 'join' && options.party_id) {
          if (!options.party_id.startsWith('party_')) {
            return { valid: false, reason: 'Invalid party ID format' };
          }
        }
        break;

      default:
        return { valid: false, reason: 'Invalid guild subcommand' };
    }

    return { valid: true };
  }

  validateTradeCommand(options) {
    const subcommand = options.subcommand || options.sub;

    switch (subcommand) {
      case 'offer':
        if (options.offer_gold) {
          const goldValidation = this.validateNumber(options.offer_gold, {
            min: 0, max: 100000, integer: true, required: false
          });
          if (!goldValidation.valid) return goldValidation;
        }
        if (options.request_gold) {
          const goldValidation = this.validateNumber(options.request_gold, {
            min: 0, max: 100000, integer: true, required: false
          });
          if (!goldValidation.valid) return goldValidation;
        }
        if (options.offer_items) {
          const items = options.offer_items.split(',').map(s => s.trim());
          for (const item of items) {
            if (item) {
              const itemValidation = this.validateItemName(item);
              if (!itemValidation.valid) return { valid: false, reason: `Invalid item: ${item}` };
            }
          }
        }
        break;

      case 'auction':
        if (options.action === 'create') {
          if (options.price) {
            const priceValidation = this.validateNumber(options.price, {
              min: 1, max: 10000, integer: true, positive: true, required: true
            });
            if (!priceValidation.valid) return priceValidation;
          }
        }
        if (options.action === 'bid') {
          if (options.price) {
            const priceValidation = this.validateNumber(options.price, {
              min: 1, max: 100000, integer: true, positive: true, required: true
            });
            if (!priceValidation.valid) return priceValidation;
          }
        }
        break;

      default:
        return { valid: false, reason: 'Invalid trade subcommand' };
    }

    return { valid: true };
  }

  validateInventoryCommand(options) {
    // Inventory commands generally don't need complex validation
    return { valid: true };
  }

  validateWeatherCommand(options) {
    if (options.location) {
      const locationValidation = this.validateString(options.location, {
        minLength: 2,
        maxLength: 50,
        required: true
      });
      if (!locationValidation.valid) return locationValidation;
    }

    return { valid: true };
  }

  validatePollCommand(options) {
    if (options.question) {
      const questionValidation = this.validateString(options.question, {
        minLength: 5,
        maxLength: 200,
        required: true
      });
      if (!questionValidation.valid) return questionValidation;
    }

    for (let i = 1; i <= 4; i++) {
      if (options[`option${i}`]) {
        const optionValidation = this.validateString(options[`option${i}`], {
          minLength: 1,
          maxLength: 50,
          required: i <= 2 // First two options are required
        });
        if (!optionValidation.valid) return optionValidation;
      }
    }

    if (options.duration) {
      const durationValidation = this.validateNumber(options.duration, {
        min: 1, max: 60, integer: true, positive: true, required: false
      });
      if (!durationValidation.valid) return durationValidation;
    }

    return { valid: true };
  }

  // Sanitize user input
  sanitizeInput(input) {
    if (typeof input !== 'string') return input;

    return input
      .trim()
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, '') // Remove event handlers
      .slice(0, 1000); // Limit length
  }

  // Validate Discord mentions and IDs
  validateUserId(userId) {
    const discordIdRegex = /^\d{17,19}$/;
    if (!discordIdRegex.test(userId)) {
      return { valid: false, reason: 'Invalid user ID format' };
    }
    return { valid: true };
  }

  validateChannelId(channelId) {
    const discordIdRegex = /^\d{17,19}$/;
    if (!discordIdRegex.test(channelId)) {
      return { valid: false, reason: 'Invalid channel ID format' };
    }
    return { valid: true };
  }

  validateRoleId(roleId) {
    const discordIdRegex = /^\d{17,19}$/;
    if (!discordIdRegex.test(roleId)) {
      return { valid: false, reason: 'Invalid role ID format' };
    }
    return { valid: true };
  }

  // Bulk validation for complex objects
  validateObject(obj, schema) {
    const errors = [];

    for (const [key, rules] of Object.entries(schema)) {
      const value = obj[key];

      if (rules.required && (value === null || value === undefined)) {
        errors.push(`${key} is required`);
        continue;
      }

      if (value !== null && value !== undefined) {
        if (rules.type === 'string') {
          const stringValidation = this.validateString(value, rules);
          if (!stringValidation.valid) errors.push(`${key}: ${stringValidation.reason}`);
        } else if (rules.type === 'number') {
          const numberValidation = this.validateNumber(value, rules);
          if (!numberValidation.valid) errors.push(`${key}: ${numberValidation.reason}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Export singleton instance
export const inputValidator = new InputValidator();

// Convenience functions
export function validateString(input, options = {}) {
  return inputValidator.validateString(input, options);
}

export function validateNumber(input, options = {}) {
  return inputValidator.validateNumber(input, options);
}

export function validateUsername(username, options = {}) {
  return inputValidator.validateUsername(username, options);
}

export function validateItemName(itemName) {
  return inputValidator.validateItemName(itemName);
}

export function validateGuildName(guildName) {
  return inputValidator.validateGuildName(guildName);
}

export function validateLocation(locationName) {
  return inputValidator.validateLocation(locationName);
}

export function validateRPGStat(stat) {
  return inputValidator.validateRPGStat(stat);
}

export function validateCharacterClass(charClass) {
  return inputValidator.validateCharacterClass(charClass);
}

export function validateCommandInput(interaction) {
  return inputValidator.validateCommandInput(interaction);
}

export function sanitizeInput(input) {
  return inputValidator.sanitizeInput(input);
}

export function validateUserId(userId) {
  return inputValidator.validateUserId(userId);
}

export function validateChannelId(channelId) {
  return inputValidator.validateChannelId(channelId);
}

export function validateRoleId(roleId) {
  return inputValidator.validateRoleId(roleId);
}

export function validateObject(obj, schema) {
  return inputValidator.validateObject(obj, schema);
}