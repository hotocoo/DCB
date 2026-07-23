/* eslint-disable unicorn/no-process-exit, promise/always-return, brace-style */
// This is a CLI test runner — process.exit() is the correct way to
// signal the test verdict to the parent shell. Disabling the
// no-process-exit rule here (it's designed for libraries, not scripts).
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

import { createCharacter, getCharacter, applyXp, spendSkillPoints, getLeaderboard, getLeaderboardCount, resetCharacter, deleteCharacter } from '../src/rpg.js';

// Use a temp data dir to avoid clobbering real data during tests
const DATA_DIR = path.join(process.cwd(), 'data');
const BACKUP = path.join(process.cwd(), 'data', 'rpg.json.bak');
const FILE = path.join(DATA_DIR, 'rpg.json');

function backupData() {
  if (fs.existsSync(FILE)) fs.copyFileSync(FILE, BACKUP);
}
function restoreData() {
  if (fs.existsSync(BACKUP)) {
    fs.copyFileSync(BACKUP, FILE);
    fs.unlinkSync(BACKUP);
  }
  else {
    // remove test file if created
    if (fs.existsSync(FILE)) fs.unlinkSync(FILE);
  }
}

async function run() {
  backupData();
  try {
    // Valid Discord snowflake (17-19 digits) — required by safeUserId() in src/rpg.js
    const uid = '123456789012345678';
    deleteCharacter(uid);
    const char = createCharacter(uid, 'Tester');
    assert.ok(char, 'Character created');
    assert.equal(char.name, 'Tester');

    // apply xp and confirm level changes
    const res = applyXp(uid, char, 45); // should gain 2 levels with 20xp per level
    assert.ok(res.gained >= 2, 'Gained expected levels');
    // save and retrieve
    const saved = getCharacter(uid);
    assert.ok(saved, 'Character saved and retrievable');

    // spend skill points
    const before = saved.skillPoints || 0;
    if (before > 0) {
      const s = spendSkillPoints(uid, 'atk', 1);
      assert.ok(s.success, 'Spend succeeded');
    }

    // leaderboard functions
    const total = getLeaderboardCount();
    assert.ok(total >= 1, 'Leaderboard count at least 1');
    const list = getLeaderboard(10, 0);
    assert.ok(Array.isArray(list), 'Leaderboard returns array');

    // reset character
    const def = resetCharacter(uid);
    assert.equal(def.xp, 0);
    assert.equal(def.lvl, 1);

    console.log('All tests passed');
  }
  finally {
    // Always clean up the per-user file and any pre-existing testuser_*
    // leftovers from previous runs. Without this, every `npm run
    // test:rpg` invocation leaves a new data/players/<snowflake>.json
    // file behind that gets committed to the repo.
    try {
      deleteCharacter('123456789012345678');
    }
    catch { /* ignore */ }
    const playersDir = path.join(process.cwd(), 'data', 'players');
    if (fs.existsSync(playersDir)) {
      for (const file of fs.readdirSync(playersDir)) {
        if (file === '123456789012345678.json' || file.startsWith('testuser_')) {
          try {
            fs.unlinkSync(path.join(playersDir, file));
          }
          catch { /* ignore */ }
        }
      }
    }
    restoreData();
  }
}

run().then(() => process.exit(0)).catch(error => {
  console.error(error); process.exit(1);
});
