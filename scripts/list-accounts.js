#!/usr/bin/env node
// List all accounts with type, on-budget flag, closed status, and current balance.
// Usage: node scripts/list-accounts.js

import { withBudget, fmtAmount, tablePrint } from './lib/actual.js';

await withBudget(async (api) => {
  const accounts = await api.getAccounts();
  const rows = [];
  for (const a of accounts) {
    const bal = await api.getAccountBalance(a.id);
    rows.push({
      name: a.name,
      type: a.type || '—',
      onBudget: a.offbudget ? 'no' : 'yes',
      closed: a.closed ? 'yes' : 'no',
      balance: bal,
      id: a.id,
    });
  }
  rows.sort(
    (x, y) =>
      (x.closed === 'yes' ? 1 : 0) - (y.closed === 'yes' ? 1 : 0) ||
      y.balance - x.balance,
  );
  tablePrint(rows, [
    { header: 'Account', value: (r) => r.name },
    { header: 'Type', value: (r) => r.type },
    { header: 'On budget', value: (r) => r.onBudget },
    { header: 'Closed', value: (r) => r.closed },
    { header: 'Balance', align: 'right', value: (r) => fmtAmount(r.balance) },
    { header: 'ID', value: (r) => r.id },
  ]);
});
