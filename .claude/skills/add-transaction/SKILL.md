---
name: add-transaction
description: Add a single transaction to a specific account. Use when the user wants to record a new expense or income manually — "add a $42 grocery transaction", "I just paid X for Y", "log a $1000 income from Z". Does NOT run reconciliation, so use this for manual entries, not bulk imports.
---

# Add a transaction

Adds a single transaction to a chosen account using `addTransactions` (no reconciliation, no rule replay — exactly what you specify is what gets stored).

## When to use

- "Add a $42 transaction at Whole Foods to my Chase Checking"
- "I just paid $1500 rent — record it"
- "Log $200 cash income to my Cash account"
- Any manual one-off entry

For bulk imports, use `/import-csv`. For bank-pulled transactions, use `/budget-sync --bank`.

## Workflow

Before calling, gather these from the user (ask if missing):

1. **Account** — which account did the money come from / land in?
2. **Date** — defaults to today if user doesn't specify.
3. **Amount** — in dollars. Negative for expense, positive for income.
4. **Payee** — optional but strongly recommended.
5. **Category** — optional; helpful for budget tracking.
6. **Notes** — optional.

Confirm the parsed values with the user before submitting if anything is ambiguous.

## Commands

```bash
node scripts/add-transaction.js \
  --account "Chase - Checking" \
  --date 2026-04-18 \
  --amount -42.50 \
  --payee "Whole Foods" \
  --category "Groceries, household items, clothing, fuel" \
  --notes "weekly run" \
  --cleared
```

Flags:

- `--account` — id or substring match on account name (required)
- `--date` — YYYY-MM-DD (required)
- `--amount` — dollars; negative for expense (required)
- `--payee` — payee name (creates if missing)
- `--payee-id` — exact payee id (alternative to `--payee`)
- `--category` — exact case-insensitive category name match
- `--notes` — free text
- `--imported-id` — if you want to dedupe against later bank imports
- `--cleared` — flag the transaction as cleared

## Notes

- If you omit `--category`, the transaction will be uncategorized; consider running `/categorize-transactions` afterward.
- Account name match is fuzzy (substring). If multiple accounts match, the first one wins — be specific to avoid ambiguity.
