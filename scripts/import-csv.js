#!/usr/bin/env node
// Import transactions from a CSV file. Uses importTransactions so duplicates
// (by imported_id or fuzzy match) are skipped and rules are applied.
//
// CSV columns (case-insensitive headers):
//   date         (YYYY-MM-DD or M/D/YYYY)            REQUIRED
//   amount       (number; sign convention follows --convention)   REQUIRED
//   payee        (string)
//   notes / memo / description (string)
//   category     (exact case-insensitive name match; optional)
//   imported_id / id (string; recommended to dedupe)
//
// Usage:
//   node scripts/import-csv.js --account "Chase Checking" path/to/file.csv
//   node scripts/import-csv.js --account "Chase" --convention spend-positive transactions.csv
//   node scripts/import-csv.js --account "Chase" --dry-run transactions.csv

import fs from 'node:fs';
import path from 'node:path';
import { withBudget } from './lib/actual.js';

const args = process.argv.slice(2);
const arg = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (k) => args.includes(k);

const accountQuery = arg('--account');
const convention = arg('--convention') || 'expense-negative'; // or 'spend-positive'
const dryRun = flag('--dry-run');
const file = args.find((a) => !a.startsWith('--') && fs.existsSync(a));

if (!accountQuery || !file) {
  console.error('Usage: node scripts/import-csv.js --account "<name>" <file.csv>');
  process.exit(1);
}

function parseCSV(text) {
  // Minimal CSV parser supporting quoted fields and embedded commas/quotes.
  const rows = [];
  let row = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuote = false;
        }
      } else cur += ch;
    } else if (ch === '"') {
      inQuote = true;
    } else if (ch === ',') {
      row.push(cur);
      cur = '';
    } else if (ch === '\n') {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else if (ch === '\r') {
      // ignore
    } else cur += ch;
  }
  if (cur.length || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0]));
}

function normalizeDate(s) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const [, mo, d, y] = m;
    const yy = y.length === 2 ? `20${y}` : y;
    return `${yy}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return s;
}

await withBudget(async (api) => {
  const text = fs.readFileSync(path.resolve(file), 'utf8');
  const [header, ...dataRows] = parseCSV(text);
  const idx = (name) =>
    header.findIndex((h) => h.trim().toLowerCase() === name);

  const dateIdx = idx('date');
  const amountIdx = idx('amount');
  const payeeIdx = idx('payee');
  const notesIdx = ['notes', 'memo', 'description']
    .map(idx)
    .find((i) => i >= 0);
  const catIdx = idx('category');
  const importedIdIdx = idx('imported_id') >= 0 ? idx('imported_id') : idx('id');

  if (dateIdx < 0 || amountIdx < 0) {
    console.error('CSV must have at least "date" and "amount" columns.');
    process.exit(1);
  }

  const accounts = await api.getAccounts();
  const account =
    accounts.find((a) => a.id === accountQuery) ||
    accounts.find(
      (a) => a.name && a.name.toLowerCase() === accountQuery.toLowerCase(),
    ) ||
    accounts.find(
      (a) =>
        a.name &&
        a.name.toLowerCase().includes(accountQuery.toLowerCase()),
    );
  if (!account) {
    console.error(`Account not found: "${accountQuery}"`);
    process.exit(1);
  }

  const cats = await api.getCategories();
  const catByName = new Map(
    cats.map((c) => [c.name.toLowerCase(), c.id]),
  );

  const transactions = [];
  for (const row of dataRows) {
    if (!row[dateIdx] || !row[amountIdx]) continue;
    const date = normalizeDate(row[dateIdx].trim());
    let amt = Number(row[amountIdx].replace(/[$,]/g, ''));
    if (Number.isNaN(amt)) continue;
    if (convention === 'spend-positive') amt = -amt;
    const tx = {
      date,
      amount: api.utils.amountToInteger(amt),
    };
    if (payeeIdx >= 0 && row[payeeIdx]) tx.payee_name = row[payeeIdx].trim();
    if (notesIdx != null && notesIdx >= 0 && row[notesIdx]) tx.notes = row[notesIdx].trim();
    if (importedIdIdx >= 0 && row[importedIdIdx]) tx.imported_id = row[importedIdIdx].trim();
    if (catIdx >= 0 && row[catIdx]) {
      const id = catByName.get(row[catIdx].trim().toLowerCase());
      if (id) tx.category = id;
    }
    transactions.push(tx);
  }

  console.log(`Parsed ${transactions.length} transactions from ${file}`);
  console.log(`Target account: ${account.name}`);
  console.log(`Convention:     ${convention}`);
  console.log(`Dry run:        ${dryRun ? 'yes' : 'no'}`);

  const result = await api.importTransactions(account.id, transactions, {
    dryRun,
  });
  console.log(`\nResults:`);
  console.log(`  added:   ${result.added?.length ?? 0}`);
  console.log(`  updated: ${result.updated?.length ?? 0}`);
  if (result.errors?.length) {
    console.log(`  errors:  ${result.errors.length}`);
    for (const e of result.errors) console.log(`    - ${JSON.stringify(e)}`);
  }
});
