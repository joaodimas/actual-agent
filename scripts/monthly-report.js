#!/usr/bin/env node
// Generate a comprehensive monthly report:
//   - Income vs spend, savings rate
//   - Top categories and payees
//   - Overrun categories
//   - Net worth as of month end
//   - Unusual transactions (large or new payees)
//
// Usage:
//   node scripts/monthly-report.js                # current month
//   node scripts/monthly-report.js 2026-03

import {
  withBudget,
  currentMonth,
  monthRange,
  fmtAmount,
  tablePrint,
} from './lib/actual.js';

const args = process.argv.slice(2);
const month =
  args.find((a) => /^\d{4}-\d{2}$/.test(a)) || currentMonth();

await withBudget(async (api) => {
  const accounts = await api.getAccounts();
  const onBudgetAccountIds = new Set(
    accounts.filter((a) => !a.offbudget).map((a) => a.id),
  );
  const cats = await api.getCategories();
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const payees = await api.getPayees();
  const payeeName = new Map(payees.map((p) => [p.id, p.name]));

  const { start, end } = monthRange(month);
  const m = await api.getBudgetMonth(month);

  // Pull all on-budget transactions for the month
  const txs = [];
  for (const a of accounts) {
    if (a.closed || !onBudgetAccountIds.has(a.id)) continue;
    const monthTxs = await api.getTransactions(a.id, start, end);
    for (const t of monthTxs) {
      if (t.transfer_id) continue;
      txs.push({ ...t, accountName: a.name });
    }
  }

  const income = txs.filter((t) => t.amount > 0);
  const spend = txs.filter((t) => t.amount < 0);
  const totalIncome = income.reduce((s, t) => s + t.amount, 0);
  const totalSpend = spend.reduce((s, t) => s + t.amount, 0);
  const net = totalIncome + totalSpend;
  const savingsRate = totalIncome > 0 ? (net / totalIncome) * 100 : 0;

  console.log(`\n========== MONTHLY REPORT: ${month} ==========\n`);
  console.log(`Income:        ${fmtAmount(totalIncome)}`);
  console.log(`Spend:         ${fmtAmount(totalSpend)}`);
  console.log(`Net cash flow: ${fmtAmount(net)}`);
  console.log(`Savings rate:  ${savingsRate.toFixed(1)}%`);
  console.log('');

  // Budgeted vs actual summary
  console.log('Budget vs actual:');
  console.log(`  Total budgeted:  ${fmtAmount(m.totalBudgeted)}`);
  console.log(`  Total spent:     ${fmtAmount(m.totalSpent)}`);
  console.log(`  To budget:       ${fmtAmount(m.toBudget)}`);
  console.log('');

  // Overrun categories
  const overruns = [];
  for (const g of m.categoryGroups || []) {
    if (g.is_income) continue;
    for (const c of g.categories || []) {
      if (c.balance < 0) {
        overruns.push({
          group: g.name,
          category: c.name,
          budgeted: c.budgeted,
          spent: c.spent,
          balance: c.balance,
        });
      }
    }
  }
  if (overruns.length) {
    console.log(`${overruns.length} overrun categor${overruns.length === 1 ? 'y' : 'ies'}:`);
    overruns.sort((a, b) => a.balance - b.balance);
    tablePrint(overruns, [
      { header: 'Category', value: (r) => `${r.group} › ${r.category}` },
      { header: 'Budgeted', align: 'right', value: (r) => fmtAmount(r.budgeted) },
      { header: 'Spent', align: 'right', value: (r) => fmtAmount(r.spent) },
      { header: 'Over by', align: 'right', value: (r) => fmtAmount(r.balance) },
    ]);
  } else {
    console.log('No overrun categories. ✓');
  }
  console.log('');

  // Top categories by spend
  const byCat = new Map();
  for (const t of spend) {
    const key = t.category || 'uncategorized';
    byCat.set(key, (byCat.get(key) || 0) + t.amount);
  }
  console.log('Top 10 spend categories:');
  const catRows = [...byCat.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, 10)
    .map(([id, amount]) => ({
      cat:
        id === 'uncategorized'
          ? '(uncategorized)'
          : catName.get(id) || `[deleted]`,
      amount,
      pct: totalSpend ? Math.round((amount / totalSpend) * 100) : 0,
    }));
  tablePrint(catRows, [
    { header: 'Category', value: (r) => r.cat },
    { header: 'Spent', align: 'right', value: (r) => fmtAmount(r.amount) },
    { header: '%', align: 'right', value: (r) => `${r.pct}%` },
  ]);
  console.log('');

  // Top payees
  const byPayee = new Map();
  for (const t of spend) {
    const key = t.payee || 'unknown';
    byPayee.set(key, (byPayee.get(key) || 0) + t.amount);
  }
  console.log('Top 10 payees:');
  const payeeRows = [...byPayee.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, 10)
    .map(([id, amount]) => ({
      payee:
        id === 'unknown'
          ? '(no payee)'
          : payeeName.get(id) || `[deleted]`,
      amount,
    }));
  tablePrint(payeeRows, [
    { header: 'Payee', value: (r) => r.payee },
    { header: 'Spent', align: 'right', value: (r) => fmtAmount(r.amount) },
  ]);
  console.log('');

  // Largest single transactions
  console.log('5 largest single transactions:');
  const largest = [...spend]
    .sort((a, b) => a.amount - b.amount)
    .slice(0, 5)
    .map((t) => ({
      date: t.date,
      payee: t.payee
        ? payeeName.get(t.payee) || '[deleted]'
        : '(no payee)',
      cat: t.category ? catName.get(t.category) || '?' : '(uncat)',
      amount: t.amount,
    }));
  tablePrint(largest, [
    { header: 'Date', value: (r) => r.date },
    { header: 'Payee', value: (r) => r.payee },
    { header: 'Category', value: (r) => r.cat },
    { header: 'Amount', align: 'right', value: (r) => fmtAmount(r.amount) },
  ]);
  console.log('');

  // Net worth at month end
  console.log(`Net worth as of ${end}:`);
  let onBudgetTotal = 0;
  let offBudgetTotal = 0;
  for (const a of accounts) {
    if (a.closed) continue;
    const bal = await api.getAccountBalance(a.id, new Date(end));
    if (a.offbudget) offBudgetTotal += bal;
    else onBudgetTotal += bal;
  }
  console.log(`  On-budget:  ${fmtAmount(onBudgetTotal)}`);
  console.log(`  Off-budget: ${fmtAmount(offBudgetTotal)}`);
  console.log(`  TOTAL:      ${fmtAmount(onBudgetTotal + offBudgetTotal)}`);
});
