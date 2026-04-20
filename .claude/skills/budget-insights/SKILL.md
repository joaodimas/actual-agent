---
name: budget-insights
description: Analyze spending for a month or range — top categories, top payees, change vs previous month. Use when the user asks "where is my money going", "what did I spend on", "top categories", "biggest expenses", "spending trends", or wants insight into where cash flows.
---

# Budget insights

Run the `insights` script to summarize on-budget income/spend, top categories, top payees, and biggest changes vs the previous month.

## When to use

- "Where is my money going?"
- "What did I spend the most on this month?"
- "Top 10 categories"
- "How does my spending compare to last month?"
- "What changed between January and March?"

## Commands

```bash
# Current month, top 10
node scripts/insights.js

# Specific month
node scripts/insights.js 2026-03

# Date range
node scripts/insights.js 2026-01 2026-03

# Adjust top N
node scripts/insights.js --top 20
```

## How to interpret

The script outputs three blocks for a single month:

1. **Headline numbers** — total income, total spend, net cash flow. Only on-budget accounts; transfers are excluded.
2. **Top N categories by spend** — with % of total spend.
3. **Top N payees by spend** — useful for spotting habit patterns.
4. **Biggest changes vs previous month** — only shown for single-month queries.

For ranges, the comparison block is suppressed.

When summarizing, lead with the savings rate (or burn rate) and the top 1-2 surprising categories or changes. Don't dump the whole table — pick the story.

## Related

- For pre/post month-over-month deltas, just use a single month query.
- For full month report (incl. anomalies, net worth, overruns), use `/monthly-report`.
- To find unusual transactions specifically, use `/find-anomalies`.
