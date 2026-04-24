// Fix unlinked transfer transactions: find transactions whose payee is a
// transfer payee (payee.transfer_acct is set) but which have no transfer_id,
// match them to their counterpart in the other account, then link both sides.
//
// Usage:
//   node scripts/fix-unlinked-transfers.js           # dry-run
//   node scripts/fix-unlinked-transfers.js --apply   # link transfers

import 'dotenv/config';
import { withBudget, fmtAmount } from './lib/actual.js';

const apply = process.argv.includes('--apply');

const now       = new Date();
const startISO  = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1))
  .toISOString().slice(0, 10);
const endISO    = now.toISOString().slice(0, 10);

await withBudget(async (api) => {
  const accounts = await api.getAccounts();
  const payees   = await api.getPayees();

  // Map payee id → payee (for quick lookup)
  const payeeById  = Object.fromEntries(payees.map(p => [p.id, p]));
  // Map transfer_acct → payee (so we can find "the payee that represents account X")
  const payeeByAcct = Object.fromEntries(
    payees.filter(p => p.transfer_acct).map(p => [p.transfer_acct, p])
  );

  // Fetch all unlinked transfer transactions grouped by account
  const unlinkedByAcct = {};
  for (const acct of accounts.filter(a => !a.closed)) {
    const txns = await api.getTransactions(acct.id, startISO, endISO);
    const unlinked = txns.filter(t =>
      !t.transfer_id &&
      !t.is_child &&
      t.payee &&
      payeeById[t.payee]?.transfer_acct
    );
    if (unlinked.length) unlinkedByAcct[acct.id] = { acct, unlinked };
  }

  const acctById = Object.fromEntries(accounts.map(a => [a.id, a]));

  let linked = 0;
  let orphan = 0;
  const processed = new Set();

  for (const { acct, unlinked } of Object.values(unlinkedByAcct)) {
    for (const txn of unlinked) {
      if (processed.has(txn.id)) continue;

      const otherAcctId = payeeById[txn.payee].transfer_acct;
      const otherAcct   = acctById[otherAcctId];
      if (!otherAcct) continue;

      // Look for the matching counterpart in the other account:
      // negated amount, payee points back to this account, same date OR ±1 day
      const expectedAmount = -txn.amount;
      const backPayeeId    = payeeByAcct[acct.id]?.id;

      const txnDate = new Date(txn.date);
      const nearbyDates = new Set([-1, 0, 1].map(d => {
        const dd = new Date(txnDate);
        dd.setUTCDate(dd.getUTCDate() + d);
        return dd.toISOString().slice(0, 10);
      }));

      const otherSide = unlinkedByAcct[otherAcctId]?.unlinked.find(t =>
        !processed.has(t.id) &&
        nearbyDates.has(t.date) &&
        t.amount === expectedAmount &&
        t.payee  === backPayeeId
      );

      const fromName = acct.name;
      const toName   = otherAcct.name;

      if (otherSide) {
        console.log(`\nLINK  ${txn.date}  ${fmtAmount(txn.amount).padStart(10)}`);
        console.log(`      [${fromName}] id:${txn.id}`);
        console.log(`   ↔  [${toName}]  id:${otherSide.id}`);
        if (apply) {
          await api.updateTransaction(txn.id,       { transfer_id: otherSide.id });
          await api.updateTransaction(otherSide.id, { transfer_id: txn.id });
          linked++;
        }
        processed.add(txn.id);
        processed.add(otherSide.id);
      } else {
        // Wider search: look for matching amount in the target account regardless of payee
        const otherTxns = await api.getTransactions(otherAcctId, startISO, endISO);
        // Build a wider date window ±3 days
        const window = new Set([-3,-2,-1,0,1,2,3].map(d => {
          const dd = new Date(txnDate);
          dd.setUTCDate(dd.getUTCDate() + d);
          return dd.toISOString().slice(0, 10);
        }));
        const broadMatch = otherTxns.find(t =>
          !processed.has(t.id) &&
          !t.is_child &&
          !t.transfer_id &&
          window.has(t.date) &&
          t.amount === expectedAmount
        );
        if (broadMatch) {
          const pName = payeeById[broadMatch.payee]?.name || '(no payee)';
          console.log(`\nLINK(broad)  ${txn.date}→${broadMatch.date}  ${fmtAmount(txn.amount).padStart(10)}`);
          console.log(`      [${fromName}] id:${txn.id}  payee:${payeeById[txn.payee]?.name}`);
          console.log(`   ↔  [${toName}]  id:${broadMatch.id}  payee:${pName}`);
          if (apply) {
            // Set transfer payee on the other side too
            await api.updateTransaction(txn.id,        { transfer_id: broadMatch.id });
            await api.updateTransaction(broadMatch.id, { transfer_id: txn.id, payee: backPayeeId });
            linked++;
          }
          processed.add(txn.id);
          processed.add(broadMatch.id);
        } else {
          console.log(`\nORPHAN  ${txn.date}  ${fmtAmount(txn.amount).padStart(10)}  [${fromName}]  (no match in ${toName})`);
          orphan++;
          processed.add(txn.id);
        }
      }
    }
  }

  console.log(`\n${'─'.repeat(60)}`);
  if (!linked && !orphan && !processed.size) {
    console.log('  No unlinked transfer transactions found.');
  } else if (apply) {
    console.log(`  Linked ${linked} pair(s).  Orphan (needs manual review): ${orphan}`);
  } else {
    const pairs = processed.size > 0 ? Math.floor((processed.size - orphan) / 2) : 0;
    console.log(`  Would link ${pairs} pair(s).  Orphans: ${orphan}.  Run with --apply to proceed.`);
  }
  console.log();
});
