#!/usr/bin/env node
// Add a single transaction quickly. Designed to be called by the agent
// after gathering details from the user in chat.
//
// Usage:
//   node scripts/add-transaction.js \
//     --account "Chase Checking" \
//     --date 2026-04-18 \
//     --amount -42.50 \
//     --payee "Whole Foods" \
//     --category "Groceries" \
//     --notes "weekly run" \
//     --cleared
//
// Notes:
//   --account, --date, and --amount are required.
//   --amount is in dollars (negative for expense, positive for income).
//   --payee uses payee_name (creates if missing). Use --payee-id to pass an exact id.
//   --category uses an exact (case-insensitive) category name match.

import { withBudget } from './lib/actual.js';
import api from '@actual-app/api';

const args = process.argv.slice(2);
const arg = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (k) => args.includes(k);

const accountQuery = arg('--account');
const date = arg('--date');
const amountStr = arg('--amount');
const payeeName = arg('--payee');
const payeeId = arg('--payee-id');
const categoryName = arg('--category');
const notes = arg('--notes');
const importedId = arg('--imported-id');
const cleared = flag('--cleared');

if (!accountQuery || !date || amountStr == null) {
  console.error('Required: --account, --date, --amount');
  process.exit(1);
}

const dollars = Number(amountStr);
if (Number.isNaN(dollars)) {
  console.error('--amount must be a number (e.g. -42.50)');
  process.exit(1);
}

await withBudget(async (api) => {
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
    console.error('Available:');
    for (const a of accounts.filter((a) => !a.closed)) {
      console.error(`  ${a.name} [${a.id}]`);
    }
    process.exit(1);
  }

  let categoryId;
  if (categoryName) {
    const cats = await api.getCategories();
    const cat = cats.find(
      (c) => c.name && c.name.toLowerCase() === categoryName.toLowerCase(),
    );
    if (!cat) {
      console.error(`Category not found: "${categoryName}"`);
      process.exit(1);
    }
    categoryId = cat.id;
  }

  const tx = {
    account: account.id,
    date,
    amount: api.utils.amountToInteger(dollars),
    cleared,
  };
  if (payeeId) tx.payee = payeeId;
  else if (payeeName) tx.payee_name = payeeName;
  if (categoryId) tx.category = categoryId;
  if (notes) tx.notes = notes;
  if (importedId) tx.imported_id = importedId;

  const ids = await api.addTransactions(account.id, [tx]);
  console.log(`✓ Added transaction ${ids[0]} on ${account.name}`);
});
