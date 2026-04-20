#!/usr/bin/env node
// Find candidate transfer pairs among uncategorized transactions.
// A "pair" is two transactions on different accounts where:
//   - |amount| matches exactly
//   - signs are opposite
//   - dates are within --days days (default 4)
//
// Output: out/transfer-pairs.json with proposed wiring, plus a "leftover"
// list of uncategorized transactions whose payee is transfer-shaped but
// have no match (likely income from external accounts or one-sided entries).
//
// Usage:
//   node scripts/find-transfer-pairs.js                    # scan all uncategorized
//   node scripts/find-transfer-pairs.js --days 7           # widen date window

import fs from 'node:fs';
import path from 'node:path';
import { withBudget, fmtAmount, PROJECT_ROOT } from './lib/actual.js';

const args = process.argv.slice(2);
const arg = (k, dflt) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : dflt;
};
const dayWindow = Number(arg('--days', '4'));
const outPath =
  arg('--out') || path.join(PROJECT_ROOT, 'out', 'transfer-pairs.json');

await withBudget(async (api) => {
  const accounts = await api.getAccounts();
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const payees = await api.getPayees();
  const payeeById = new Map(payees.map((p) => [p.id, p]));
  const transferPayeeForAccount = new Map();
  for (const p of payees) {
    if (p.transfer_acct) transferPayeeForAccount.set(p.transfer_acct, p.id);
  }

  // Pull every uncategorized, non-transfer transaction across open accounts
  const all = [];
  for (const a of accounts) {
    if (a.closed) continue;
    const txs = await api.getTransactions(a.id, '1900-01-01', '2099-12-31');
    for (const t of txs) {
      if (t.transfer_id) continue;
      if (t.category) continue;
      if (t.amount === 0) continue;
      all.push({ ...t, accountId: a.id, accountName: a.name });
    }
  }

  // Index by absolute amount for fast lookup
  const byAmount = new Map();
  for (const t of all) {
    const key = Math.abs(t.amount);
    if (!byAmount.has(key)) byAmount.set(key, []);
    byAmount.get(key).push(t);
  }

  const pairs = [];
  const usedIds = new Set();
  for (const t of all) {
    if (usedIds.has(t.id)) continue;
    const peers = byAmount.get(Math.abs(t.amount)) || [];
    for (const u of peers) {
      if (u.id === t.id || usedIds.has(u.id)) continue;
      if (u.accountId === t.accountId) continue;
      if (Math.sign(u.amount) === Math.sign(t.amount)) continue;
      const dDiff =
        Math.abs(new Date(u.date) - new Date(t.date)) / (1000 * 60 * 60 * 24);
      if (dDiff > dayWindow) continue;

      // Lock in this pair
      const outflow = t.amount < 0 ? t : u;
      const inflow = t.amount > 0 ? t : u;
      pairs.push({
        amountCents: Math.abs(t.amount),
        amount: api.utils.integerToAmount(Math.abs(t.amount)),
        dayGap: dDiff,
        outflow: {
          id: outflow.id,
          date: outflow.date,
          account: outflow.accountName,
          accountId: outflow.accountId,
          payee: outflow.payee
            ? payeeById.get(outflow.payee)?.name || '[deleted]'
            : '(no payee)',
          payeeId: outflow.payee || null,
          notes: outflow.notes || null,
        },
        inflow: {
          id: inflow.id,
          date: inflow.date,
          account: inflow.accountName,
          accountId: inflow.accountId,
          payee: inflow.payee
            ? payeeById.get(inflow.payee)?.name || '[deleted]'
            : '(no payee)',
          payeeId: inflow.payee || null,
          notes: inflow.notes || null,
        },
        // Proposed wiring: each side should use the OTHER account's transfer payee.
        proposedWiring: {
          outflowSidePayeeId: transferPayeeForAccount.get(inflow.accountId),
          inflowSidePayeeId: transferPayeeForAccount.get(outflow.accountId),
        },
      });
      usedIds.add(t.id);
      usedIds.add(u.id);
      break;
    }
  }

  // Leftovers: uncategorized payees that look transfer-ish but unmatched
  const TRANSFER_PATTERN =
    /payment|transfer|recd|recurring|thank you|onetimepayment|zelle|paypal/i;
  const leftovers = all
    .filter(
      (t) => !usedIds.has(t.id) && t.payee && TRANSFER_PATTERN.test(
        payeeById.get(t.payee)?.name || '',
      ),
    )
    .map((t) => ({
      id: t.id,
      date: t.date,
      account: t.accountName,
      payee: payeeById.get(t.payee)?.name,
      amount: api.utils.integerToAmount(t.amount),
      notes: t.notes,
    }))
    .sort((a, b) => a.date < b.date ? 1 : -1);

  const out = {
    generatedAt: new Date().toISOString(),
    dayWindow,
    totalPairs: pairs.length,
    totalLeftovers: leftovers.length,
    instructions:
      'Review pairs. Run `node scripts/apply-transfer-pairs.js out/transfer-pairs.json` to dry-run, then add --apply to wire them as transfers in Actual.',
    pairs: pairs.sort((a, b) => b.amountCents - a.amountCents),
    leftoversNeedingAttention: leftovers,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

  console.log(`\nFound ${pairs.length} candidate transfer pair(s).`);
  console.log(`${leftovers.length} unmatched transfer-shaped leftover(s).\n`);
  console.log('Pair preview:');
  for (const p of pairs.slice(0, 30)) {
    console.log(
      `  ${p.outflow.date} → ${p.inflow.date}  ${fmtAmount(-p.amountCents).padStart(11)}  ` +
        `${p.outflow.account.padEnd(28)} → ${p.inflow.account.padEnd(28)}  ` +
        `[${p.outflow.payee} / ${p.inflow.payee}]`,
    );
  }
  if (pairs.length > 30) console.log(`  ... and ${pairs.length - 30} more`);
  console.log(`\nWrote ${outPath}`);
});
