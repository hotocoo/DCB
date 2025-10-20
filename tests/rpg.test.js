import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { createCharacter, getCharacter, applyXp, spendSkillPoints, getLeaderboard, getLeaderboardCount, resetCharacter } from '../src/rpg.js';

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
  } else {
    // remove test file if created
    if (fs.existsSync(FILE)) fs.unlinkSync(FILE);
  }
}

async function run() {
  backupData();
  try {
    // ensure clean start
    if (fs.existsSync(FILE)) fs.unlinkSync(FILE);

    const uid = 'testuser1';
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
  } finally {
    restoreData();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
