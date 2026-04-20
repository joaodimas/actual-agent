---
name: net-worth
description: Show per-account balances and total net worth, split by on-budget vs off-budget. Optionally as of a past date. Use when the user asks "what's my net worth", "show my account balances", "how much do I owe on credit cards", "what was my net worth on date X".
---

# Net worth

Show open-account balances and totals.

## When to use

- "What's my net worth?"
- "Show me all my account balances"
- "How much do I owe on credit cards?"
- "What was my net worth at the end of March?"

## Commands

```bash
# Current
node scripts/net-worth.js

# As of a specific date
node scripts/net-worth.js 2026-03-31
```

## How to interpret

- Balances come from `api.getAccountBalance()`. Credit cards show as negative (you owe).
- "On budget" accounts are part of the budget envelope; "off budget" (e.g. a mortgage or auto loan) are excluded from budget math but included in net worth.
- Closed accounts are filtered out.

When the user asks "net worth", just give the headline number plus the on/off split. Only enumerate per-account balances if they ask for the breakdown.

## Related

- `/monthly-report` includes net worth as of month-end.
