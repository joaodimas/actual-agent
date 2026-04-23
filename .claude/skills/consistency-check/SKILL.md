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

## Balance mismatch investigation (agent instructions)

The script auto-investigates cleared vs bank discrepancies and prints hints. After running, read every `✗` line and its `↳` hints carefully. Do not stop until every issue is either explained as self-resolving or has a concrete fix applied.

**Triage logic:**

1. **"Total balance (incl. pending) matches bank — will self-resolve"** → no action needed; the uncleared transaction is already posted at the bank and will be cleared on the next sync.

2. **"Pending transaction matches diff exactly"** → same as above; self-resolving.

3. **Residual diff after accounting for pending + manual opening balance shown** → likely an incorrect opening balance. Fix: adjust the manual transaction by the exact diff amount. Confirm with the user before applying.

4. **No manual transaction shown but diff persists** → investigate via verbose sync (`ACTUAL_VERBOSE=1 node scripts/sync.js --bank "Account Name" 2>&1`) and look at `added`/`updated` vs `ignored` entries and the `startingBalance` field. Compare SimpleFIN transaction amounts vs what Actual has stored for those import IDs.

5. **After fixing opening balances**, re-run `--bank` to confirm all accounts pass.

## Balance comparison logic

The script compares **cleared-only** Actual balance vs the bank balance (SimpleFIN reports posted/cleared transactions only). Uncleared (pending) transactions in Actual are excluded from the comparison and shown as informational notes. A mismatch on cleared balance with no pending explanation = a real problem requiring investigation.

