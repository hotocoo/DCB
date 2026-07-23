// @ts-check
/**
 * Dump every loaded slash command's full option tree as JSON to stdout.
 *
 * Usage:
 *   node scripts/dump-commands.mjs > /tmp/cmds.json
 *
 * Output shape:
 *   {
 *     "admin.js": { "name": "admin", "description": "...", "options": [{ name, description, required, type }, ...] },
 *     ...
 *   }
 *
 * Subcommand options are flattened into a single string `name` (e.g. "warn user")
 * so the consumer can group by the first segment.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * @typedef {Object} DumpedOption
 * @property {string} name
 * @property {string} description
 * @property {boolean} required
 * @property {string} type
 */

/**
 * @typedef {Object} DumpedCommand
 * @property {string} name
 * @property {string} description
 * @property {DumpedOption[]} options
 * @property {string} [error]
 */

/** @type {Record<string, DumpedCommand>} */
const out = {};
const cmdDir = 'src/commands';

// Silence the bot's logger (it writes to stdout via console.log in src/logger.js).
// We only want our JSON dump on stdout.
console.log = () => {};
console.info = () => {};
console.warn = () => {};
console.error = () => {};
console.debug = () => {};

for (const file of fs.readdirSync(cmdDir)) {
  if (!file.endsWith('.js')) continue;
  try {
    // @ts-ignore — dynamic import of command modules
    const mod = await import(pathToFileURL(path.join(cmdDir, file)).href);
    const data = mod.data;
    if (!data || !data.name) continue;
    const opts = [];
    /**
     * @param {any} o
     * @param {string} prefix
     */
    function walk(o, prefix) {
      if (o.options) {
        for (const c of o.options) walk(c, prefix ? `${prefix} ${c.name}` : c.name);
      } else {
        opts.push({
          name: prefix,
          description: o.description || '',
          required: o.required || false,
          type: o.type?.toString() || '',
        });
      }
    }
    walk(data, '');
    out[file] = { name: data.name, description: data.description || '', options: opts };
  } catch (/** @type {any} */ e) {
    /** @type {DumpedCommand} */
    const errEntry = { name: '', description: '', options: [], error: e.message || String(e) };
    out[file] = errEntry;
  }
}

process.stdout.write(JSON.stringify(out, null, 2));
