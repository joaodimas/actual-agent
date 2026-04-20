#!/usr/bin/env node
// Find uncategorized transactions and propose categories based on payee history.
// By default, just lists candidates. Use --apply to actually update them.
//
// Strategy:
//   For each uncategorized transaction, look at past categorized transactions
//   for the same payee. If there's a clear majority category, propose it.
//
// Usage:
//   node scripts/categorize-pending.js                 # last 90 days, dry run
//   node scripts/categorize-pending.js --days 30       # window override
//   node scripts/categorize-pending.js --apply         # actually update
//   node scripts/categorize-pending.js --threshold 0.7 # require 70% majority

import { withBudget, fmtAmount, tablePrint } from './lib/actual.js';

const args = process.argv.slice(2);
const arg = (k, dflt) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : dflt;
};
const days = Number(arg('--days', '90'));
const apply = args.includes('--apply');
const threshold = Number(arg('--threshold', '0.6'));

function isoDaysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

await withBudget(async (api) => {
  const accounts = await api.getAccounts();
  const cats = await api.getCategories();
  const catById = new Map(cats.map((c) => [c.id, c]));
  const payees = await api.getPayees();
  const payeeById = new Map(payees.map((p) => [p.id, p]));

  const startDate = isoDaysAgo(days);
  const endDate = isoDaysAgo(0);

  const allTxs = [];
  for (const a of accounts) {
    if (a.closed) continue;
    const txs = await api.getTransactions(a.id, startDate, endDate);
    for (const t of txs) {
      allTxs.push({ ...t, accountName: a.name });
    }
  }

  // Build payee -> {categoryId: count, total}
  const payeeStats = new Map();
  for (const t of allTxs) {
    if (t.transfer_id) continue;
    if (!t.payee || !t.category) continue;
    const stats =
      payeeStats.get(t.payee) || { byCat: new Map(), total: 0 };
    stats.byCat.set(t.category, (stats.byCat.get(t.category) || 0) + 1);
    stats.total += 1;
    payeeStats.set(t.payee, stats);
  }

  function suggest(payeeId) {
    const stats = payeeStats.get(payeeId);
    if (!stats || !stats.total) return null;
    let bestId = null;
    let bestCount = 0;
    for (const [id, count] of stats.byCat) {
      if (count > bestCount) {
        bestId = id;
        bestCount = count;
      }
    }
    const ratio = bestCount / stats.total;
    if (ratio < threshold) return null;
    return { categoryId: bestId, ratio, sampleSize: stats.total };
  }

  const uncat = allTxs.filter(
    (t) => !t.transfer_id && !t.category && t.amount !== 0,
  );

  console.log(
    `\n${uncat.length} uncategorized transaction(s) in last ${days} days.\n`,
  );

  const rows = uncat.map((t) => {
    const sug = t.payee ? suggest(t.payee) : null;
    return {
      tx: t,
      date: t.date,
      account: t.accountName,
      payee: t.payee
        ? payeeById.get(t.payee)?.name || `[deleted]`
        : '(none)',
      amount: t.amount,
      suggestion: sug,
    };
  });

  tablePrint(rows, [
    { header: 'Date', value: (r) => r.date },
    { header: 'Account', value: (r) => r.account },
    { header: 'Payee', value: (r) => r.payee },
    { header: 'Amount', align: 'right', value: (r) => fmtAmount(r.amount) },
    {
      header: 'Suggested category',
      value: (r) =>
        r.suggestion
          ? `${catById.get(r.suggestion.categoryId)?.name || '?'} ` +
            `(${Math.round(r.suggestion.ratio * 100)}% of ${r.suggestion.sampleSize})`
          : '—',
    },
  ]);

  const applicable = rows.filter((r) => r.suggestion);
  console.log(
    `\n${applicable.length} have confident suggestions (≥ ${Math.round(
      threshold * 100,
    )}%).`,
  );

  if (apply) {
    console.log(`\nApplying ${applicable.length} categorizations...`);
    let ok = 0;
    let fail = 0;
    for (const r of applicable) {
      try {
        await api.updateTransaction(r.tx.id, {
          category: r.suggestion.categoryId,
        });
        ok += 1;
      } catch (err) {
        fail += 1;
        console.error(`  ✗ ${r.tx.id}: ${err.message}`);
      }
    }
    console.log(`Applied: ${ok}.  Failed: ${fail}.`);
  } else if (applicable.length) {
    console.log(`Re-run with --apply to actually update them.`);
  }
});
