---
name: budget-status
description: Show current month's budget status — income vs spent, per-category budgeted vs actual, overrun categories. Use when the user asks "how's my budget", "am I on track", "what's overrun", "budget status", or wants a snapshot of the current envelope balances.
---

# Budget status

Run the `budget-status` script to print the current month (or a specified month) snapshot.

## When to use

- "How's my budget this month?"
- "Am I on track?"
- "Which categories are overrun?"
- "Show me my budget for March"

## Commands

```bash
# Current month, full table
node scripts/budget-status.js

# Specific month
node scripts/budget-status.js 2026-03

# Only show overrun categories
node scripts/budget-status.js --overrun-only
```

## How to interpret

The header shows month-level totals (income available, total budgeted, total spent, to-budget). The table lists every category with budgeted, spent, and balance. Categories with a `!` and negative balance are overrun.

When summarizing for the user, lead with the headline: how many categories are overrun, total spend vs budget, and the worst offenders. Don't read the whole table back unless asked.

## Related

- For deeper analysis (top categories/payees, comparison vs previous month), use `/budget-insights`.
- For full month report, use `/monthly-report`.
- To adjust budget amounts, use `/set-budget`.
