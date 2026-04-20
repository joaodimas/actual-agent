---
name: search-transactions
description: Search and filter transactions across all accounts by payee, notes, category, account, amount range, date range, cleared/uncleared, or uncategorized. Use when the user asks "find my Whole Foods transactions", "what did I spend at X", "show transactions over $100", "all uncleared transactions", or any flexible transaction lookup.
---

# Search transactions

Filter transactions across all accounts. Combine flags as needed.

## When to use

- "Find all my Whole Foods transactions"
- "How much have I spent at Amazon this year?"
- "Show transactions over $500 last quarter"
- "What's still uncleared on Chase?"
- "Find all uncategorized transactions in March"

## Commands

```bash
# By payee (case-insensitive substring)
node scripts/search-transactions.js --payee "Whole Foods"

# By notes / description
node scripts/search-transactions.js --notes "uber"

# By category name
node scripts/search-transactions.js --category "Groceries"

# By account
node scripts/search-transactions.js --account "Chase"

# By amount range (absolute USD)
node scripts/search-transactions.js --min 50 --max 200

# By date range
node scripts/search-transactions.js --from 2026-01-01 --to 2026-04-01

# Uncategorized only
node scripts/search-transactions.js --uncategorized

# Uncleared only
node scripts/search-transactions.js --uncleared

# Combine freely
node scripts/search-transactions.js --payee "Amazon" --from 2026-01-01 --min 100

# Limit results (default 100)
node scripts/search-transactions.js --payee "Amazon" --limit 500
```

## Output

A table with date, account, payee, category, amount, cleared, notes — sorted newest first. Total at bottom is sum of `amount` (so spending shows as negative).

When summarizing for the user, lead with the count and total. Only show the full table if asked or if the count is small (< 20).

## Related

- `/categorize-transactions` for handling uncategorized.
- `/find-anomalies` for outlier detection.
