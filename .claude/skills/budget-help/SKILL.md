---
name: budget-help
description: Overview of every budget-related skill in this project. Use when the user asks "what can you do", "what skills are available", "help", "what tools do you have", or you are unsure which skill to invoke.
---

# Budget agent — capabilities overview

This project gives Claude programmatic access to an Actual Budget server (configured in `.env`) via small Node scripts. Each capability is a project-local skill.

## Available skills

| Skill                       | What it does                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `/budget-status`            | Current month envelope: budgeted vs spent, overrun categories.                        |
| `/budget-sync`              | Sync local cache with server; optionally pull new transactions from connected banks. |
| `/budget-insights`          | Top categories, top payees, change vs previous month for a month or range.            |
| `/categorize-transactions`  | Find uncategorized transactions; propose & apply categories from payee history.       |
| `/search-transactions`      | Flexible search across all accounts (payee, notes, category, account, range, etc.).   |
| `/net-worth`                | Per-account balances, on-budget vs off-budget split, net worth total.                 |
| `/monthly-report`           | Comprehensive month summary (cash flow, overruns, top items, net worth).              |
| `/find-anomalies`           | Detect outliers, new payees, possible duplicates over a recent window.                |
| `/add-transaction`          | Manually add a single transaction.                                                    |
| `/import-csv`               | Bulk-import a CSV (with reconciliation and rule application).                         |
| `/set-budget`               | Set category amount, toggle carryover, hold money for next month.                     |
| `/list-accounts`            | List every account with name, type, on-budget, closed, balance, id.                   |

## When in doubt

- "How am I doing?" → `/budget-status` for envelope; `/monthly-report` for full picture.
- "Where's my money going?" → `/budget-insights`.
- "Anything weird?" → `/find-anomalies`.
- "Find a transaction" → `/search-transactions`.
- "Pull latest" → `/budget-sync` (optionally with `--bank`).
- "Clean up new transactions" → `/budget-sync --bank`, then `/categorize-transactions`.

## How the project is wired

- Connection helper: `scripts/lib/actual.js` — handles init, downloadBudget, sync, shutdown.
- All scripts call `withBudget(async api => …)` which auto-syncs on connect.
- Credentials live in `.env` (gitignored).
- Local budget cache: `.actual-data/` (gitignored).
- Set `ACTUAL_VERBOSE=1` to see internal Actual logging during sync/load.
