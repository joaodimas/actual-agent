#!/usr/bin/env node
// Spending insights for a month or range:
//   - Spend by category (top N)
//   - Spend by payee (top N)
//   - Comparison vs previous month
// Usage:
//   node scripts/insights.js                       # current month
//   node scripts/insights.js 2026-03               # specific month
//   node scripts/insights.js 2026-01 2026-03       # range
//   node scripts/insights.js --top 20              # top 20 instead of 10

import {
  withBudget,
  currentMonth,
  previousMonth,
  monthRange,
  fmtAmount,
  tablePrint,
} from './lib/actual.js';

const args = process.argv.slice(2);
const months = args.filter((a) => /^\d{4}-\d{2}$/.test(a));
const topIdx = args.indexOf('--top');
const top = topIdx >= 0 ? Number(args[topIdx + 1]) : 10;

const start = months[0] || currentMonth();
const end = months[1] || start;

function monthsBetween(a, b) {
  const out = [];
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  let y = ya;
  let m = ma;
  while (y < yb || (y === yb && m <= mb)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

await withBudget(async (api) => {
  const range = monthsBetween(start, end);
  const accounts = await api.getAccounts();
  const onBudgetAccountIds = new Set(
    accounts.filter((a) => !a.offbudget).map((a) => a.id),
  );
  const cats = await api.getCategories();
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const payees = await api.getPayees();
  const payeeName = new Map(payees.map((p) => [p.id, p.name]));

  const byCat = new Map();
  const byPayee = new Map();
  let totalSpend = 0;
  let totalIncome = 0;

  const collect = async (month) => {
    const { start, end } = monthRange(month);
    for (const a of accounts) {
      if (a.closed || !onBudgetAccountIds.has(a.id)) continue;
      const txs = await api.getTransactions(a.id, start, end);
      for (const t of txs) {
        if (t.transfer_id) continue;
        if (t.amount < 0) {
          totalSpend += t.amount;
          const key = t.category || 'uncategorized';
          byCat.set(key, (byCat.get(key) || 0) + t.amount);
          const pkey = t.payee || 'unknown';
          byPayee.set(pkey, (byPayee.get(pkey) || 0) + t.amount);
        } else if (t.amount > 0) {
          totalIncome += t.amount;
        }
      }
    }
  };

  for (const month of range) await collect(month);

  console.log(
    `\nInsights for ${start === end ? start : `${start} → ${end}`}\n`,
  );
  console.log(`  Total income (on-budget):   ${fmtAmount(totalIncome)}`);
  console.log(`  Total spend  (on-budget):   ${fmtAmount(totalSpend)}`);
  console.log(`  Net flow:                   ${fmtAmount(totalIncome + totalSpend)}`);
  console.log('');

  console.log(`Top ${top} categories by spend:`);
  const catRows = [...byCat.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, top)
    .map(([id, amount]) => ({
      category:
        id === 'uncategorized'
          ? '(uncategorized)'
          : catName.get(id) || `[deleted ${id.slice(0, 8)}]`,
      amount,
      pct: totalSpend ? Math.round((amount / totalSpend) * 100) : 0,
    }));
  tablePrint(catRows, [
    { header: 'Category', value: (r) => r.category },
    { header: 'Spent', align: 'right', value: (r) => fmtAmount(r.amount) },
    { header: '% of spend', align: 'right', value: (r) => `${r.pct}%` },
  ]);

  console.log('');
  console.log(`Top ${top} payees by spend:`);
  const payeeRows = [...byPayee.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, top)
    .map(([id, amount]) => ({
      payee:
        id === 'unknown'
          ? '(no payee)'
          : payeeName.get(id) || `[deleted ${id.slice(0, 8)}]`,
      amount,
    }));
  tablePrint(payeeRows, [
    { header: 'Payee', value: (r) => r.payee },
    { header: 'Spent', align: 'right', value: (r) => fmtAmount(r.amount) },
  ]);

  if (start === end) {
    const prev = previousMonth(start);
    const prevByCat = new Map();
    const { start: ps, end: pe } = monthRange(prev);
    for (const a of accounts) {
      if (a.closed || !onBudgetAccountIds.has(a.id)) continue;
      const txs = await api.getTransactions(a.id, ps, pe);
      for (const t of txs) {
        if (t.transfer_id || t.amount >= 0) continue;
        const key = t.category || 'uncategorized';
        prevByCat.set(key, (prevByCat.get(key) || 0) + t.amount);
      }
    }

    console.log('');
    console.log(`Biggest changes vs ${prev}:`);
    const allCatIds = new Set([...byCat.keys(), ...prevByCat.keys()]);
    const deltas = [...allCatIds].map((id) => {
      const cur = byCat.get(id) || 0;
      const old = prevByCat.get(id) || 0;
      return {
        category:
          id === 'uncategorized'
            ? '(uncategorized)'
            : catName.get(id) || `[deleted ${id.slice(0, 8)}]`,
        cur,
        old,
        delta: cur - old,
      };
    });
    deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    tablePrint(deltas.slice(0, top), [
      { header: 'Category', value: (r) => r.category },
      { header: prev, align: 'right', value: (r) => fmtAmount(r.old) },
      { header: start, align: 'right', value: (r) => fmtAmount(r.cur) },
      {
        header: 'Δ',
        align: 'right',
        value: (r) => `${r.delta > 0 ? '+' : ''}${fmtAmount(r.delta)}`,
      },
    ]);
  }
});
