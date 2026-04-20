# Actual Budget agent — project context for Claude

This project gives Claude programmatic access to a personal **Actual Budget** server via the official `@actual-app/api` Node SDK. The user wants to use Claude to inspect, analyze, and (carefully) mutate their budget data.

## What's here

- `scripts/lib/actual.js` — connection helper. All scripts call `withBudget(async api => …)` which `init`s, `downloadBudget`s, `sync`s, and `shutdown`s automatically. Reads creds from `.env`.
- `scripts/*.js` — one script per capability. Each script is also exposed as an npm script.
- `.claude/skills/<name>/SKILL.md` — project-local skills. **Use these first** — they describe when to invoke each script and how to interpret output.
- `.actual-data/` — local cache of the downloaded budget file (gitignored).
- `.env` — server URL, password, budget name (gitignored).
- `.npmrc` — pins to public npm registry to bypass user-level Uber-internal config.
- `docs/using-the-api.md`, `docs/api-reference.md` — official @actual-app/api docs (cleaned up markdown).

## Run any script with

```bash
node scripts/<name>.js [args]
# or
npm run <name> -- [args]
```

If you ever need verbose internal logging from the Actual SDK during sync/download, set `ACTUAL_VERBOSE=1`.

## Skills available

`/budget-help` lists every capability. Quick map:

- Status & analysis: `/budget-status`, `/budget-insights`, `/monthly-report`, `/net-worth`, `/find-anomalies`
- Discovery / search: `/search-transactions`, `/list-accounts`
- Mutating: `/add-transaction`, `/import-csv`, `/set-budget`, `/categorize-transactions`
- Sync: `/budget-sync` (server-only by default; `--bank` to pull from connected banks)

## Conventions

- **Amounts**: the API stores integer cents (`$12.30 → 1230`). The helper exposes `fmtAmount()` that handles formatting; use `api.utils.amountToInteger()` / `api.utils.integerToAmount()` to convert.
- **Sign convention**: expense transactions are negative, income positive. Transfers are excluded from spend math.
- **Months**: `YYYY-MM`. Helper exports `currentMonth()`, `previousMonth()`, `monthRange()`.
- **Dates**: `YYYY-MM-DD`.

## When to ask before acting

Always confirm with the user before:

- Running `/categorize-transactions --apply` (writes to many transactions at once).
- `/import-csv` against a non-trivial file (always dry-run first when format is new).
- `/set-budget` for past months (likely not what they want).
- `/add-transaction` for any amount that seems unusual or under-specified.

Read-only skills (status, insights, report, net-worth, search, anomalies, list-accounts, sync without `--bank`) are safe to run on demand.

## Don't

- Don't create new wrapper scripts for one-off questions — extend `withBudget()` calls inline if needed, or grep the helpers in `scripts/lib/actual.js`.
- Don't commit `.env`, `.actual-data/`, or any budget data — it's gitignored.
- Don't share account balances, transaction details, or other personal data outside this conversation.
- Don't push transactions to the server without the user's explicit go-ahead — most "this looks like a fix" feedback should be a question, not a `--apply`.
