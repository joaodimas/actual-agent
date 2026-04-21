// Query SimpleFIN directly to fetch raw transactions for one or all accounts.
// Usage:
//   node scripts/simplefin.js                        # all accounts, last 30 days
//   node scripts/simplefin.js --account "Chase"      # name substring filter
//   node scripts/simplefin.js --from 2026-03-01      # custom start date
//   node scripts/simplefin.js --from 2026-03-01 --to 2026-03-31
//   node scripts/simplefin.js --compare              # diff vs Actual (requires Actual too)
//
// Requires SIMPLEFIN_ACCESS_URL in .env, e.g.:
//   SIMPLEFIN_ACCESS_URL=https://TOKEN@bridge.simplefin.org/simplefin

import 'dotenv/config';

const args      = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] || null : null; };
const acctFilter = getArg('--account');
const fromArg    = getArg('--from');
const toArg      = getArg('--to');
const compare   = args.includes('--compare');

const ACCESS_URL = process.env.SIMPLEFIN_ACCESS_URL;
if (!ACCESS_URL) {
  console.error('Missing SIMPLEFIN_ACCESS_URL in .env');
  process.exit(1);
}

const fromDate = fromArg ? new Date(fromArg) : (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d; })();
const toDate   = toArg   ? new Date(toArg)   : new Date();

const startTs = Math.floor(fromDate.getTime() / 1000);
const endTs   = Math.floor(toDate.getTime()   / 1000);

// Extract credentials from URL (fetch rejects URLs with embedded auth)
const parsedAccess = new URL(ACCESS_URL);
const basicAuth = Buffer.from(`${parsedAccess.username}:${parsedAccess.password}`).toString('base64');
parsedAccess.username = '';
parsedAccess.password = '';
const base = parsedAccess.toString().replace(/\/?$/, '/');
const accountsUrl = new URL(`${base}accounts`);
accountsUrl.searchParams.set('start-date', startTs);
accountsUrl.searchParams.set('end-date', endTs);

const res = await fetch(accountsUrl.toString(), {
  headers: { Authorization: `Basic ${basicAuth}` },
});
if (!res.ok) {
  console.error(`SimpleFIN request failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}

const data = await res.json();

const accounts = (data.accounts || []).filter(a =>
  acctFilter ? a.org?.name?.toLowerCase().includes(acctFilter.toLowerCase()) ||
               a.name?.toLowerCase().includes(acctFilter.toLowerCase()) : true
);

if (!compare) {
  // Plain display mode
  for (const acct of accounts) {
    const bal = acct.balance != null ? `$${Number(acct.balance).toFixed(2)}` : '—';
    console.log(`\n── ${acct.name} (${acct.org?.name}) — balance: ${bal}`);
    const txns = (acct.transactions || []).sort((a, b) => b.posted - a.posted);
    if (!txns.length) { console.log('  (no transactions)'); continue; }
    console.log('  Date        Amount      ID                                  Description');
    console.log('  ----------  ----------  ----------------------------------  --------------------');
    for (const t of txns) {
      const date = new Date(t.posted * 1000).toISOString().slice(0, 10);
      const amt  = `$${Number(t.amount).toFixed(2)}`.padStart(10);
      const id   = (t.id || '').slice(0, 34).padEnd(34);
      const desc = (t.description || t.payee || '').slice(0, 50);
      console.log(`  ${date}  ${amt}  ${id}  ${desc}`);
    }
    console.log(`  Total: ${txns.length} transaction(s)`);
  }
} else {
  // Compare mode: diff SimpleFIN vs Actual
  const { withBudget } = await import('./lib/actual.js');

  await withBudget(async (api) => {
    const actualAccounts = await api.getAccounts();
    const payees = await api.getPayees();
    const payeeMap = Object.fromEntries(payees.map(p => [p.id, p.name]));

    for (const sfAcct of accounts) {
      // Try to match to an Actual account by name
      const sfName = (sfAcct.name || sfAcct.org?.name || '').toLowerCase();
      const actualAcct = actualAccounts.find(a =>
        sfName.includes(a.name.toLowerCase().split(' ')[0].toLowerCase()) ||
        a.name.toLowerCase().split(' ').some(w => w.length > 3 && sfName.includes(w))
      );

      console.log(`\n── SimpleFIN: ${sfAcct.name} (${sfAcct.org?.name})`);
      if (!actualAcct) {
        console.log('  ⚠  No matching Actual account found');
        continue;
      }
      console.log(`   ↳ Matched to Actual: ${actualAcct.name}`);

      const sfTxns = (sfAcct.transactions || []).map(t => ({
        date:   new Date(t.posted * 1000).toISOString().slice(0, 10),
        amount: Math.round(Number(t.amount) * 100),
        id:     t.id,
        desc:   t.description || '',
      }));

      const fromISO = fromDate.toISOString().slice(0, 10);
      const toISO   = toDate.toISOString().slice(0, 10);
      const actualTxns = await api.getTransactions(actualAcct.id, fromISO, toISO);

      // Find SimpleFIN transactions with no matching Actual transaction (possible missing)
      const missing = sfTxns.filter(sf =>
        !actualTxns.some(a => a.amount === sf.amount && a.date === sf.date)
      );

      // Find Actual transactions that appear more than once for the same date+amount (duplicates)
      const dupMap = {};
      for (const a of actualTxns) {
        const key = `${a.date}|${a.amount}`;
        dupMap[key] = (dupMap[key] || 0) + 1;
      }
      const duplicates = actualTxns.filter(a => dupMap[`${a.date}|${a.amount}`] > 1);

      if (missing.length) {
        console.log(`  Missing in Actual (${missing.length}):`);
        missing.forEach(t => console.log(`    ${t.date}  $${(t.amount/100).toFixed(2).padStart(9)}  ${t.desc.slice(0,50)}`));
      } else {
        console.log('  ✓ No missing transactions');
      }

      if (duplicates.length) {
        console.log(`  Possible duplicates in Actual (${duplicates.length}):`);
        const shown = new Set();
        for (const a of duplicates) {
          const key = `${a.date}|${a.amount}`;
          if (shown.has(key)) continue;
          shown.add(key);
          const count = dupMap[key];
          const pName = payeeMap[a.payee] || '';
          console.log(`    ${a.date}  $${(a.amount/100).toFixed(2).padStart(9)}  ×${count}  ${pName}`);
        }
      } else {
        console.log('  ✓ No duplicates detected');
      }
    }
  });
}
