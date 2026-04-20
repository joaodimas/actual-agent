#!/usr/bin/env node
// Show current month's budget status: income vs spent, per-category budgeted vs actual.
// Usage:
//   node scripts/budget-status.js                 # current month
//   node scripts/budget-status.js 2026-03         # specific month
//   node scripts/budget-status.js --overrun-only  # only show overrun categories

import {
  withBudget,
  currentMonth,
  fmtAmount,
  tablePrint,
} from './lib/actual.js';
import api from '@actual-app/api';

const args = process.argv.slice(2);
const month =
  args.find((a) => /^\d{4}-\d{2}$/.test(a)) || currentMonth();
const overrunOnly = args.includes('--overrun-only');

await withBudget(async (api) => {
  const m = await api.getBudgetMonth(month);
  console.log(`\nBudget status for ${month}\n`);
  console.log(`  Income available:  ${fmtAmount(m.incomeAvailable)}`);
  console.log(`  Last month carry:  ${fmtAmount(m.lastMonthOverspent)}`);
  console.log(`  For next month:    ${fmtAmount(m.forNextMonth)}`);
  console.log(`  Total budgeted:    ${fmtAmount(m.totalBudgeted)}`);
  console.log(`  Total income:      ${fmtAmount(m.totalIncome)}`);
  console.log(`  Total spent:       ${fmtAmount(m.totalSpent)}`);
  console.log(`  To budget:         ${fmtAmount(m.toBudget)}`);
  console.log('');

  const rows = [];
  for (const g of m.categoryGroups || []) {
    if (g.is_income) continue;
    for (const c of g.categories || []) {
      const overrun = c.balance < 0;
      if (overrunOnly && !overrun) continue;
      rows.push({
        group: g.name,
        category: c.name,
        budgeted: c.budgeted,
        spent: c.spent,
        balance: c.balance,
        overrun,
      });
    }
  }

  rows.sort((a, b) => a.balance - b.balance);
  tablePrint(rows, [
    { header: 'Group', value: (r) => r.group },
    { header: 'Category', value: (r) => r.category },
    { header: 'Budgeted', align: 'right', value: (r) => fmtAmount(r.budgeted) },
    { header: 'Spent', align: 'right', value: (r) => fmtAmount(r.spent) },
    {
      header: 'Balance',
      align: 'right',
      value: (r) => `${r.overrun ? '!' : ' '} ${fmtAmount(r.balance)}`,
    },
  ]);

  const overruns = rows.filter((r) => r.overrun).length;
  console.log('');
  if (overrunOnly) {
    console.log(`${overruns} overrun categor${overruns === 1 ? 'y' : 'ies'}.`);
  } else {
    console.log(
      `${overruns} of ${rows.length} categor${rows.length === 1 ? 'y is' : 'ies are'} overrun.`,
    );
  }
});
