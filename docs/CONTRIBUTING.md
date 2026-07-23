# Contributing to Athena

Thanks for the interest in contributing. This document covers the workflow, conventions, and review checklist. The short version is at the bottom.

## Quick Start

1. Fork the repo.
2. Create a feature branch: `git checkout -b feature/your-feature-name`.
3. Make your changes, run `npm run lint && npm test`.
4. Open a pull request with a clear description.

For bug fixes: `git checkout -b fix/short-description`.
For docs: `git checkout -b docs/short-description`.

## What to Contribute

- **Bug fixes** — see [open issues](https://github.com/hotocoo/DCB/issues?q=is%3Aopen+is%3Aissue+label%3Abug).
- **New commands** — see the "Adding a new slash command" recipe in [DEVELOPMENT.md](./DEVELOPMENT.md).
- **New feature modules** — open an issue first to discuss the design.
- **Documentation** — typos, command-table updates, missing examples.
- **Tests** — the 38-case suite is small; adding coverage for the modules listed in [TESTING.md](./TESTING.md#what-is-not-covered) is always welcome.

## What to Avoid

- **Refactors without a use case.** The codebase has many stylistic quirks (stroustrup braces, single quotes, etc.) that are enforced by the existing rules. Don't mass-edit unrelated lines.
- **New dependencies.** Each dependency is a supply-chain liability. If you need one, justify it in the PR.
- **Touching the rebrand.** The project name is `Athena`; the GitHub repo is `DCB`. Don't rename either without discussion.
- **Schema changes.** SQLite is planned but not active. Don't add SQL queries until the storage layer is migrated.

## Code Review Checklist

Before requesting review, the author should have done all of this:

- [ ] Code follows the project's [DEVELOPMENT.md → Project Conventions](./DEVELOPMENT.md#project-conventions).
- [ ] `npm run lint` passes (0 errors).
- [ ] `npm test` passes (38/38).
- [ ] If a new command was added, `docs/COMMANDS.md` is updated (or regenerated via `scripts/dump-commands.mjs` + `scripts/generate-commands-doc.mjs`).
- [ ] If a new `process.env.*` was added, `.env.template` is updated.
- [ ] No leftover `console.log`, `process.exit()`, or `null` literals in `src/`.
- [ ] No new top-level dependencies unless justified.
- [ ] Commit messages are descriptive (the project uses a flat history — squash if you have fixup commits).

## Reviewer Checklist

When reviewing a PR, check:

- [ ] **Correctness** — does the code do what the PR claims?
- [ ] **Tests** — does the change add or update a test? If not, why not?
- [ ] **Security** — does the change introduce a path-traversal, injection, or denial-of-service risk?
- [ ] **Persistence** — does the change write to a JSON file? Is the write atomic? Is the data shape backwards-compatible?
- [ ] **Error handling** — does the change use `safeExecuteCommand` / `safeReply` / `safeUpdate`? Are errors propagated with context?
- [ ] **Performance** — does the change hit a rate limiter, a network endpoint, or a file write in a loop?
- [ ] **Backward compat** — does the change break existing commands, slash-command registrations, or stored data?
- [ ] **Docs** — are feature modules, command tables, and env vars updated?

## Style Guide (The Short Version)

- JavaScript ES2022+ (ESM). No TypeScript.
- 2-space indent, stroustrup braces, single quotes, semicolons always.
- Trailing commas on multi-line.
- `node:` prefix for core imports.
- Alphabetised imports within groups, blank line between `node:*` and relative.
- JSDoc on every exported function.
- Look at `src/commands/ping.js` for the canonical simple command.

## Issue Reporting

- Use [GitHub Issues](https://github.com/hotocoo/DCB/issues).
- Include: reproduction steps, expected vs actual, environment (Node version, OS, deployment type).
- For music issues: include the URL and which providers you configured.
- For AI issues: include the model name and the truncated request/response.
- For data-loss issues: include the contents of `data/<domain>.json` (redact any PII).

## Code of Conduct

Be kind. Assume good faith. Disagree on the technical merits, not the person. Repeated bad behaviour gets you blocked; once, in private, with a clear note.

## License

By contributing, you agree that your contributions will be licensed under the MIT License — see [LICENSE](../LICENSE).
