#!/usr/bin/env node
// Search transactions across all accounts.
// Filters can be combined.
//
// Usage:
//   node scripts/search-transactions.js --payee "Whole Foods"
//   node scripts/search-transactions.js --notes "uber"
//   node scripts/search-transactions.js --category "Food"
//   node scripts/search-transactions.js --account "Chase"
//   node scripts/search-transactions.js --min 50 --max 200       # absolute USD
//   node scripts/search-transactions.js --from 2026-01-01 --to 2026-04-01
//   node scripts/search-transactions.js --uncategorized
//   node scripts/search-transactions.js --uncleared

import { withBudget, fmtAmount, tablePrint } from './lib/actual.js';

const args = process.argv.slice(2);
const arg = (k, dflt) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : dflt;
};
const flag = (k) => args.includes(k);

const filters = {
  payee: arg('--payee'),
  notes: arg('--notes'),
  category: arg('--category'),
  account: arg('--account'),
  min: arg('--min') != null ? Number(arg('--min')) : null,
  max: arg('--max') != null ? Number(arg('--max')) : null,
  from: arg('--from'),
  to: arg('--to'),
  uncategorized: flag('--uncategorized'),
  uncleared: flag('--uncleared'),
  limit: Number(arg('--limit', '100')),
};

await withBudget(async (api) => {
  const accounts = await api.getAccounts();
  const cats = await api.getCategories();
  const catById = new Map(cats.map((c) => [c.id, c]));
  const payees = await api.getPayees();
  const payeeById = new Map(payees.map((p) => [p.id, p]));

  const startDate = filters.from || '1900-01-01';
  const endDate = filters.to || '2099-12-31';

  const matches = [];
  for (const a of accounts) {
    if (filters.account &&
      !a.name.toLowerCase().includes(filters.account.toLowerCase())) {
      continue;
    }
    const txs = await api.getTransactions(a.id, startDate, endDate);
    for (const t of txs) {
      const payeeName = t.payee ? payeeById.get(t.payee)?.name || '' : '';
      const catName = t.category ? catById.get(t.category)?.name || '' : '';
      const absDollars = Math.abs(t.amount) / 100;

      if (filters.payee &&
        !payeeName.toLowerCase().includes(filters.payee.toLowerCase())) continue;
      if (filters.notes &&
        !(t.notes || '').toLowerCase().includes(filters.notes.toLowerCase())) continue;
      if (filters.category &&
        !catName.toLowerCase().includes(filters.category.toLowerCase())) continue;
      if (filters.min != null && absDollars < filters.min) continue;
      if (filters.max != null && absDollars > filters.max) continue;
      if (filters.uncategorized && t.category) continue;
      if (filters.uncleared && t.cleared) continue;

      matches.push({ ...t, accountName: a.name, payeeName, catName });
    }
  }

  matches.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));
  const shown = matches.slice(0, filters.limit);

  console.log(
    `\n${matches.length} match(es)${matches.length > shown.length ? `, showing ${shown.length}` : ''}\n`,
  );

  tablePrint(shown, [
    { header: 'Date', value: (r) => r.date },
    { header: 'Account', value: (r) => r.accountName },
    { header: 'Payee', value: (r) => r.payeeName || '—' },
    { header: 'Category', value: (r) => r.catName || '(uncat)' },
    { header: 'Amount', align: 'right', value: (r) => fmtAmount(r.amount) },
    { header: 'Cleared', value: (r) => (r.cleared ? '✓' : ' ') },
    { header: 'Notes', value: (r) => (r.notes || '').slice(0, 40) },
  ]);

  const total = matches.reduce((s, t) => s + t.amount, 0);
  console.log(`\nTotal across all matches: ${fmtAmount(total)}`);
});
