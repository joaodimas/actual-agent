#!/usr/bin/env node
// Apply a payee → category mapping (from a JSON file produced by export-uncategorized.js,
// after suggested_category is filled in) to all matching uncategorized transactions.
//
// Usage:
//   node scripts/apply-categorization-map.js out/uncategorized.json           # dry run
//   node scripts/apply-categorization-map.js out/uncategorized.json --apply   # actually update
//   node scripts/apply-categorization-map.js out/uncategorized.json --apply --rules
//      # additionally create Actual Rules so future imports auto-categorize.

import fs from 'node:fs';
import path from 'node:path';
import { withBudget } from './lib/actual.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const createRules = args.includes('--rules');
const file = args.find((a) => !a.startsWith('--')) || 'out/uncategorized.json';

if (!fs.existsSync(file)) {
  console.error(`File not found: ${file}`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(file, 'utf8'));

await withBudget(async (api) => {
  const cats = await api.getCategories();
  const catByName = new Map(cats.map((c) => [c.name.toLowerCase(), c]));

  const planned = [];
  const skipped = [];
  for (const p of data.payees) {
    if (!p.suggested_category) {
      skipped.push({ payee: p.payeeName, reason: 'no suggestion' });
      continue;
    }
    const cat = catByName.get(p.suggested_category.toLowerCase());
    if (!cat) {
      skipped.push({
        payee: p.payeeName,
        reason: `category "${p.suggested_category}" not found`,
      });
      continue;
    }
    planned.push({
      payee: p.payeeName,
      payeeId: p.payeeId,
      category: cat,
      txCount: p.transactionCount,
      txIds: p.transactionIds,
      total: p.totalAmount,
    });
  }

  console.log(`\nDry run: ${file}`);
  console.log(`  Planned categorizations: ${planned.length} payees, ${planned.reduce((s, p) => s + p.txCount, 0)} transactions`);
  console.log(`  Skipped: ${skipped.length} payees`);
  console.log('');
  for (const p of planned) {
    console.log(
      `  → ${p.payee.padEnd(45)} ${String(p.txCount).padStart(3)}tx  $${p.total.toFixed(2).padStart(10)}  →  ${p.category.name}`,
    );
  }
  if (skipped.length) {
    console.log('\nSkipped:');
    for (const s of skipped) console.log(`  · ${s.payee.padEnd(45)} ${s.reason}`);
  }

  if (!apply) {
    console.log(`\nDry-run only. Re-run with --apply to write changes.`);
    return;
  }

  let txOk = 0;
  let txFail = 0;
  for (const p of planned) {
    for (const id of p.txIds) {
      try {
        await api.updateTransaction(id, { category: p.category.id });
        txOk += 1;
      } catch (err) {
        txFail += 1;
        console.error(`  ✗ tx ${id}: ${err.message}`);
      }
    }
  }
  console.log(`\nTransactions updated: ${txOk}.  Failed: ${txFail}.`);

  if (createRules) {
    let ruleOk = 0;
    let ruleFail = 0;
    for (const p of planned) {
      if (!p.payeeId) continue;
      try {
        await api.createRule({
          stage: 'pre',
          conditionsOp: 'and',
          conditions: [
            { field: 'payee', op: 'is', value: p.payeeId },
          ],
          actions: [
            { op: 'set', field: 'category', value: p.category.id },
          ],
        });
        ruleOk += 1;
      } catch (err) {
        ruleFail += 1;
        console.error(`  ✗ rule for ${p.payee}: ${err.message}`);
      }
    }
    console.log(`Rules created:  ${ruleOk}.  Failed: ${ruleFail}.`);
  } else {
    console.log(`(Re-run with --rules to also create Actual import rules so future transactions for these payees auto-categorize.)`);
  }
});
