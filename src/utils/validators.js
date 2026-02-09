/**
 * Input validation utilities
 * @fileoverview Validation functions for user inputs and data
 * @module utils/validators
 */

/**
 * Validates a string is not empty
 * @param {string} value - Value to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result {valid: boolean, error: string}
 */
export function validateString(value, options = {}) {
  const {
    minLength = 0,
    maxLength = Number.POSITIVE_INFINITY,
    allowEmpty = false,
    pattern = null,
    trim = true
  } = options;

  if (typeof value !== 'string') {
    return { valid: false, error: 'Value must be a string' };
  }

  const str = trim ? value.trim() : value;

  if (!allowEmpty && str.length === 0) {
    return { valid: false, error: 'Value cannot be empty' };
  }

  if (str.length < minLength) {
    return { valid: false, error: `Value must be at least ${minLength} characters` };
  }

  if (str.length > maxLength) {
    return { valid: false, error: `Value must be at most ${maxLength} characters` };
  }

  if (pattern && !pattern.test(str)) {
    return { valid: false, error: 'Value does not match required pattern' };
  }

  return { valid: true, value: str };
}

/**
 * Validates a number
 * @param {*} value - Value to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
export function validateNumber(value, options = {}) {
  const {
    min = Number.NEGATIVE_INFINITY,
    max = Number.POSITIVE_INFINITY,
    integer = false,
    positive = false
  } = options;

  const num = typeof value === 'string' ? Number(value) : value;

  if (typeof num !== 'number' || Number.isNaN(num)) {
    return { valid: false, error: 'Value must be a number' };
  }

  if (integer && !Number.isInteger(num)) {
    return { valid: false, error: 'Value must be an integer' };
  }

  if (positive && num <= 0) {
    return { valid: false, error: 'Value must be positive' };
  }

  if (num < min) {
    return { valid: false, error: `Value must be at least ${min}` };
  }

  if (num > max) {
    return { valid: false, error: `Value must be at most ${max}` };
  }

  return { valid: true, value: num };
}

/**
 * Validates a user ID
 * @param {string} userId - User ID to validate
 * @returns {Object} Validation result
 */
export function validateUserId(userId) {
  const result = validateString(userId, {
    minLength: 17,
    maxLength: 20,
    pattern: /^\d+$/
  });

  if (!result.valid) {
    return { valid: false, error: 'Invalid user ID format' };
  }

  return result;
}

/**
 * Validates a guild ID
 * @param {string} guildId - Guild ID to validate
 * @returns {Object} Validation result
 */
export function validateGuildId(guildId) {
  return validateUserId(guildId); // Same format as user IDs
}

/**
 * Validates a URL
 * @param {string} url - URL to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
export function validateURL(url, options = {}) {
  const { allowedProtocols = ['http:', 'https:'] } = options;

  try {
    const parsed = new URL(url);

    // Block dangerous protocols
    const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:'];
    if (dangerousProtocols.includes(parsed.protocol.toLowerCase())) {
      return {
        valid: false,
        error: 'Dangerous protocol detected'
      };
    }

    if (!allowedProtocols.includes(parsed.protocol)) {
      return {
        valid: false,
        error: `Protocol must be one of: ${allowedProtocols.join(', ')}`
      };
    }

    return { valid: true, value: url };
  }
  catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Validates a file path (prevents path traversal)
 * @param {string} filePath - File path to validate
 * @param {string} baseDir - Base directory to restrict to
 * @returns {Promise<Object>} Validation result
 */
export async function validateFilePath(filePath, baseDir) {
  const path = await import('node:path');

  // Normalize paths
  const normalized = path.normalize(filePath);
  const base = path.normalize(baseDir);

  // Check for path traversal
  if (!normalized.startsWith(base)) {
    return { valid: false, error: 'Path traversal detected' };
  }

  // Check for suspicious patterns
  if (/\.\.|[\0\n\r]/.test(filePath)) {
    return { valid: false, error: 'Invalid characters in path' };
  }

  return { valid: true, value: normalized };
}

/**
 * Validates an email address
 * @param {string} email - Email to validate
 * @returns {Object} Validation result
 */
export function validateEmail(email) {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return validateString(email, {
    maxLength: 254,
    pattern: emailPattern
  });
}

/**
 * Validates a JSON string
 * @param {string} jsonString - JSON string to validate
 * @returns {Object} Validation result with parsed value
 */
export function validateJSON(jsonString) {
  try {
    const parsed = JSON.parse(jsonString);
    return { valid: true, value: parsed };
  }
  catch {
    return { valid: false, error: 'Invalid JSON format' };
  }
}

/**
 * Sanitizes HTML/markdown to prevent XSS
 * @param {string} input - Input to sanitize
 * @returns {string} Sanitized input
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') {
    return '';
  }

  // Remove potential XSS patterns more thoroughly
  return input
    .replaceAll(/[<>]/g, '')
    .replaceAll(/javascript:/gi, '')
    .replaceAll(/data:/gi, '')
    .replaceAll(/vbscript:/gi, '')
    .replaceAll(/on\w+\s*=/gi, '') // Remove all event handlers with optional spaces
    .trim();
}

/**
 * Validates an array
 * @param {*} value - Value to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
export function validateArray(value, options = {}) {
  const {
    minLength = 0,
    maxLength = Number.POSITIVE_INFINITY,
    itemValidator = null
  } = options;

  if (!Array.isArray(value)) {
    return { valid: false, error: 'Value must be an array' };
  }

  if (value.length < minLength) {
    return { valid: false, error: `Array must have at least ${minLength} items` };
  }

  if (value.length > maxLength) {
    return { valid: false, error: `Array must have at most ${maxLength} items` };
  }

  if (itemValidator) {
    for (const [i, element] of value.entries()) {
      const result = itemValidator(element);
      if (!result.valid) {
        return { valid: false, error: `Item ${i}: ${result.error}` };
      }
    }
  }

  return { valid: true, value };
}

/**
 * Validates an object against a schema
 * @param {Object} obj - Object to validate
 * @param {Object} schema - Schema definition
 * @returns {Object} Validation result
 */
export function validateObject(obj, schema) {
  if (typeof obj !== 'object' || obj === null) {
    return { valid: false, error: 'Value must be an object' };
  }

  const errors = {};

  for (const [key, validator] of Object.entries(schema)) {
    const value = obj[key];
    const result = validator(value);

    if (!result.valid) {
      errors[key] = result.error;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, error: 'Validation failed', details: errors };
  }

  return { valid: true, value: obj };
}

export default {
  validateString,
  validateNumber,
  validateUserId,
  validateGuildId,
  validateURL,
  validateFilePath,
  validateEmail,
  validateJSON,
  sanitizeInput,
  validateArray,
  validateObject
};
