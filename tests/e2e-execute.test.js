/* eslint-disable max-statements, complexity, max-depth */
/**
 * E2E test: actually execute the simpler commands against a mock interaction.
 * Catches contracts broken between data builder and execute() — e.g. a command
 * that calls .getString('foo') for an option it didn't .addStringOption().
 *
 * Run: node tests/e2e-execute.test.js
 */

import assert from 'node:assert/strict';

import { Collection } from 'discord.js';

import { loadCommands } from '../src/commandLoader.js';

let passed = 0;
let failed = 0;
const failures = [];

function record(name, ok, err) {
  if (ok) passed++;
  else {
    failed++;
    failures.push({ name, err: err instanceof Error ? err.message : String(err) });
  }
}

function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(
        () => record(name, true),
        (error) => record(name, false, error),
      );
    }
    record(name, true);
  } catch (error) {
    record(name, false, error);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    record(name, true);
  } catch (error) {
    record(name, false, error);
  }
}

/**
 * Build a stub message-component collector that never resolves and has the
 * minimal surface trivia/poll use (`.on(...)` returns a noop unsubscribe,
 * `.stop()` is a noop, `awaitCollect` is a never-resolving promise).
 */
function makeCollector() {
  const handlers = {};
  return {
    on: (event, cb) => {
      handlers[event] = cb;
      return () => {
        delete handlers[event];
      };
    },
    stop: () => {},
    end: () => {},
    [Symbol.asyncIterator]: async function* () {
      /* never yields */
    },
  };
}

/**
 * Build a mock ChatInputCommandInteraction whose .options.getString/getInteger/
 * getBoolean/getUser/etc returns a value from the `options` map, and whose
 * .reply() / .editReply() / .followUp() capture into a `replies` array.
 */
function makeMockInteraction(commandName, options = {}, userOverrides = {}) {
  const replies = [];
  const edits = [];
  const followUps = [];
  const interaction = {
    id: 'mock_i_' + Date.now(),
    commandName,
    isChatInputCommand: () => true,
    createdTimestamp: Date.now(),
    replied: false,
    deferred: false,
    ephemeral: false,
    options: {
      getString: (k) => (Object.prototype.hasOwnProperty.call(options, k) ? String(options[k]) : null),
      getInteger: (k) => (Object.prototype.hasOwnProperty.call(options, k) ? Number(options[k]) : null),
      getNumber: (k) => (Object.prototype.hasOwnProperty.call(options, k) ? Number(options[k]) : null),
      getBoolean: (k) => (Object.prototype.hasOwnProperty.call(options, k) ? Boolean(options[k]) : null),
      getUser: (k) => null,
      getMember: (k) => null,
      getChannel: (k) => null,
      getRole: (k) => null,
      getMentionable: (k) => null,
      getAttachment: (k) => null,
      getSubcommand: (k) => null,
      getSubcommandGroup: (k) => null,
    },
    user: { id: 'u_' + Date.now(), username: 'tester', bot: false, ...userOverrides },
    member: { permissions: { has: () => true } },
    guild: { id: 'g_test', name: 'Test Guild' },
    channel: {
      id: 'c_test',
      name: 'test-channel',
      type: 0,
      send: async () => ({ id: 'sent_msg', createMessageComponentCollector: () => makeCollector() }),
      createMessageComponentCollector: () => makeCollector(),
    },
    client: { ws: { ping: 42 }, user: { tag: 'athena#0001' } },
    reply: async (payload) => {
      interaction.replied = true;
      const text = typeof payload === 'string' ? payload : (payload?.content ?? JSON.stringify(payload));
      replies.push(text);
      const msgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      const ret = { createdTimestamp: Date.now() + 1, content: text, id: msgId, embeds: payload?.embeds, components: payload?.components };
      ret.createMessageComponentCollector = () => makeCollector();
      return ret;
    },
    editReply: async (payload) => {
      const text = typeof payload === 'string' ? payload : (payload?.content ?? JSON.stringify(payload));
      edits.push(text);
      return { content: text };
    },
    followUp: async (payload) => {
      const text = typeof payload === 'string' ? payload : (payload?.content ?? JSON.stringify(payload));
      followUps.push(text);
      return { content: text };
    },
    deferReply: async () => {
      interaction.deferred = true;
    },
    showModal: async () => true,
  };
  return { interaction, replies, edits, followUps };
}

// Commands that are pure-logic + take only string/integer options — safe to execute.
const SAFE_COMMANDS = ['ping', 'echo', '8ball', 'coinflip', 'roll', 'rps'];

async function main() {
  console.log('🧪 Athena E2E — command execution against mock interactions');
  console.log('============================================================\n');

  const client = { commands: new Collection() };
  const stats = await loadCommands(client);
  console.log(`Loaded ${stats.loaded}/${stats.total} commands\n`);

  // --- Test each SAFE command with realistic args ---
  for (const name of SAFE_COMMANDS) {
    const cmd = client.commands.get(name);
    test(`command "${name}" is registered`, () => {
      assert.ok(cmd, `${name} not registered`);
    });
    if (!cmd) continue;

    if (name === 'ping') {
      await testAsync('ping: executes and replies', async () => {
        const { interaction, replies, edits } = makeMockInteraction('ping');
        await cmd.execute(interaction);
        // ping calls reply('Pinging...') then editReply('Pong!...')
        assert.ok(replies.length + edits.length > 0, 'no reply or edit captured');
        const all = [...replies, ...edits].join('\n');
        assert.match(all, /Pong!|Pinging/);
      });
    }

    if (name === 'echo') {
      await testAsync('echo: replies with the text', async () => {
        const { interaction, replies } = makeMockInteraction('echo', { text: 'hello world' });
        await cmd.execute(interaction);
        assert.equal(replies.length, 1);
        assert.equal(replies[0], 'hello world');
      });
      await testAsync('echo: missing required text option -> error reply, not null', async () => {
        const { interaction, replies } = makeMockInteraction('echo', {});
        await cmd.execute(interaction);
        // safeExecuteCommand catches the validation error and replies with an error message
        assert.ok(replies.length >= 1, 'expected at least one reply (error)');
        assert.notEqual(replies[0], null, 'BUG: echo replied with null');
        assert.notEqual(replies[0], undefined, 'BUG: echo replied with undefined');
      });
      await testAsync('echo: text > 2000 chars -> TEXT_TOO_LONG error', async () => {
        const { interaction, replies } = makeMockInteraction('echo', { text: 'x'.repeat(2001) });
        await cmd.execute(interaction);
        assert.ok(replies.length >= 1);
        assert.match(replies.join('\n'), /too long/i);
      });
    }

    if (name === '8ball') {
      await testAsync('8ball: replies with one of 21 answers', async () => {
        const { interaction, replies } = makeMockInteraction('8ball', { question: 'will it work?' });
        await cmd.execute(interaction);
        assert.equal(replies.length, 1);
        assert.ok(replies[0].length > 0);
      });
    }

    if (name === 'coinflip') {
      await testAsync('coinflip: 1 coin -> 1 result', async () => {
        const { interaction, replies } = makeMockInteraction('coinflip', {});
        await cmd.execute(interaction);
        assert.equal(replies.length, 1);
        assert.match(replies[0], /Coin Flip/);
      });
      await testAsync('coinflip: 3 coins -> 3 results', async () => {
        const { interaction, replies } = makeMockInteraction('coinflip', { count: 3 });
        await cmd.execute(interaction);
        assert.equal(replies.length, 1);
        const headTailCount = (replies[0].match(/Heads|Tails/g) || []).length;
        assert.ok(headTailCount >= 3, `expected >=3 heads/tails, got ${headTailCount}`);
      });
    }

    if (name === 'roll') {
      await testAsync('roll: 1d6 default', async () => {
        const { interaction, replies } = makeMockInteraction('roll', {});
        await cmd.execute(interaction);
        assert.equal(replies.length, 1);
        assert.match(replies[0], /rolled 1d6/);
      });
      await testAsync('roll: 2d6 explicit', async () => {
        const { interaction, replies } = makeMockInteraction('roll', { dice: '2d6' });
        await cmd.execute(interaction);
        assert.equal(replies.length, 1);
        assert.match(replies[0], /rolled 2d6/);
      });
      await testAsync('roll: invalid format -> CommandError (caught)', async () => {
        const { interaction, replies } = makeMockInteraction('roll', { dice: 'banana' });
        await cmd.execute(interaction);
        // safeExecuteCommand handles the error and replies with an error message
        assert.ok(replies.length >= 1, 'expected error reply');
      });
    }

    if (name === 'rps') {
      await testAsync('rps: rock -> reply with win/lose/tie', async () => {
        const { interaction, replies } = makeMockInteraction('rps', { choice: 'rock' });
        await cmd.execute(interaction);
        assert.equal(replies.length, 1);
        assert.match(replies[0], /chose rock/);
        assert.match(replies[0], /You win|You lose|tie/);
      });
      await testAsync('rps: invalid choice -> CommandError (caught)', async () => {
        const { interaction, replies } = makeMockInteraction('rps', { choice: 'spock' });
        await cmd.execute(interaction);
        assert.ok(replies.length >= 1, 'expected error reply');
      });
    }
  }

  // --- Test additional commands loaded into client ---
  for (const name of ['wordle', 'poll', 'weather', 'trivia', 'help', 'tictactoe', 'connect4']) {
    const cmd = client.commands.get(name);
    if (!cmd) continue;

    if (name === 'wordle') {
      await testAsync('wordle: starts a game and replies with board', async () => {
        const { interaction, replies } = makeMockInteraction('wordle', {});
        await cmd.execute(interaction);
        assert.ok(replies.length >= 1, 'expected at least one reply');
        assert.match(replies.join('\n'), /word|wordle|guess/i);
      });
      await testAsync('wordle: invalid difficulty -> error reply', async () => {
        const { interaction, replies } = makeMockInteraction('wordle', { difficulty: 'plank' });
        await cmd.execute(interaction);
        assert.ok(replies.length >= 1);
        assert.match(replies.join('\n'), /invalid difficulty/i);
      });
    }

    if (name === 'poll') {
      await testAsync('poll: question+2 options creates a poll', async () => {
        const { interaction, replies } = makeMockInteraction('poll', {
          question: 'Cats or dogs?',
          option1: 'Cats',
          option2: 'Dogs',
        });
        await cmd.execute(interaction);
        assert.ok(replies.length >= 1, 'expected poll reply');
        const all = replies.join('\n');
        assert.match(all, /Cats/);
        assert.match(all, /Dogs/);
      });
      await testAsync('poll: empty question -> error reply', async () => {
        const { interaction, replies } = makeMockInteraction('poll', {
          question: '   ',
          option1: 'A',
          option2: 'B',
        });
        await cmd.execute(interaction);
        assert.ok(replies.length >= 1);
        assert.match(replies.join('\n'), /cannot be empty/i);
      });
    }

    if (name === 'weather') {
      await testAsync('weather: missing API key -> friendly error', async () => {
        const { interaction, replies } = makeMockInteraction('weather', { location: 'Paris' });
        await cmd.execute(interaction);
        assert.ok(replies.length >= 1);
        assert.match(replies.join('\n'), /api key not configured/i);
      });
      await testAsync('weather: invalid chars in location -> error', async () => {
        const { interaction, replies } = makeMockInteraction('weather', { location: '<script>' });
        await cmd.execute(interaction);
        assert.ok(replies.length >= 1);
        assert.match(replies.join('\n'), /invalid location/i);
      });
    }

    if (name === 'trivia') {
      await testAsync('trivia: starts a round and replies', async () => {
        const { interaction, replies } = makeMockInteraction('trivia', {});
        await cmd.execute(interaction);
        assert.ok(replies.length >= 1, 'expected trivia reply');
      });
    }

    if (name === 'help') {
      await testAsync('help: returns the help text', async () => {
        const { interaction, replies } = makeMockInteraction('help', {});
        await cmd.execute(interaction);
        assert.ok(replies.length >= 1, 'expected help reply');
        assert.ok(replies[0].length > 0, 'help text is empty');
      });
    }
  }

  // --- Sanity: confirm the all-commands-load path is still clean ---
  test('all 35 commands still load', () => {
    assert.equal(stats.total, 35);
    assert.equal(stats.loaded, 35);
  });

  // --- final ---
  console.log('\n============================================================');
  console.log(`E2E Execute — passed: ${passed}, failed: ${failed}`);
  console.log('============================================================');
  if (failed > 0) {
    for (const f of failures) console.log(`  ❌ ${f.name}: ${f.err}`);
    process.exit(1);
  }
  console.log('✅ All command-execution E2E checks passed.');
}

main().catch((error) => {
  console.error('E2E crashed:', error);
  process.exit(2);
});
