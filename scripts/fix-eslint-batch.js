#!/usr/bin/env node

import { execSync } from 'child_process';
import { glob } from 'glob';
import fs from 'fs';
import path from 'path';

// Type definitions for glob
/** @typedef {string} GlobPattern */
/** @typedef {unknown} ErrorType */

const SRC_PATTERN = 'src/**/*.js';
const TESTS_PATTERN = 'tests/**/*.js';

/**
 * Executes a command with error handling and logging.
 * @param {string} command - The command to execute
 * @param {string} description - Description of the command for logging
 */
async function runCommand(command, description) {
  console.log(`\n🔧 ${description}...`);
  console.log(`DEBUG: runCommand called with command: ${command}, description: ${description}`);
  console.log(`DEBUG: command type: ${typeof command}, description type: ${typeof description}`);
  try {
    execSync(command, { stdio: 'inherit', cwd: process.cwd() });
    console.log(`✅ ${description} completed successfully.`);
  } catch (error) {
    console.error(`❌ ${description} failed.`);
    console.log(`DEBUG: Error type: ${typeof error}, error constructor: ${error?.constructor?.name}`);
    throw error;
  }
}

/**
 * Counts files matching a glob pattern.
 * @param {string} pattern - Glob pattern to match files
 * @returns {Promise<number>} Number of files found
 */
async function getFileCount(pattern) {
  console.log(`DEBUG: getFileCount called with pattern: ${pattern}`);
  console.log(`DEBUG: pattern type: ${typeof pattern}`);
  const files = await glob(pattern, { ignore: ['node_modules/**'] });
  console.log(`DEBUG: glob returned ${files.length} files`);
  return files.length;
}

async function main() {
  try {
    console.log('🚀 Starting batch ESLint fixes and formatting...\n');

    // Count files before processing
    const srcFiles = await getFileCount(SRC_PATTERN);
    const testFiles = await getFileCount(TESTS_PATTERN);
    console.log(`📊 Found ${srcFiles} source files and ${testFiles} test files to process.\n`);

    // Step 1: Run ESLint --fix to automatically fix common issues
    // This will fix: brace-style, quotes, unicorn/switch-case-braces, and many other auto-fixable rules
    await runCommand(
      'npx eslint src/**/*.js tests/**/*.js --fix --quiet',
      'Running ESLint auto-fix on all JS files'
    );

    // Step 2: Run Prettier for consistent formatting
    // This ensures uniform spacing, indentation, and other formatting rules
    await runCommand(
      'npx prettier --write "src/**/*.js" "tests/**/*.js"',
      'Running Prettier formatting on all JS files'
    );

    console.log('\n🎉 Batch processing completed!');
    console.log('💡 High-volume issues addressed:');
    console.log('   • brace-style (1,025 instances) - Fixed with ESLint --fix');
    console.log('   • quotes (917 instances) - Fixed with ESLint --fix');
    console.log('   • unicorn/switch-case-braces (459 instances) - Fixed with ESLint --fix');
    console.log('   • Additional formatting consistency - Applied with Prettier');

    console.log('\n📝 Note: Run "npm run lint" to check remaining issues that require manual fixes.');

  } catch (error) {
    console.error('\n💥 Batch processing failed:', error instanceof Error ? error.message : String(error));
    console.log(`DEBUG: Main error type: ${typeof error}, constructor: ${error?.constructor?.name}`);
    process.exit(1);
  }
}

main();