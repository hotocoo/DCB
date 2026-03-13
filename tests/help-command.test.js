import assert from 'node:assert';

import { SlashCommandBuilder } from 'discord.js';

import { buildHelpEmbed, getCommandCategory, getCommandOptions } from '../src/commands/help.js';

function createCommand(name, description, options = []) {
  const builder = new SlashCommandBuilder()
    .setName(name)
    .setDescription(description);

  for (const option of options) {
    builder.addStringOption(opt => opt
      .setName(option.name)
      .setDescription(option.description)
      .setRequired(Boolean(option.required)));
  }

  return builder;
}

function runTests() {
  const commandWithOptions = createCommand('ping', 'Check latency', [
    { name: 'verbose', description: 'Show extra diagnostics', required: false }
  ]);
  const basicCommand = createCommand('help', 'Show help');
  const chatCommand = createCommand('ai', 'Chat with AI');

  assert.strictEqual(getCommandCategory('ping'), 'utility');
  assert.ok(getCommandOptions(commandWithOptions).includes('`verbose`'));
  assert.strictEqual(getCommandOptions(basicCommand), 'No options');

  const detailedEmbed = buildHelpEmbed([commandWithOptions, basicCommand], 'all', 'ping');
  assert.strictEqual(detailedEmbed.data.title, '📘 /ping command');
  assert.ok(detailedEmbed.data.fields.some(field => field.name === 'Options' && field.value.includes('`verbose`')));

  const unknownEmbed = buildHelpEmbed([commandWithOptions], 'all', 'unknown');
  assert.strictEqual(unknownEmbed.data.title, '❓ Command not found');
  assert.ok(unknownEmbed.data.description.includes('/unknown'));

  const categoryEmbed = buildHelpEmbed([commandWithOptions, basicCommand], 'utility', null);
  assert.ok(categoryEmbed.data.description.includes('/ping'));

  const allEmbed = buildHelpEmbed([commandWithOptions, basicCommand, chatCommand], 'all', null);
  assert.ok(allEmbed.data.description.includes('**RPG System**'));
  assert.ok(allEmbed.data.description.includes('**Admin & Moderation**'));
  assert.ok(allEmbed.data.description.includes('**Games & Fun**'));
  assert.ok(allEmbed.data.description.includes('**Utilities**'));
  assert.ok(allEmbed.data.description.includes('**Chat & AI**'));
  assert.ok(allEmbed.data.description.includes('/ai'));
  const moreInfoField = allEmbed.data.fields.find(field => field.name === '📚 More Info');
  assert.ok(moreInfoField);
  assert.ok(moreInfoField.value.includes('/help category:chat'));

  console.log('help-command tests passed');
}

runTests();
