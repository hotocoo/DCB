import { createCharacter, getCharacter, saveCharacter, applyXp } from '../src/rpg.js';

function resetData() {
  // simple: remove data file if exists to start fresh
  try {
    const fs = require('fs');
    const path = require('path');
    const p = path.join(process.cwd(), 'data', 'rpg.json');
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (e) { /* ignore */ }
}

async function run() {
  const user = 'testuser1234';
  // remove existing char if any
  const existing = getCharacter(user);
  if (existing) console.log('Existing character:', existing);
  else {
    const c = createCharacter(user, 'Tester');
    console.log('Created:', c);
  }

  let char = getCharacter(user);
  console.log('Initial:', char);

  console.log('Applying 25 XP...');
  applyXp(user, char, 25);
  saveCharacter(user, char);
  char = getCharacter(user);
  console.log('After XP:', char);

  console.log('Spending 1 skill point on atk if available');
  if ((char.skillPoints || 0) >= 1) {
    char.atk += 1;
    char.skillPoints -= 1;
    saveCharacter(user, char);
  }
  console.log('Final:', getCharacter(user));
}

run().catch(e => console.error(e));
