// @ts-check
/**
 * Generate docs/COMMANDS.md from a JSON dump of every command's option tree.
 *
 * Usage:
 *   node scripts/dump-commands.mjs > /tmp/cmds.json
 *   node scripts/generate-commands-doc.mjs /tmp/cmds.json > docs/COMMANDS.md
 *
 * Pass the JSON dump as argv[2]. Defaults to /tmp/cmds.json.
 */
import fs from 'node:fs';

/** @type {Record<string, string>} */
const TYPES = {
  '1': 'subcommand', '2': 'subcommand_group',
  '3': 'string', '4': 'integer', '5': 'boolean',
  '6': 'user', '7': 'channel', '8': 'role',
  '9': 'mentionable', '10': 'number', '11': 'attachment',
};

/** @type {Record<string, string[]>} */
const CATEGORIES = {
  rpg: ['rpg', 'explore', 'trivia', 'tictactoe', 'connect4', 'hangman', 'memory', 'guess', 'coinflip', 'rps', '8ball', 'roll', 'minigame', 'fun', 'wordle'],
  utility: ['ping', 'echo', 'help', 'setmodel', 'togglechat', 'toggleplay', 'remind', 'poll', 'weather', 'music', 'profile', 'api'],
  chat: ['ai', 'chat'],
  admin: ['admin', 'guild', 'achievements', 'economy', 'inventory', 'trade', 'novel'],
};

const inputPath = process.argv[2] || '/tmp/cmds.json';
const raw = fs.readFileSync(inputPath, 'utf8');
/** @type {Record<string, { name: string, description: string, options: { name: string, description: string, required: boolean, type: string }[], error?: string }>} */
const cmds = JSON.parse(raw);

/** @type {Record<string, any>} */
const byName = {};
for (const v of Object.values(cmds)) {
  if (v.name) byName[v.name] = v;
}

/** @type {string[]} */
const lines = [];
/** @param {...string} l */
const push = (...l) => lines.push(...l);

push('# Athena Command Reference',
  '',
  '> **Auto-generated** from `src/commands/*.js` using the `SlashCommandBuilder` metadata.',
  '> If a command is added or removed, regenerate this file — see the snippet at the bottom.',
  '',
  `**Total commands: ${Object.keys(cmds).length}**`,
  '',
  '## Categories',
  '',
  'The `/help` command groups commands into these buckets:',
  '',
);

for (const [cat, names] of Object.entries(CATEGORIES)) {
  const actual = names.filter(n => n in byName);
  if (actual.length) {
    push(`- **${cat}** (${actual.length}): ${actual.map(n => `\`/${n}\``).join(', ')}`);
  }
}
push('');

push('---', '', '## Full Reference', '');

const sorted = Object.entries(cmds).sort((a, b) => (a[1].name || '').localeCompare(b[1].name || ''));
for (const [cmdFile, info] of sorted) {
  if (info.error) {
    push(`### \`/${info.name || '?'}\` (${cmdFile})`,
      `> ⚠️ **Load error:** ${info.error}`,
      '');
    continue;
  }
  push(`### \`/${info.name}\``,
    `_${info.description}_`,
    '',
    `<sub>src/commands/\`${cmdFile}\`</sub>`,
    '');
  if (!info.options.length) {
    push('No options.', '');
    continue;
  }
  const subs = {};
  const plain = [];
  for (const opt of info.options) {
    const parts = opt.name.split(' ');
    if (parts.length > 1) {
      const sub = parts[0];
      if (!subs[sub]) subs[sub] = [];
      subs[sub].push({ ...opt, name: parts.slice(1).join(' ') });
    } else {
      plain.push(opt);
    }
  }
  if (plain.length) {
    push('| Option | Type | Required | Description |',
      '|--------|------|----------|-------------|');
    for (const o of plain) {
      push(`| \`${o.name}\` | ${TYPES[o.type] || o.type} | ${o.required ? '✅' : '—'} | ${o.description} |`);
    }
    push('');
  }
  for (const [sub, opts] of Object.entries(subs).sort()) {
    push(`#### Subcommand: \`${info.name} ${sub}\``,
      '',
      '| Option | Type | Required | Description |',
      '|--------|------|----------|-------------|');
    for (const o of opts) {
      push(`| \`${o.name}\` | ${TYPES[o.type] || o.type} | ${o.required ? '✅' : '—'} | ${o.description} |`);
    }
    push('');
  }
}

push('---', '',
  '## Regenerating this file',
  '',
  'The full command inventory is built by walking `SlashCommandBuilder` metadata at runtime.',
  '',
  '```bash',
  'node scripts/dump-commands.mjs > /tmp/cmds.json',
  'node scripts/generate-commands-doc.mjs /tmp/cmds.json > docs/COMMANDS.md',
  '```',
  '',
  'The current snapshot was generated when this file was last updated. If the file is out of sync, run the snippet above.',
  '',
);

process.stdout.write(lines.join('\n'));
