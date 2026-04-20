#!/usr/bin/env node
// Apply transfer wiring from out/transfer-pairs.json.
// For each pair, updates both transactions so their payee is the transfer
// payee for the other account. This converts them from raw uncategorized
// transactions into proper Actual transfers (so they are excluded from
// spend/income totals).
//
// Usage:
//   node scripts/apply-transfer-pairs.js out/transfer-pairs.json           # dry run
//   node scripts/apply-transfer-pairs.js out/transfer-pairs.json --apply

import fs from 'node:fs';
import { withBudget } from './lib/actual.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const file = args.find((a) => !a.startsWith('--')) || 'out/transfer-pairs.json';

if (!fs.existsSync(file)) {
  console.error(`File not found: ${file}`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(file, 'utf8'));

await withBudget(async (api) => {
  console.log(
    `\n${data.pairs.length} pair(s) to wire as transfers (apply=${apply}).\n`,
  );

  let ok = 0;
  let fail = 0;
  for (const p of data.pairs) {
    const outflowPayee = p.proposedWiring.outflowSidePayeeId;
    const inflowPayee = p.proposedWiring.inflowSidePayeeId;
    if (!outflowPayee || !inflowPayee) {
      fail += 1;
      console.error(
        `  ✗ ${p.outflow.account} ↔ ${p.inflow.account} ${p.amount}: missing transfer payee id`,
      );
      continue;
    }
    if (!apply) {
      console.log(
        `  → ${p.outflow.account.padEnd(28)} (out ${p.outflow.id.slice(0, 8)})  ⇄  ` +
          `${p.inflow.account.padEnd(28)} (in ${p.inflow.id.slice(0, 8)})  ${p.amount}`,
      );
      continue;
    }
    try {
      await api.updateTransaction(p.outflow.id, { payee: outflowPayee });
      await api.updateTransaction(p.inflow.id, { payee: inflowPayee });
      ok += 1;
    } catch (err) {
      fail += 1;
      console.error(
        `  ✗ ${p.outflow.account} ↔ ${p.inflow.account} ${p.amount}: ${err.message}`,
      );
    }
  }

  if (apply) {
    console.log(`\nWired:  ${ok}.  Failed: ${fail}.`);
  } else {
    console.log(
      `\nDry-run only. Re-run with --apply to wire these as transfers in Actual.`,
    );
  }
});
