---
name: import-csv
description: Bulk-import transactions from a CSV file into a specific account, with reconciliation (deduplication) and rule application. Use when the user says "import this CSV", "load these transactions", "import bank statement", "upload transactions from file".
---

# Import a CSV of transactions

Uses `importTransactions` so the system applies rules and deduplicates against existing transactions (by `imported_id` or fuzzy date/amount/payee match). Use this for bank statement imports — for raw dumps without dedup, edit `scripts/import-csv.js` to use `addTransactions` instead.

## When to use

- "Import this CSV from Chase"
- "Load these transactions into my BofA account"
- "Import the file at ~/Downloads/march-statement.csv"

## Expected CSV format

Headers (case-insensitive):

| Column                                    | Required | Notes                                                |
| ----------------------------------------- | -------- | ---------------------------------------------------- |
| `date`                                    | yes      | YYYY-MM-DD or M/D/YYYY                               |
| `amount`                                  | yes      | Number; sign convention via `--convention`           |
| `payee`                                   | no       |                                                      |
| `notes` / `memo` / `description`          | no       | Any one of these is picked up as notes               |
| `category`                                | no       | Must match an existing category name (case-insens.)  |
| `imported_id` / `id`                      | no       | Strongly recommended for safe re-imports             |

## Sign convention

Banks differ:

- Chase, Apple Card, Discover etc. usually export with **expenses negative** — use the default (`--convention expense-negative`).
- Some institutions export **expenses as positive** (with a "type" column for direction) — use `--convention spend-positive`.

If unsure, dry-run first and check the signs.

## Commands

```bash
# Default convention (expenses negative)
node scripts/import-csv.js --account "Chase - Checking" path/to/file.csv

# Reverse-sign import
node scripts/import-csv.js --account "Chase" --convention spend-positive transactions.csv

# Dry run — show what would happen without writing
node scripts/import-csv.js --account "Chase" --dry-run transactions.csv
```

## Workflow

1. Always dry-run first when the file's source/format is new.
2. Verify the `added` and `updated` counts make sense.
3. After import, run `/categorize-transactions` to clean up any uncategorized rows.

## Notes

- `importTransactions` will replay the budget's import Rules. If you don't want that, use `add-transaction` instead (one-by-one, no rule application, no dedup).
- Deduplication: rows with `imported_id` matching an existing transaction are skipped automatically. Otherwise the system fuzzy-matches on date/amount/payee.
