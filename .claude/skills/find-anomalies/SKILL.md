---
name: find-anomalies
description: Detect unusual transactions in the recent window — large outliers vs historical category norms, new payees, possible duplicates. Use when the user asks "anything weird", "did I get double-charged", "any surprises", "unusual transactions", "fraud check", "new merchants I should look at".
---

# Find anomalies

Three detectors run together over recent transactions:

1. **Large outliers** — transactions larger than 1.5× the historical P95 spend for that category, with a $50 floor.
2. **New payees** — payees that show up in the recent window but had no history in the baseline lookback.
3. **Possible duplicates** — same account, same payee, same amount, within 3 days.

## When to use

- "Anything weird going on?"
- "Did I get double-charged?"
- "Any surprises this month?"
- "Quick fraud check"
- "What new merchants showed up?"

## Commands

```bash
# Recent 30 days vs 180-day baseline (default)
node scripts/find-anomalies.js

# Different recent window
node scripts/find-anomalies.js --days 60

# Different baseline length
node scripts/find-anomalies.js --history 365
```

## How to interpret

- **Outliers** are spending that's anomalously large for the category. Could be legit (annual insurance bill) or fraud — surface to user for review.
- **New payees** are things you've never seen before. Useful for spotting subscriptions you forgot about, or unauthorized charges.
- **Duplicates** are not necessarily wrong (sometimes you really did buy two of the same thing) but worth checking.

When summarizing: lead with anything urgent (potential fraud, large surprise charges). Skip categories where everything looks normal. Always offer to dig deeper with `/search-transactions`.

## Related

- `/search-transactions` to investigate a specific suspect transaction.
- `/categorize-transactions` if anomalies are uncategorized.
