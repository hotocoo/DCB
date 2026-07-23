#!/usr/bin/env node
// Bulk-fix process.exit() in .then()/.catch() callbacks across test files
// to return their value (resolves promise/always-return).
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const fs = require('node:fs');

const files = [
  'tests/test-button-interactions.js',
  'tests/test-fun-command.js',
  'tests/test-music-errors.js',
  'tests/test-music-playback.js',
];

let total = 0;
for (const f of files) {
  const p = '/Users/acotech/workspace/athena/' + f;
  let src = readFileSync(p, 'utf8');
  const orig = src;
  // Match: <indent>process.exit(...);
  src = src.replace(/^(\s+)process\.exit\(([^)]*)\);/gm, '$1return process.exit($2);');
  if (src !== orig) {
    writeFileSync(p, src);
    const diff = (src.match(/return process\.exit/g) || []).length - (orig.match(/return process\.exit/g) || []).length;
    console.log(f, ': +', diff, 'fixes');
    total += diff;
  }
}
console.log('total:', total);