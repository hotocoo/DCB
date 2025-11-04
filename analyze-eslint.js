const fs = require('fs');
const path = require('path');

// Read the ESLint JSON report
const reportPath = path.join(__dirname, 'eslint-report.json');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

// Categorize issues by file and type
const issuesByFile = {};
const issuesByType = {};
const issuesBySeverity = { error: 0, warning: 0 };

report.forEach(result => {
  const filePath = result.filePath;
  issuesByFile[filePath] = result.messages.map(msg => ({
    rule: msg.ruleId,
    severity: msg.severity === 2 ? 'error' : 'warning',
    message: msg.message,
    line: msg.line,
    column: msg.column,
    source: msg.source || null
  }));

  result.messages.forEach(msg => {
    const severity = msg.severity === 2 ? 'error' : 'warning';
    const rule = msg.ruleId || 'unknown';

    issuesBySeverity[severity]++;

    if (!issuesByType[rule]) {
      issuesByType[rule] = { error: 0, warning: 0, files: new Set() };
    }
    issuesByType[rule][severity]++;
    issuesByType[rule].files.add(filePath);
  });
});

// Convert files Set to array for JSON serialization
Object.keys(issuesByType).forEach(rule => {
  issuesByType[rule].files = Array.from(issuesByType[rule].files);
});

// Generate prioritized list (critical errors first)
const criticalErrors = [];
const otherErrors = [];
const warnings = [];

Object.entries(issuesByFile).forEach(([file, messages]) => {
  messages.forEach(msg => {
    const issue = {
      file: path.relative(__dirname, file),
      rule: msg.rule,
      severity: msg.severity,
      message: msg.message,
      line: msg.line,
      column: msg.column
    };

    if (msg.severity === 'error') {
      // Prioritize parse errors and critical issues
      if (msg.message.includes('Missing catch or finally clause') ||
          msg.message.includes('Parse errors') ||
          msg.rule === 'no-undef' ||
          msg.rule === 'import/no-unresolved') {
        criticalErrors.push(issue);
      } else {
        otherErrors.push(issue);
      }
    } else {
      warnings.push(issue);
    }
  });
});

// Sort by severity and frequency
const sortedIssues = [...criticalErrors, ...otherErrors, ...warnings];

// Generate batch-fixing patterns
const batchFixes = {};
Object.entries(issuesByType).forEach(([rule, data]) => {
  const total = data.error + data.warning;
  const files = data.files;

  if (total >= 3) { // Only suggest batch fixes for rules with 3+ occurrences
    batchFixes[rule] = {
      total,
      error: data.error,
      warning: data.warning,
      files: files.length,
      suggestion: getBatchFixSuggestion(rule, total, files)
    };
  }
});

function getBatchFixSuggestion(rule, total, files) {
  const suggestions = {
    'quotes': `Replace double quotes with single quotes - affects ${total} instances across ${files.length} files`,
    'brace-style': `Standardize brace style (opening brace on same line) - affects ${total} instances across ${files.length} files`,
    'max-len': `Break long lines to fit max-len rule - affects ${total} instances across ${files.length} files`,
    'no-unused-vars': `Remove or properly use unused variables - affects ${total} instances across ${files.length} files`,
    'unicorn/filename-case': `Rename files to camelCase or PascalCase - affects ${total} instances across ${files.length} files`,
    'import/order': `Reorder import statements - affects ${total} instances across ${files.length} files`,
    'unicorn/switch-case-braces': `Add braces to switch case clauses - affects ${total} instances across ${files.length} files`,
    'max-lines-per-function': `Break down large functions - affects ${total} instances across ${files.length} files`,
    'complexity': `Reduce function complexity - affects ${total} instances across ${files.length} files`,
    'sonarjs/cognitive-complexity': `Simplify complex functions - affects ${total} instances across ${files.length} files`,
    'unicorn/numeric-separators-style': `Fix numeric separator formatting - affects ${total} instances across ${files.length} files`,
    'unicorn/prefer-node-protocol': `Use node: protocol for built-in modules - affects ${total} instances across ${files.length} files`,
    'unicorn/no-null': `Replace null with undefined - affects ${total} instances across ${files.length} files`,
    'unicorn/no-process-exit': `Avoid process.exit() in non-CLI code - affects ${total} instances across ${files.length} files`,
    'promise/always-return': `Ensure promises return values - affects ${total} instances across ${files.length} files`
  };

  return suggestions[rule] || `Manual review needed for ${rule} - affects ${total} instances across ${files.length} files`;
}

// Generate summary
const summary = {
  totalIssues: criticalErrors.length + otherErrors.length + warnings.length,
  criticalErrors: criticalErrors.length,
  otherErrors: otherErrors.length,
  warnings: warnings.length,
  filesAffected: Object.keys(issuesByFile).length,
  uniqueRules: Object.keys(issuesByType).length,
  batchFixCandidates: Object.keys(batchFixes).length
};

// Output results
console.log('=== ESLINT ANALYSIS SUMMARY ===\n');
console.log(`Total Issues: ${summary.totalIssues}`);
console.log(`Critical Errors: ${summary.criticalErrors}`);
console.log(`Other Errors: ${summary.otherErrors}`);
console.log(`Warnings: ${summary.warnings}`);
console.log(`Files Affected: ${summary.filesAffected}`);
console.log(`Unique Rules Violated: ${summary.uniqueRules}`);
console.log(`Batch Fix Candidates: ${summary.batchFixCandidates}\n`);

console.log('=== TOP 10 MOST FREQUENT RULES ===\n');
const topRules = Object.entries(issuesByType)
  .sort(([,a], [,b]) => (b.error + b.warning) - (a.error + a.warning))
  .slice(0, 10);

topRules.forEach(([rule, data], index) => {
  const total = data.error + data.warning;
  console.log(`${index + 1}. ${rule}: ${total} instances (${data.error} errors, ${data.warning} warnings) in ${data.files.length} files`);
});

console.log('\n=== BATCH FIX SUGGESTIONS ===\n');
Object.entries(batchFixes)
  .sort(([,a], [,b]) => (b.error + b.warning) - (a.error + a.warning))
  .slice(0, 10)
  .forEach(([rule, data], index) => {
    console.log(`${index + 1}. ${rule}: ${data.suggestion}`);
  });

console.log('\n=== CRITICAL ERRORS (TOP 20) ===\n');
criticalErrors.slice(0, 20).forEach((issue, index) => {
  console.log(`${index + 1}. ${issue.file}:${issue.line}:${issue.column} - ${issue.message}`);
  console.log(`   Rule: ${issue.rule}\n`);
});

console.log('=== SYSTEMATIC FIX APPROACH ===\n');
console.log('PHASE 1: Critical Parse Errors (Immediate Priority)');
console.log('- Fix syntax errors preventing code execution');
console.log('- Resolve import/module resolution issues');
console.log('- Correct missing try/catch blocks\n');

console.log('PHASE 2: Code Quality & Consistency (Batch Fixes)');
console.log('- Standardize quotes, braces, and formatting');
console.log('- Fix import ordering and naming conventions');
console.log('- Remove unused variables and imports\n');

console.log('PHASE 3: Performance & Best Practices');
console.log('- Reduce function complexity');
console.log('- Optimize large functions and files');
console.log('- Address security and performance warnings\n');

console.log('PHASE 4: Code Maintenance');
console.log('- Update deprecated patterns');
console.log('- Improve error handling');
console.log('- Add missing documentation\n');

// Save detailed report
const detailedReport = {
  summary,
  issuesByFile,
  issuesByType,
  sortedIssues,
  batchFixes,
  criticalErrors,
  topRules
};

fs.writeFileSync('eslint-analysis.json', JSON.stringify(detailedReport, null, 2));
console.log('Detailed analysis saved to eslint-analysis.json');