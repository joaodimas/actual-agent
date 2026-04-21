# Consistency check

Run a full data-quality audit across Actual and SimpleFIN.

## When to use

- "Is my budget data clean?"
- "Any issues with my accounts?"
- "Check for duplicates"
- "Do my balances match the bank?"
- "Any missing categories?"
- "Run a consistency check"

## Command

```bash
# Default: looks back 2 months
node scripts/consistency-check.js

# Look back further
node scripts/consistency-check.js --months 3
```

## What it checks

1. **Balance drift** — Actual account balance vs SimpleFIN live balance, with the date SimpleFIN last refreshed from the bank. Flags any difference over $1.
2. **Uncategorized transactions** — any transaction without a category that isn't a transfer, within the lookback window.
3. **Duplicates** — same date + amount appearing more than once in the same account.
4. **Unlinked transfers** — transactions whose payee is a known transfer payee but have no `transfer_id` set (i.e. two-sided transfer not properly connected).
5. **Stale uncleared** — transactions older than 14 days that are still uncleared (often indicates a pending import or a ghost transaction).

## Output symbols

- `✓` — check passed
- `⚠` — warning (minor issue or missing data)
- `✗` — problem found, likely needs action

## After finding issues

- **Uncategorized**: use `/categorize-transactions`
- **Duplicates**: investigate with `/search-transactions`, then delete via inline script
- **Unlinked transfers**: update `transfer_id` on both sides
- **Balance drift**: run `/budget-sync --bank` then re-check; if drift persists use `node scripts/simplefin.js --compare --account "Name"` to drill in
- **Stale uncleared**: review manually and clear or delete

## Related

- `node scripts/simplefin.js --compare` — deep per-account diff vs SimpleFIN
- `/budget-sync` — pull latest from banks before checking
