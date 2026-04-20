#!/usr/bin/env node
// Sync local cache with the Actual server. Optionally run bank sync as well.
// Usage:
//   node scripts/sync.js              # just sync with server
//   node scripts/sync.js --bank       # also pull new transactions from connected banks
//   node scripts/sync.js --bank ACCT  # bank-sync only the given account id (or substring of name)

import { withBudget, fmtAmount } from './lib/actual.js';

const args = process.argv.slice(2);
const runBank = args.includes('--bank');
const accountFilter = args.find((a) => !a.startsWith('--'));

await withBudget(async (api) => {
  console.log('Synced with server.');
  if (runBank) {
    const accounts = await api.getAccounts();
    const targets = accounts.filter((a) => {
      if (a.closed) return false;
      if (accountFilter) {
        return (
          a.id === accountFilter ||
          (a.name &&
            a.name.toLowerCase().includes(accountFilter.toLowerCase()))
        );
      }
      return true;
    });
    if (!targets.length) {
      console.log('No matching accounts to bank-sync.');
      return;
    }
    console.log(`Running bank sync on ${targets.length} account(s)...`);
    for (const a of targets) {
      try {
        await api.runBankSync({ accountId: a.id });
        const bal = await api.getAccountBalance(a.id);
        console.log(`  ✓ ${a.name.padEnd(30)} balance ${fmtAmount(bal)}`);
      } catch (err) {
        console.log(`  ✗ ${a.name.padEnd(30)} ${err.message}`);
      }
    }
  }
});
