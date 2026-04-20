#!/usr/bin/env node
// Show net worth: per-account balance, totals split by on/off budget.
// Usage:
//   node scripts/net-worth.js                # current balances
//   node scripts/net-worth.js 2026-03-31     # as of a specific date

import { withBudget, fmtAmount, tablePrint } from './lib/actual.js';

const args = process.argv.slice(2);
const cutoff = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

await withBudget(async (api) => {
  const accounts = await api.getAccounts();
  const open = accounts.filter((a) => !a.closed);
  const cutoffDate = cutoff ? new Date(cutoff) : undefined;

  const rows = [];
  for (const a of open) {
    const bal = await api.getAccountBalance(a.id, cutoffDate);
    rows.push({
      name: a.name,
      type: a.type || '—',
      onBudget: !a.offbudget,
      balance: bal,
    });
  }

  rows.sort((a, b) => b.balance - a.balance);

  console.log(`\nNet worth${cutoff ? ` as of ${cutoff}` : ''}\n`);
  tablePrint(rows, [
    { header: 'Account', value: (r) => r.name },
    { header: 'Type', value: (r) => r.type },
    { header: 'On budget', value: (r) => (r.onBudget ? 'yes' : 'no') },
    {
      header: 'Balance',
      align: 'right',
      value: (r) => fmtAmount(r.balance),
    },
  ]);

  const onBudget = rows
    .filter((r) => r.onBudget)
    .reduce((s, r) => s + r.balance, 0);
  const offBudget = rows
    .filter((r) => !r.onBudget)
    .reduce((s, r) => s + r.balance, 0);
  const total = onBudget + offBudget;

  console.log('');
  console.log(`  On-budget total:   ${fmtAmount(onBudget)}`);
  console.log(`  Off-budget total:  ${fmtAmount(offBudget)}`);
  console.log(`  NET WORTH:         ${fmtAmount(total)}`);
});
