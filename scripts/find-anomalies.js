#!/usr/bin/env node
// Detect anomalous transactions: large outliers, new payees, duplicates.
// Usage:
//   node scripts/find-anomalies.js                # last 30 days
//   node scripts/find-anomalies.js --days 60      # window override
//   node scripts/find-anomalies.js --history 180  # how far back to compute baselines

import { withBudget, fmtAmount, tablePrint } from './lib/actual.js';

const args = process.argv.slice(2);
const arg = (k, dflt) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : dflt;
};

const days = Number(arg('--days', '30'));
const historyDays = Number(arg('--history', '180'));

function isoDaysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

await withBudget(async (api) => {
  const accounts = await api.getAccounts();
  const cats = await api.getCategories();
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const payees = await api.getPayees();
  const payeeName = new Map(payees.map((p) => [p.id, p.name]));

  const recentStart = isoDaysAgo(days);
  const historyStart = isoDaysAgo(historyDays);
  const today = isoDaysAgo(0);

  const all = [];
  for (const a of accounts) {
    if (a.closed) continue;
    const txs = await api.getTransactions(a.id, historyStart, today);
    for (const t of txs) {
      if (t.transfer_id) continue;
      all.push({ ...t, accountName: a.name });
    }
  }

  const recent = all.filter((t) => t.date >= recentStart);
  const baseline = all.filter((t) => t.date < recentStart);

  // 1. Large outliers per category (vs P95 of historical baseline)
  const baselineByCat = new Map();
  for (const t of baseline) {
    if (t.amount >= 0) continue;
    const key = t.category || 'uncategorized';
    if (!baselineByCat.has(key)) baselineByCat.set(key, []);
    baselineByCat.get(key).push(Math.abs(t.amount));
  }
  const p95ByCat = new Map();
  for (const [k, arr] of baselineByCat) {
    arr.sort((a, b) => a - b);
    p95ByCat.set(k, quantile(arr, 0.95));
  }

  const outliers = [];
  for (const t of recent) {
    if (t.amount >= 0) continue;
    const key = t.category || 'uncategorized';
    const p95 = p95ByCat.get(key);
    const abs = Math.abs(t.amount);
    if (p95 && abs > p95 * 1.5 && abs > 5000) {
      outliers.push({
        date: t.date,
        account: t.accountName,
        payee: t.payee
          ? payeeName.get(t.payee) || '[deleted]'
          : '(no payee)',
        cat:
          t.category === undefined || t.category === null
            ? '(uncategorized)'
            : catName.get(t.category) || '?',
        amount: t.amount,
        p95,
        ratio: (abs / p95).toFixed(1),
      });
    }
  }

  // 2. New payees in the recent window (no occurrence in baseline)
  const baselinePayees = new Set(
    baseline.filter((t) => t.payee).map((t) => t.payee),
  );
  const newPayeeTxs = recent.filter(
    (t) => t.payee && !baselinePayees.has(t.payee),
  );
  const newPayeeAgg = new Map();
  for (const t of newPayeeTxs) {
    const key = t.payee;
    const cur = newPayeeAgg.get(key) || {
      name: payeeName.get(t.payee) || '[deleted]',
      count: 0,
      total: 0,
      first: t.date,
    };
    cur.count += 1;
    cur.total += t.amount;
    if (t.date < cur.first) cur.first = t.date;
    newPayeeAgg.set(key, cur);
  }

  // 3. Possible duplicates (same account, amount, within 3 days)
  const dupes = [];
  const sortedRecent = [...recent].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  for (let i = 0; i < sortedRecent.length; i += 1) {
    for (let j = i + 1; j < sortedRecent.length; j += 1) {
      const a = sortedRecent[i];
      const b = sortedRecent[j];
      const dayDiff =
        (new Date(b.date) - new Date(a.date)) / (1000 * 60 * 60 * 24);
      if (dayDiff > 3) break;
      if (
        a.account === b.account &&
        a.amount === b.amount &&
        a.amount !== 0 &&
        a.payee === b.payee
      ) {
        dupes.push({ a, b });
      }
    }
  }

  console.log(
    `\nAnomaly scan: recent ${days}d, baseline ${historyDays}d back\n`,
  );

  console.log(
    `Large outliers (>1.5× P95 of historical category spend, min $50):`,
  );
  if (!outliers.length) console.log('  (none)');
  else
    tablePrint(outliers, [
      { header: 'Date', value: (r) => r.date },
      { header: 'Account', value: (r) => r.account },
      { header: 'Payee', value: (r) => r.payee },
      { header: 'Category', value: (r) => r.cat },
      { header: 'Amount', align: 'right', value: (r) => fmtAmount(r.amount) },
      { header: 'Cat P95', align: 'right', value: (r) => fmtAmount(-r.p95) },
      { header: '×', align: 'right', value: (r) => `${r.ratio}×` },
    ]);
  console.log('');

  console.log(`New payees in recent window:`);
  const newPayeeRows = [...newPayeeAgg.values()].sort(
    (a, b) => a.total - b.total,
  );
  if (!newPayeeRows.length) console.log('  (none)');
  else
    tablePrint(newPayeeRows, [
      { header: 'First seen', value: (r) => r.first },
      { header: 'Payee', value: (r) => r.name },
      { header: 'Count', align: 'right', value: (r) => String(r.count) },
      { header: 'Total', align: 'right', value: (r) => fmtAmount(r.total) },
    ]);
  console.log('');

  console.log(`Possible duplicate transactions (same account, payee, amount, within 3 days):`);
  if (!dupes.length) console.log('  (none)');
  else
    for (const { a, b } of dupes) {
      console.log(
        `  • ${a.date} & ${b.date} | ${a.accountName} | ${a.payee ? payeeName.get(a.payee) || '[deleted]' : '(no payee)'} | ${fmtAmount(a.amount)}`,
      );
      console.log(`      ids: ${a.id}  /  ${b.id}`);
    }
});
