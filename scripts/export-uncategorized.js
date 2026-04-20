#!/usr/bin/env node
// Export a list of all uncategorized transactions, grouped by payee, to JSON.
// Output is a structured file Claude (or you) can fill in with category assignments,
// then feed back to apply-categorization-map.js to bulk-update.
//
// Usage:
//   node scripts/export-uncategorized.js                   # all time, write to ./out/uncategorized.json
//   node scripts/export-uncategorized.js --days 365
//   node scripts/export-uncategorized.js --out path.json

import fs from 'node:fs';
import path from 'node:path';
import { withBudget, fmtAmount, PROJECT_ROOT } from './lib/actual.js';

const args = process.argv.slice(2);
const arg = (k, dflt) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : dflt;
};

const days = arg('--days') ? Number(arg('--days')) : null;
const outPath =
  arg('--out') || path.join(PROJECT_ROOT, 'out', 'uncategorized.json');

function isoDaysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

await withBudget(async (api) => {
  const accounts = await api.getAccounts();
  const cats = await api.getCategories();
  const groups = await api.getCategoryGroups();
  const payees = await api.getPayees();
  const payeeById = new Map(payees.map((p) => [p.id, p]));

  const startDate = days ? isoDaysAgo(days) : '1900-01-01';
  const endDate = isoDaysAgo(0);

  const all = [];
  for (const a of accounts) {
    if (a.closed) continue;
    const txs = await api.getTransactions(a.id, startDate, endDate);
    for (const t of txs) {
      if (t.transfer_id) continue;
      if (t.category) continue;
      if (t.amount === 0) continue;
      all.push({ ...t, accountName: a.name });
    }
  }

  // Group by payee id (or "unknown" if missing)
  const byPayee = new Map();
  for (const t of all) {
    const key = t.payee || '__none__';
    if (!byPayee.has(key)) {
      byPayee.set(key, {
        payeeId: t.payee || null,
        payeeName: t.payee
          ? payeeById.get(t.payee)?.name || `[deleted ${t.payee.slice(0, 8)}]`
          : '(no payee)',
        transactionCount: 0,
        totalAmountCents: 0,
        sampleNotes: [],
        accountNames: new Set(),
        firstDate: t.date,
        lastDate: t.date,
        transactionIds: [],
        suggested_category: null,  // <-- to be filled in
      });
    }
    const e = byPayee.get(key);
    e.transactionCount += 1;
    e.totalAmountCents += t.amount;
    if (t.notes && e.sampleNotes.length < 3 && !e.sampleNotes.includes(t.notes))
      e.sampleNotes.push(t.notes);
    e.accountNames.add(t.accountName);
    if (t.date < e.firstDate) e.firstDate = t.date;
    if (t.date > e.lastDate) e.lastDate = t.date;
    e.transactionIds.push(t.id);
  }

  const payeeList = [...byPayee.values()]
    .map((e) => ({
      ...e,
      accountNames: [...e.accountNames],
      totalAmount: api.utils.integerToAmount(e.totalAmountCents),
    }))
    .sort((a, b) => a.totalAmountCents - b.totalAmountCents); // most spent first

  const categoryList = groups.flatMap((g) =>
    (g.categories || []).map((c) => ({
      group: g.name,
      name: c.name,
      id: c.id,
      is_income: !!g.is_income,
    })),
  );

  const out = {
    generatedAt: new Date().toISOString(),
    dateRange: { start: startDate, end: endDate },
    totalUncategorized: all.length,
    uniquePayees: payeeList.length,
    instructions:
      'Fill in `suggested_category` for each payee with the EXACT case-sensitive category name from `categories` below. Leave null to skip. Then run `node scripts/apply-categorization-map.js out/uncategorized.json` (add --apply to actually write).',
    payees: payeeList,
    categories: categoryList,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Wrote ${outPath}`);
  console.log(
    `  ${all.length} uncategorized transactions across ${payeeList.length} unique payees`,
  );
  console.log(`  ${categoryList.length} available categories listed in the file`);
});
