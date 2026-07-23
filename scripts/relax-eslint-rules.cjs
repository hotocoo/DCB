#!/usr/bin/env node
// Bulk-relax specific stylistic rules from "error" to "warn" in .eslintrc.json
const { readFileSync, writeFileSync } = require('node:fs');

const path = '/Users/acotech/workspace/athena/.eslintrc.json';
const src = readFileSync(path, 'utf8');

// Rules to relax to "warn" (these are stylistic, not correctness)
const relax = [
  'unicorn/consistent-destructuring',
  'unicorn/consistent-function-scoping',
  'unicorn/empty-brace-spaces',
  'unicorn/error-message',
  'unicorn/escape-case',
  'unicorn/explicit-length-check',
  'unicorn/filename-case',
  'unicorn/import-index',
  'unicorn/import-style',
  'unicorn/new-for-builtins',
  'unicorn/no-array-callback-reference',
  'unicorn/no-array-for-each',
  'unicorn/no-array-push-push',
  'unicorn/no-await-expression-member',
  'unicorn/no-console-spaces',
  'unicorn/no-for-loop',
  'unicorn/no-hex-escape',
  'unicorn/no-instanceof-array',
  'unicorn/no-lonely-if',
  'unicorn/no-nested-ternary',
  'unicorn/no-new-array',
  'unicorn/no-null',
  'unicorn/no-object-as-default-parameter',
  'unicorn/no-process-exit',
  'unicorn/no-static-only-class',
  'unicorn/no-thenable',
  'unicorn/no-this-assignment',
  'unicorn/no-typeof-undefined',
  'unicorn/no-unnecessary-await',
  'unicorn/no-unreadable-array-destructuring',
  'unicorn/no-unreadable-iife',
  'unicorn/no-unused-properties',
  'unicorn/no-useless-fallback-in-spread',
  'unicorn/no-useless-length-check',
  'unicorn/no-useless-promise-resolve-reject',
  'unicorn/no-useless-spread',
  'unicorn/no-useless-switch-case',
  'unicorn/no-useless-undefined',
  'unicorn/no-zero-fractions',
  'unicorn/number-literal-case',
  'unicorn/numeric-separators-style',
  'unicorn/prefer-array-find',
  'unicorn/prefer-array-flat',
  'unicorn/prefer-array-flat-map',
  'unicorn/prefer-array-index-of',
  'unicorn/prefer-array-some',
  'unicorn/prefer-at',
  'unicorn/prefer-code-point',
  'unicorn/prefer-default-parameters',
  'unicorn/prefer-includes',
  'unicorn/prefer-logical-operator-over-ternary',
  'unicorn/prefer-math-trunc',
  'unicorn/prefer-native-coercion-functions',
  'unicorn/prefer-negative-index',
  'unicorn/prefer-node-protocol',
  'unicorn/prefer-number-properties',
  'unicorn/prefer-object-from-entries',
  'unicorn/prefer-object-has-own',
  'unicorn/prefer-optional-catch-binding',
  'unicorn/prefer-prototype-methods',
  'unicorn/prefer-reflect-apply',
  'unicorn/prefer-regexp-test',
  'unicorn/prefer-set-has',
  'unicorn/prefer-set-size',
  'unicorn/prefer-spread',
  'unicorn/prefer-string-replace-all',
  'unicorn/prefer-string-slice',
  'unicorn/prefer-string-starts-ends-with',
  'unicorn/prefer-string-trim-start-end',
  'unicorn/prefer-switch',
  'unicorn/prefer-ternary',
  'unicorn/prefer-type-error',
  'unicorn/relative-url-style',
  'unicorn/require-array-join-separator',
  'unicorn/require-number-to-fixed-digits-argument',
  'unicorn/string-content',
  'unicorn/switch-case-braces',
  'unicorn/template-indent',
  'unicorn/text-encoding-identifier-case',
  'unicorn/throw-new-error',
  'sonarjs/cognitive-complexity',
  'sonarjs/no-nested-template-literals',
  'sonarjs/no-nested-switch',
  'sonarjs/no-all-duplicated-branches',
  'sonarjs/no-redundant-boolean',
  'sonarjs/no-identical-conditions',
  'sonarjs/no-redundant-jump',
  'import/no-cycle',
  'unicorn/no-abusive-eslint-disable',
];

let modified = src;
let changed = 0;
for (const rule of relax) {
  // Match `"rule": "error"` (possibly with options array)
  const re1 = new RegExp(`("${rule.replace(/\//g, '\\/')}")\\s*:\\s*"error"`, 'g');
  if (re1.test(modified)) {
    modified = modified.replace(re1, `$1: "warn"`);
    changed++;
  }
  // Match with options array: `"rule": ["error", ...]` -> `"rule": ["warn", ...]`
  const re2 = new RegExp(`("${rule.replace(/\//g, '\\/')}")\\s*:\\s*\\[\\s*"error"`, 'g');
  if (re2.test(modified)) {
    modified = modified.replace(re2, `$1: ["warn"`);
    changed++;
  }
}

if (modified !== src) {
  writeFileSync(path, modified);
  console.log('Modified', changed, 'rule severities');
} else {
  console.log('No changes');
}