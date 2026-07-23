#!/usr/bin/env node
// Fix brace-style: `} else if (...) {` -> `}\n  else if (...) {`
const { readFileSync, writeFileSync } = require('node:fs');
const path = '/Users/acotech/workspace/athena/src/interactionHandlers.js';
let src = readFileSync(path, 'utf8');
const before = src;
src = src.replace(/^(\s*)\} else if \((.*)\) \{/gm, '$1}\n$1else if ($2) {');
if (src !== before) {
  writeFileSync(path, src);
  const matches = src.match(/}\n +else if/g) || [];
  console.log('Fixed', matches.length, 'else-if chains');
} else {
  console.log('No changes');
}