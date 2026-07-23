#!/usr/bin/env node
// Remove redundant 'return;' statements at end of functions (sonarjs/no-redundant-jump).
const { readFileSync, writeFileSync } = require('node:fs');

const files = [
  'src/commands/connect4.js',
  'src/commands/fun.js',
  'src/interactionHandlers.js',
  'tests/test-button-interactions.js',
];

let total = 0;
for (const f of files) {
  const p = '/Users/acotech/workspace/athena/' + f;
  let src = readFileSync(p, 'utf8');
  const orig = src;
  // Match a line containing only "  return;" (or with any whitespace) that is
  // immediately followed by a line containing only "}" (end of function).
  // We use a simple regex that targets a return; line where the next non-blank
  // line is a closing brace.
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*return;\s*$/.test(lines[i])) {
      // Look ahead to find next non-blank line
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j < lines.length && lines[j].trim() === '}') {
        lines[i] = ''; // blank out the redundant return
        total++;
      }
    }
  }
  src = lines.join('\n');
  // Clean up multiple consecutive blank lines
  src = src.replace(/\n\n\n+/g, '\n\n');
  if (src !== orig) {
    writeFileSync(p, src);
    console.log(f, ': removed redundant returns');
  }
}
console.log('total:', total);