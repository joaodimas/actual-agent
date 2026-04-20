#!/usr/bin/env node
// Set or adjust budget amounts for categories in a given month.
//
// Usage:
//   # Set "Groceries" to $600 for current month
//   node scripts/budget-set.js --category "Groceries" --amount 600
//
//   # Set for a specific month
//   node scripts/budget-set.js --category "Groceries" --amount 600 --month 2026-05
//
//   # Carry over balance instead
//   node scripts/budget-set.js --category "Groceries" --carryover true
//
//   # Hold money for next month
//   node scripts/budget-set.js --hold 500

import { withBudget, currentMonth } from './lib/actual.js';

const args = process.argv.slice(2);
const arg = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};

const month = arg('--month') || currentMonth();
const categoryName = arg('--category');
const amountDollars = arg('--amount');
const carryover = arg('--carryover');
const hold = arg('--hold');
const resetHold = args.includes('--reset-hold');

await withBudget(async (api) => {
  if (resetHold) {
    await api.resetBudgetHold(month);
    console.log(`✓ Reset hold for ${month}`);
    return;
  }
  if (hold != null) {
    const cents = api.utils.amountToInteger(Number(hold));
    await api.holdBudgetForNextMonth(month, cents);
    console.log(`✓ Held $${hold} for next month from ${month}`);
    return;
  }
  if (!categoryName) {
    console.error('Need --category or --hold or --reset-hold');
    process.exit(1);
  }
  const cats = await api.getCategories();
  const cat = cats.find(
    (c) => c.name.toLowerCase() === categoryName.toLowerCase(),
  );
  if (!cat) {
    console.error(`Category not found: "${categoryName}"`);
    process.exit(1);
  }

  if (amountDollars != null) {
    const cents = api.utils.amountToInteger(Number(amountDollars));
    await api.setBudgetAmount(month, cat.id, cents);
    console.log(
      `✓ Set ${cat.name} = $${amountDollars} for ${month}`,
    );
  }
  if (carryover != null) {
    const flag = carryover === 'true' || carryover === '1';
    await api.setBudgetCarryover(month, cat.id, flag);
    console.log(
      `✓ Set ${cat.name} carryover = ${flag} for ${month}`,
    );
  }
});
