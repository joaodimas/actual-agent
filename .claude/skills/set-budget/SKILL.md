---
name: set-budget
description: Set or adjust a category's budgeted amount for a month, toggle carryover, hold money for next month, or reset a hold. Use when the user says "set my Groceries budget to $600", "carry over the leftover", "hold $500 for next month", "budget X for Y category".
---

# Set / adjust budget amounts

Modify the budget envelope: assign amounts to categories, toggle balance carryover, hold money for next month, or reset a hold.

## When to use

- "Set my Groceries budget to $600 this month"
- "Allocate $200 to Eating Out for May"
- "Carry over the leftover Health balance to next month"
- "Hold $500 from this month for next month"
- "Undo the hold I set"

## Commands

```bash
# Set a category's budget for the current month
node scripts/budget-set.js --category "Groceries" --amount 600

# Set for a specific month
node scripts/budget-set.js --category "Groceries" --amount 600 --month 2026-05

# Toggle carryover (balance rolls into next month if true)
node scripts/budget-set.js --category "Health" --carryover true
node scripts/budget-set.js --category "Health" --carryover false

# Hold $500 from this month for next
node scripts/budget-set.js --hold 500

# Hold for a specific month
node scripts/budget-set.js --hold 500 --month 2026-04

# Reset a hold for the current month
node scripts/budget-set.js --reset-hold
```

## Notes

- Category name match is exact (case-insensitive). If unsure, run `/budget-status` first to see the exact names.
- Amounts are in dollars (e.g. `600` = $600.00). The script converts to the integer cents the API expects.
- Setting a budget amount overwrites whatever was previously assigned for that month.
- Confirm the action with the user before changing values for a *past* month — that's usually not what they want.

## Related

- `/budget-status` to verify before/after.
