---
name: categorize-transactions
description: Find uncategorized transactions and propose (or apply) category assignments based on past transactions for the same payee. Use when the user asks to "categorize my transactions", "clean up uncategorized", "what's pending categorization", or after a bank sync brings in new charges.
---

# Categorize uncategorized transactions

The script scans recent uncategorized transactions and, for each, looks at past categorized transactions for the same payee. If a single category covers ≥ 60% of historical occurrences for that payee, it proposes that category.

## When to use

- "Categorize my pending transactions"
- "Clean up uncategorized stuff"
- "What's still uncategorized?"
- After running `/budget-sync --bank`, run this to clean up imports.

## Commands

```bash
# Dry run — list candidates with suggestions, last 90 days
node scripts/categorize-pending.js

# Different window
node scripts/categorize-pending.js --days 30

# Higher confidence threshold (default 0.6)
node scripts/categorize-pending.js --threshold 0.8

# Actually apply suggestions
node scripts/categorize-pending.js --apply
```

## Workflow recommendation

1. Always run dry-run first, show the user the suggestions.
2. If the user is happy, re-run with `--apply`.
3. For payees with no history (or below threshold), surface them to the user and ask how to categorize. After the user answers for one or two, you can use `add-transaction` updates or the Actual web UI to create rules.

## Notes

- Transfers (transactions with `transfer_id`) are skipped — they should not have categories.
- Only categorized transactions in the lookback window are used to build the per-payee distribution.
- Suggestions show `(60% of 5)` meaning "60% of 5 historical hits for this payee". Lower sample sizes are riskier.

## Related

- `/search-transactions --uncategorized` to inspect uncategorized items more flexibly.
- `/budget-sync --bank` to pull new transactions before categorizing.
