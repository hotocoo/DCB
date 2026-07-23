/* eslint-disable max-statements, complexity, promise/always-return, max-statements-per-line, max-len */
/**
 * E2E test: real command loader + import contract + JSON serialization.
 * This is what comprehensive-tests.js was missing — verify all 35 commands
 * actually load via commandLoader.loadCommands() against a stub client.
 *
 * Run: node tests/e2e-commands.test.js
 */
import assert from 'node:assert/strict';

import { Collection } from 'discord.js';

import { loadCommands } from '../src/commandLoader.js';

let passed = 0;
let failed = 0;
const results = [];

function check(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(
        () => {
          passed++;
          results.push({ name, ok: true });
          return undefined;
        },
        (error) => {
          failed++;
          results.push({ name, ok: false, err: error.message });
          return undefined;
        },
      );
    }
    passed++;
    results.push({ name, ok: true });
    return undefined;
  } catch (error) {
    failed++;
    results.push({ name, ok: false, err: error.message });
    return undefined;
  }
}

async function main() {
  const stubClient = {
    commands: new Collection(),
    user: { tag: 'stub#0000' },
    guilds: { cache: new Map() },
  };

  const stats = await loadCommands(stubClient);

  check('commandLoader returns stats object', () => {
    assert.equal(typeof stats.total, 'number');
    assert.equal(typeof stats.loaded, 'number');
  });
  check('commandLoader found >=30 command files', () => {
    assert.ok(stats.total >= 30, `expected >=30, got ${stats.total}`);
  });
  check('commandLoader loaded == total (no failures)', () => {
    assert.equal(stats.loaded, stats.total, `loaded ${stats.loaded} of ${stats.total}`);
  });

  const cmds = Array.from(stubClient.commands.values());
  check('client.commands populated', () => {
    assert.ok(cmds.length >= 30);
  });

  const seenNames = new Set();
  let invalidJson = 0;
  let noDescription = 0;
  let noName = 0;
  for (const c of cmds) {
    if (!c.data) {
      invalidJson++;
      continue;
    }
    if (typeof c.execute !== 'function') {
      invalidJson++;
      continue;
    }
    if (!c.data.name) {
      noName++;
      continue;
    }
    if (seenNames.has(c.data.name)) {
      results.push({ name: `duplicate ${c.data.name}`, ok: false });
    }
    seenNames.add(c.data.name);
    if (!c.data.description) {
      noDescription++;
    }
    try {
      const json = c.data.toJSON();
      assert.equal(typeof json.name, 'string');
      assert.equal(typeof json.description, 'string');
    } catch (error) {
      invalidJson++;
      results.push({ name: `${c.data.name} toJSON failed: ${error.message}`, ok: false });
    }
  }

  check('no command missing data.name', () => assert.equal(noName, 0));
  check('no command missing data.description', () => {
    assert.equal(noDescription, 0, `${noDescription} cmds missing description`);
  });
  check('all commands serialize to JSON', () => assert.equal(invalidJson, 0));
  check('no duplicate command names', () => assert.equal(seenNames.size, cmds.length));

  const errorHandler = await import('../src/errorHandler.js');
  check('errorHandler exports expected symbols', () => {
    for (const k of ['CommandError', 'validateUser', 'validateGuild', 'validatePermissions', 'validateRange', 'createRateLimiter']) {
      assert.equal(typeof errorHandler[k], 'function', `missing ${k}`);
    }
  });

  const storage = await import('../src/storage.js');
  check('storage.initializeDatabase is callable', () => {
    assert.equal(typeof storage.initializeDatabase, 'function');
  });
  await storage.initializeDatabase();
  check('storage.initializeDatabase resolved without throwing', () => {
    assert.ok(true);
  });

  const sched = await import('../src/scheduler.js');
  check('schedulerManager.setClient is callable', () => {
    assert.equal(typeof sched.schedulerManager.setClient, 'function');
  });

  const cd = await import('../src/cooldowns.js');
  check('cooldowns: set + isOnCooldown', () => {
    const u = `e2e_${Date.now()}`;
    cd.setCooldown(u, 'test_action', 1000);
    const r = cd.isOnCooldown(u, 'test_action');
    assert.equal(r.onCooldown, true);
  });

  console.log('\n============================================================');
  console.log(`E2E Command Loader — passed: ${passed}, failed: ${failed}`);
  console.log('============================================================');
  for (const r of results.filter((x) => !x.ok)) {
    console.log(`  ❌ ${r.name}`);
  }
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('E2E crashed:', error);
  process.exit(2);
});
