# Coverage Verification Tool

> 🌐 Language / Ngôn ngữ: **English** | [Tiếng Việt](README.vi.md)

This directory contains a script to verify code coverage across commit history.

## Files

- `verify-commit-coverage.sh` — iterates each commit in a range, checks coverage, produces report
- `coverage-report.md` — generated markdown report (gitignored)
- `results/` — per-commit raw logs (gitignored)

## Usage

From the project root:

```bash
bash manual-test-coverage/verify-commit-coverage.sh
```

Optionally specify a commit range:

```bash
bash manual-test-coverage/verify-commit-coverage.sh <base-sha> <head-sha>
```

Each commit is checked out, `yarn test:coverage` is run, coverage percentages are captured, and a markdown report is written to `coverage-report.md`.

## Requirements

- `yarn` and `vitest` with `--coverage` configured
- (Optional) `mise` — if available, the script will use it to restore the Node.js runtime environment for each commit
