// Fix duplicate transactions: for each account, find same date+amount pairs and
// delete the "worse" copy — prefer keeping cleared over uncleared, categorized
// over uncategorized, the one with a payee, etc.
//
// Usage:
//   node scripts/fix-duplicates.js            # dry-run (no changes)
//   node scripts/fix-duplicates.js --apply    # actually delete

import 'dotenv/config';
import { withBudget, fmtAmount } from './lib/actual.js';

const apply = process.argv.includes('--apply');

await withBudget(async (api) => {
  const accounts = await api.getAccounts();
  const payees   = await api.getPayees();
  const payeeMap = Object.fromEntries(payees.map(p => [p.id, p.name]));

  const now       = new Date();
  const startISO  = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1))
    .toISOString().slice(0, 10);
  const endISO    = now.toISOString().slice(0, 10);

  let totalDeleted = 0;
  let totalGroups  = 0;

  for (const acct of accounts.filter(a => !a.closed)) {
    const txns = await api.getTransactions(acct.id, startISO, endISO);

    // Group by date|amount — only top-level (no children)
    const groups = {};
    for (const t of txns) {
      if (t.is_child) continue;
      const key = `${t.date}|${t.amount}`;
      groups[key] = groups[key] || [];
      groups[key].push(t);
    }

    for (const [key, group] of Object.entries(groups)) {
      if (group.length < 2) continue;

      // Score each transaction — higher = keep
      const scored = group.map(t => ({
        t,
        score:
          (t.cleared      ? 4 : 0) +
          (t.category     ? 2 : 0) +
          (t.payee        ? 1 : 0),
      })).sort((a, b) => b.score - a.score);

      // Keep the best; delete the rest
      const toDelete = scored.slice(1).map(s => s.t);
      const keeper   = scored[0].t;
      const pName    = payeeMap[keeper.payee] || '(no payee)';
      const [date, amt] = key.split('|');

      totalGroups++;
      console.log(`\n[${acct.name}]  ${date}  ${fmtAmount(Number(amt)).padStart(10)}  ×${group.length}  ${pName}`);
      console.log(`  KEEP   id:${keeper.id}  cleared:${keeper.cleared}  cat:${keeper.category ? '✓' : '—'}`);
      for (const d of toDelete) {
        console.log(`  DELETE id:${d.id}  cleared:${d.cleared}  cat:${d.category ? '✓' : '—'}`);
        if (apply) {
          await api.deleteTransaction(d.id);
          totalDeleted++;
        }
      }
    }
  }

  console.log(`\n${'─'.repeat(60)}`);
  if (!totalGroups) {
    console.log('  No duplicate groups found.');
  } else if (apply) {
    console.log(`  Deleted ${totalDeleted} duplicate(s) across ${totalGroups} group(s).`);
  } else {
    console.log(`  Found ${totalGroups} duplicate group(s). Run with --apply to delete.`);
  }
  console.log();
});
