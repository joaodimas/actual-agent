---
name: list-accounts
description: List all accounts in the budget — name, type, on-budget flag, current balance, closed status. Use when the user asks "what accounts do I have", "list my accounts", "show my account names", or before any operation where the user needs to choose an account.
---

# List accounts

Quick reference of every account in the budget — name, type, on/off budget, balance, closed status. Useful as a precursor to `/add-transaction`, `/import-csv`, or `/budget-sync --bank` when the user needs to pick an account.

## When to use

- "What accounts do I have?"
- "Show me my accounts"
- "List my credit cards"
- Before asking the user to specify which account for another action.

## Command

```bash
node scripts/list-accounts.js
```

## Notes

- This is an inline script using the existing helper; no separate file needed.
- Closed accounts are listed at the bottom for reference.

## Related

- `/net-worth` for grouped totals.
- `/budget-sync --bank "<name>"` to refresh transactions for one account.
