---
name: consistency-check
description: Run a full data-reliability audit on the budget — balance mismatches vs SimpleFIN, uncategorized transactions, duplicate transactions, stale uncleared entries, and split-transaction integrity. Use when the user asks "is my data clean", "consistency check", "data quality check", "anything off with my budget", or before trusting numbers in a report.
---

# Budget Consistency Check

Five automated checks that surface anything making budget numbers unreliable:

1. **Account balances** — compares Actual's computed balance against the SimpleFIN-reported balance (requires `--bank`)
2. **Uncategorized transactions** — lists all non-transfer transactions with no category assigned
3. **Duplicate transactions** — flags definitive duplicates (same `imported_id`) and probable duplicates (same date + amount + payee)
4. **Stale uncleared transactions** — finds uncleared, non-transfer transactions older than 30 days
5. **Split transaction integrity** — verifies each split parent's subtotals sum to the parent amount

## When to use

- "Run a consistency check"
- "Is my budget data clean?"
- "Check for duplicates / uncategorized / missing data"
- Before producing a monthly report or sharing numbers
- After a bank import, to make sure nothing landed twice or uncategorized

## Commands

```bash
# Check everything without hitting the bank (fast)
node scripts/consistency-check.js

# Full check: sync SimpleFIN first, then compare balances
node scripts/consistency-check.js --bank

# Narrow to a specific account
node scripts/consistency-check.js --bank "Chase"

# Change the look-back window (default 90 days)
node scripts/consistency-check.js --since 2026-01-01

# npm shortcut
npm run consistency-check
npm run consistency-check -- --bank
```

## Output

Each section prints `✓` (clean), `⚠` (warning), or `✗` (definitive issue), followed by a summary with a total issue count.

## Notes

- Balance comparison only works with `--bank` — without it, there's nothing to compare against.
- Accounts without a SimpleFIN/GoCardless connection will show "no bank connection" and are skipped for the balance check.
- `imported_id` duplicates are definitive (same bank transaction imported twice). Date+amount+payee duplicates are probable — some recurring charges on the same day are legitimate.
- The 30-day uncleared threshold catches forgotten manual entries and outstanding checks; adjust `--since` if your budget is newer.
