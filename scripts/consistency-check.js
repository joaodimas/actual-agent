#!/usr/bin/env node
// Budget consistency check — surfaces data reliability issues.
//
// Usage:
//   node scripts/consistency-check.js                   # checks only, no bank sync
//   node scripts/consistency-check.js --bank            # run SimpleFIN sync first (needed for balance comparison)
//   node scripts/consistency-check.js --since 2026-01-01
//   node scripts/consistency-check.js --account "Chase"

import { withBudget, fmtAmount, tablePrint, withSilencedStdout } from './lib/actual.js';

const args = process.argv.slice(2);
const flag = (k) => args.includes(k);
const argVal = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };

const runBank = flag('--bank');
const accountFilter = args.find((a) => !a.startsWith('--'));

const sinceDate = argVal('--since') || (() => {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d.toISOString().slice(0, 10);
})();

const today = new Date().toISOString().slice(0, 10);

const thirtyDaysAgo = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
})();

let issueCount = 0;

function section(n, title) {
  console.log(`\n${'─'.repeat(64)}`);
  console.log(`  ${n}. ${title}`);
  console.log('─'.repeat(64));
}

function ok(msg) { console.log(`  ✓  ${msg}`); }
function warn(msg) { console.log(`  ⚠  ${msg}`); issueCount++; }
function bad(msg) { console.log(`  ✗  ${msg}`); issueCount++; }

await withBudget(async (api) => {
  const allAccounts = await api.getAccounts();
  const accounts = allAccounts.filter((a) => {
    if (a.closed) return false;
    if (accountFilter) {
      return (
        a.id === accountFilter ||
        (a.name && a.name.toLowerCase().includes(accountFilter.toLowerCase()))
      );
    }
    return true;
  });

  if (!accounts.length) {
    console.log('No matching open accounts found.');
    return;
  }

  // ── 1. ACCOUNT BALANCES ─────────────────────────────────────────────────
  section(1, `ACCOUNT BALANCES${runBank ? ' (after SimpleFIN sync)' : ' (local — run with --bank to compare vs SimpleFIN)'}`);

  for (const a of accounts) {
    let bankSyncErr = null;

    if (runBank) {
      try {
        await withSilencedStdout(() => api.runBankSync({ accountId: a.id }));
      } catch (err) {
        bankSyncErr = err.message;
      }
    }

    // Re-fetch account to get updated balance_current after sync
    const refreshed = (await api.getAccounts()).find((x) => x.id === a.id);
    // Pass today as cutoff so same-day adjustments are included
    const actualBalance = await api.getAccountBalance(a.id, today);

    if (!runBank) {
      console.log(`  –  ${a.name.padEnd(30)} ${fmtAmount(actualBalance)}`);
      continue;
    }

    if (bankSyncErr) {
      console.log(`  –  ${a.name.padEnd(30)} ${fmtAmount(actualBalance)}  (no bank connection: ${bankSyncErr.split('\n')[0]})`);
      continue;
    }

    // balance_current is set by bank sync — stored in integer cents like all other Actual amounts
    const bankBalance = refreshed?.balance_current ?? null;

    if (bankBalance == null) {
      console.log(`  –  ${a.name.padEnd(30)} ${fmtAmount(actualBalance)}  (bank did not report a balance)`);
    } else {
      const diff = actualBalance - bankBalance;
      if (Math.abs(diff) <= 1) {
        ok(`${a.name.padEnd(30)} ${fmtAmount(actualBalance)} matches bank`);
      } else {
        bad(`${a.name.padEnd(30)} Actual ${fmtAmount(actualBalance)} vs bank ${fmtAmount(bankBalance)} → diff ${fmtAmount(diff)}`);
      }
    }
  }

  // ── Load transactions for all remaining checks ───────────────────────────
  const payees = await api.getPayees();
  const payeeById = new Map(payees.map((p) => [p.id, p]));
  const cats = await api.getCategories();
  const catById = new Map(cats.map((c) => [c.id, c]));

  const allTxs = [];
  for (const a of accounts) {
    const txs = await api.getTransactions(a.id, sinceDate, today);
    for (const t of txs) {
      allTxs.push({ ...t, accountName: a.name });
    }
  }

  // Build transfer-id → partner-account map so we can detect off-budget transfers
  const txById = new Map(allTxs.map((t) => [t.id, t]));
  const offBudgetIds = new Set(
    accounts.filter((a) => a.offbudget).map((a) => a.id),
  );
  // Off-budget accounts may not be in the filtered `accounts` list — also load their transactions
  for (const a of allAccounts.filter((a) => !a.closed && a.offbudget)) {
    if (offBudgetIds.has(a.id) && !accounts.find((x) => x.id === a.id)) {
      const txs = await api.getTransactions(a.id, sinceDate, today);
      for (const t of txs) txById.set(t.id, { ...t, accountName: a.name });
    }
  }
  const isTransferToOffBudget = (t) => {
    if (!t.transfer_id) return false;
    const partner = txById.get(t.transfer_id);
    return partner != null && offBudgetIds.has(partner.account);
  };

  // ── 2. UNCATEGORIZED TRANSACTIONS ───────────────────────────────────────
  section(2, `UNCATEGORIZED TRANSACTIONS (since ${sinceDate})`);

  // Include transfers to off-budget accounts — those are real expenses needing a category
  const uncategorized = allTxs.filter(
    (t) =>
      !t.category &&
      t.amount !== 0 &&
      (!t.transfer_id || isTransferToOffBudget(t)),
  );

  if (!uncategorized.length) {
    ok('No uncategorized transactions');
  } else {
    bad(`${uncategorized.length} uncategorized transaction(s)`);

    const byAccount = {};
    for (const t of uncategorized) {
      (byAccount[t.accountName] ??= []).push(t);
    }

    for (const [acct, txs] of Object.entries(byAccount)) {
      const shown = txs.slice(0, 15);
      console.log(`\n  Account: ${acct} (${txs.length})`);
      tablePrint(shown, [
        { header: 'Date', value: (r) => r.date },
        { header: 'Payee', value: (r) => (r.payee ? payeeById.get(r.payee)?.name || '—' : '—') },
        { header: 'Amount', align: 'right', value: (r) => fmtAmount(r.amount) },
        { header: 'Cleared', value: (r) => (r.cleared ? '✓' : ' ') },
        { header: 'Notes', value: (r) => (r.notes || '').slice(0, 35) },
      ]);
      if (txs.length > 15) console.log(`    … and ${txs.length - 15} more`);
    }
  }

  // ── 3. DUPLICATE TRANSACTIONS ────────────────────────────────────────────
  section(3, `DUPLICATE TRANSACTIONS (since ${sinceDate})`);

  // 3a. Same imported_id within same account — definitive duplicates
  const byImportedId = {};
  for (const t of allTxs) {
    if (!t.imported_id) continue;
    const key = `${t.account}::${t.imported_id}`;
    (byImportedId[key] ??= []).push(t);
  }
  const importedDupes = Object.values(byImportedId).filter((g) => g.length > 1);

  // 3b. Same date + amount + payee within same account — probable duplicates
  const bySig = {};
  for (const t of allTxs) {
    if (t.transfer_id) continue;
    const payeeName = t.payee ? (payeeById.get(t.payee)?.name ?? '') : '';
    const key = `${t.account}|${t.date}|${t.amount}|${payeeName}`;
    (bySig[key] ??= []).push(t);
  }
  const sigDupes = Object.values(bySig).filter((g) => g.length > 1);

  if (!importedDupes.length && !sigDupes.length) {
    ok('No duplicates detected');
  } else {
    if (importedDupes.length) {
      bad(`${importedDupes.length} definitive duplicate(s) — same imported_id:`);
      for (const g of importedDupes) {
        const t = g[0];
        const payeeName = t.payee ? (payeeById.get(t.payee)?.name ?? '—') : '—';
        console.log(`    ${t.accountName}: ${t.date}  ${payeeName}  ${fmtAmount(t.amount)}  (×${g.length})`);
      }
    }

    if (sigDupes.length) {
      warn(`${sigDupes.length} probable duplicate(s) — same date + amount + payee:`);
      for (const g of sigDupes.slice(0, 10)) {
        const t = g[0];
        const payeeName = t.payee ? (payeeById.get(t.payee)?.name ?? '—') : '—';
        const catName = t.category ? (catById.get(t.category)?.name ?? '—') : '(uncat)';
        console.log(`    ${t.accountName}: ${t.date}  ${payeeName}  ${fmtAmount(t.amount)}  ${catName}  (×${g.length})`);
      }
      if (sigDupes.length > 10) console.log(`    … and ${sigDupes.length - 10} more`);
    }
  }

  // ── 4. STALE UNCLEARED TRANSACTIONS ──────────────────────────────────────
  section(4, 'STALE UNCLEARED TRANSACTIONS (older than 30 days)');

  const staleUncleared = allTxs.filter(
    (t) => !t.cleared && !t.transfer_id && t.date < thirtyDaysAgo,
  );

  if (!staleUncleared.length) {
    ok('No stale uncleared transactions');
  } else {
    warn(`${staleUncleared.length} uncleared transaction(s) older than 30 days:`);
    tablePrint(staleUncleared.slice(0, 20), [
      { header: 'Date', value: (r) => r.date },
      { header: 'Account', value: (r) => r.accountName },
      { header: 'Payee', value: (r) => (r.payee ? payeeById.get(r.payee)?.name || '—' : '—') },
      { header: 'Amount', align: 'right', value: (r) => fmtAmount(r.amount) },
      { header: 'Category', value: (r) => (r.category ? catById.get(r.category)?.name || '—' : '(uncat)') },
    ]);
    if (staleUncleared.length > 20) console.log(`  … and ${staleUncleared.length - 20} more`);
  }

  // ── 5. SPLIT TRANSACTION INTEGRITY ──────────────────────────────────────
  section(5, `SPLIT TRANSACTION INTEGRITY (since ${sinceDate})`);

  const splitParents = allTxs.filter((t) => t.subtransactions?.length > 0);
  let splitIssues = 0;

  for (const t of splitParents) {
    const subTotal = t.subtransactions.reduce((s, sub) => s + sub.amount, 0);
    if (subTotal !== t.amount) {
      bad(`Split mismatch on ${t.date} in ${t.accountName}: parent ${fmtAmount(t.amount)}, parts sum to ${fmtAmount(subTotal)}`);
      splitIssues++;
    }
  }

  if (!splitIssues) {
    ok(`${splitParents.length} split transaction(s) — all balanced`);
  }

  // ── SUMMARY ──────────────────────────────────────────────────────────────
  section('', 'SUMMARY');
  if (!issueCount) {
    console.log('  ✓  All checks passed — budget data looks clean!\n');
  } else {
    console.log(`  ${issueCount} issue(s) found. See sections above for details.\n`);
  }
});
