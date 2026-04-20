---
name: monthly-report
description: Generate a comprehensive monthly summary — income/spend/savings rate, budget vs actual, overrun categories, top categories and payees, largest transactions, net worth at month end. Use when the user asks for "monthly report", "month recap", "how did the month go", "summary of March".
---

# Monthly report

Comprehensive month summary — combines budget status, insights, anomalies, and net worth into one printout. Good for end-of-month review.

## When to use

- "Generate the monthly report for March"
- "How did this month go?"
- "Give me a recap of last month"
- "Send me a summary of October"

## Commands

```bash
# Current month
node scripts/monthly-report.js

# Specific month
node scripts/monthly-report.js 2026-03
```

## Sections in output

1. **Headline cash flow** — income, spend, net, savings rate.
2. **Budget vs actual** — totals (budgeted, spent, to-budget).
3. **Overruns** — every category over budget, sorted worst first.
4. **Top 10 categories by spend** — with % of total.
5. **Top 10 payees by spend.**
6. **5 largest single transactions.**
7. **Net worth at month end** — on-budget, off-budget, total.

## Summarizing for the user

Don't read the full report back. Pick the narrative:

- One-line headline (e.g. "Spent $X, saved Y%, net worth changed by Z").
- 2-3 most interesting items (worst overrun, biggest single charge, surprise top category).
- Then offer to dig into specifics with `/budget-status`, `/budget-insights`, or `/find-anomalies`.

## Related

- `/budget-status` for just the envelope balances.
- `/budget-insights` for top categories/payees with comparison.
- `/find-anomalies` for unusual transaction detection.
