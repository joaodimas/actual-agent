# actual-agent

Local Node project that gives Claude programmatic access to a personal **Actual Budget** server via the official `@actual-app/api` SDK. Comes with a set of project-local Claude Code skills for everyday budget tasks.

## Setup

1. Copy your server URL, password, and budget name into `.env` (already populated for the current user).
2. Install deps:

   ```bash
   npm install
   ```

3. Verify connectivity:

   ```bash
   npm run list-budgets
   ```

   You should see your budget(s) and their sync IDs.

## Quick reference

| npm script               | What it does                                                          |
| ------------------------ | --------------------------------------------------------------------- |
| `npm run list-budgets`   | List all budgets on the server with their sync IDs                    |
| `npm run list-accounts`  | List accounts (name, type, on-budget, balance, id)                    |
| `npm run sync`           | Sync local cache with server (`-- --bank` to also pull from banks)    |
| `npm run status`         | Current month envelope: budgeted vs spent, overruns                   |
| `npm run insights`       | Top categories, top payees, change vs prev month                      |
| `npm run report`         | Comprehensive monthly report                                          |
| `npm run net-worth`      | Per-account balances + on/off-budget totals                           |
| `npm run anomalies`      | Outliers, new payees, possible duplicates                             |
| `npm run categorize`    | Propose (or apply) categories for uncategorized transactions          |
| `npm run search`         | Flexible transaction search                                            |
| `npm run add-tx`         | Add a single transaction                                               |
| `npm run import-csv`     | Bulk-import from a CSV                                                 |
| `npm run set-budget`     | Set category amount, toggle carryover, hold money                     |

Pass flags through with `--`:

```bash
npm run status -- 2026-03
npm run insights -- 2026-01 2026-03 --top 20
npm run search -- --payee "Whole Foods" --from 2026-01-01
```

Or call the script directly:

```bash
node scripts/budget-status.js 2026-03
```

Set `ACTUAL_VERBOSE=1` to see the SDK's internal sync/load logs.

## Claude Code skills

`.claude/skills/` defines project-local skills that wrap the scripts above with usage guidance. From within Claude Code:

- `/budget-help` — overview of every capability
- `/budget-status`, `/budget-insights`, `/monthly-report`, `/net-worth`
- `/budget-sync`, `/categorize-transactions`, `/find-anomalies`
- `/search-transactions`, `/list-accounts`
- `/add-transaction`, `/import-csv`, `/set-budget`

## Project layout

```
.
├── .claude/skills/<name>/SKILL.md    # project-local Claude skills
├── .env                              # credentials (gitignored)
├── .gitignore
├── .npmrc                            # pins to public npm registry
├── CLAUDE.md                         # context for Claude when in this repo
├── docs/
│   ├── api-reference.md              # @actual-app/api method reference
│   └── using-the-api.md              # quickstart docs
├── package.json
└── scripts/
    ├── lib/actual.js                 # connection helper (init/download/sync/shutdown)
    ├── list-budgets.js
    ├── list-accounts.js
    ├── connect.js                    # smoke-test
    ├── sync.js
    ├── budget-status.js
    ├── budget-set.js
    ├── insights.js
    ├── monthly-report.js
    ├── net-worth.js
    ├── find-anomalies.js
    ├── categorize-pending.js
    ├── search-transactions.js
    ├── add-transaction.js
    └── import-csv.js
```

## Notes

- All amounts in the API are integer cents (`$12.30 → 1230`). The helper formats for display.
- Negative amounts = expenses, positive = income. Transfers are excluded from spend math.
- The connection helper auto-syncs with the server on every connect, so all read-only scripts return fresh data without an explicit sync.
