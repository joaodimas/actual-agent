#!/usr/bin/env node
import { withBudget, currentMonth } from './lib/actual.js';

await withBudget(async (api) => {
  console.log(`Connected. Inspecting budget...`);
  const accounts = await api.getAccounts();
  console.log(`  Accounts: ${accounts.length}`);
  const cats = await api.getCategories();
  console.log(`  Categories: ${cats.length}`);
  const groups = await api.getCategoryGroups();
  console.log(`  Category groups: ${groups.length}`);
  const payees = await api.getPayees();
  console.log(`  Payees: ${payees.length}`);
  const months = await api.getBudgetMonths();
  console.log(`  Budget months tracked: ${months.length}`);
  console.log(`  First month: ${months[0]} | Last month: ${months[months.length - 1]}`);
  const month = await api.getBudgetMonth(currentMonth());
  console.log(`\nCurrent month (${currentMonth()}) snapshot:`);
  console.log(`  ${JSON.stringify({
    incomeAvailable: month.incomeAvailable,
    totalBudgeted: month.totalBudgeted,
    totalSpent: month.totalSpent,
    toBudget: month.toBudget,
  })}`);
});
