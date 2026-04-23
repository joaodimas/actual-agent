#!/usr/bin/env node
// Budget consistency check — surfaces data reliability issues.
//
// Usage:
//   node scripts/consistency-check.js                   # checks only, no bank sync
//   node scripts/consistency-check.js --bank            # run SimpleFIN sync first (needed for balance comparison)
//   node scripts/consistency-check.js --since 2026-01-01
//   node scripts/consistency-check.js --account "Chase"

import { withBudget, fmtAmount, tablePrint, withSilencedStdout } from './lib/actual.js';
import { fetchTransactionIds } from './lib/simplefin.js';

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

  // Load payees/categories early — needed for balance investigation output
  const payees = await api.getPayees();
  const payeeById = new Map(payees.map((p) => [p.id, p]));
  const cats = await api.getCategories();
  const catById = new Map(cats.map((c) => [c.id, c]));

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

    // Compute cleared-only balance — SimpleFIN reports posted (cleared) balance only
    const acctTxns = await api.getTransactions(a.id, '2000-01-01', today);
    const unclearedSum = acctTxns
      .filter((t) => !t.cleared && !t.is_parent)
      .reduce((s, t) => s + t.amount, 0);
    const clearedBalance = actualBalance - unclearedSum;

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
      const diff = clearedBalance - bankBalance;
      const totalDiff = actualBalance - bankBalance;
      const pendingNote = unclearedSum !== 0 ? `  (${fmtAmount(unclearedSum)} pending)` : '';
      if (Math.abs(diff) <= 1) {
        ok(`${a.name.padEnd(30)} ${fmtAmount(clearedBalance)} matches bank${pendingNote}`);
      } else if (Math.abs(totalDiff) <= 1) {
        // SimpleFIN reports available balance (includes pending) for this account
        ok(`${a.name.padEnd(30)} ${fmtAmount(actualBalance)} matches bank (incl. pending)${pendingNote}`);
      } else {
        bad(`${a.name.padEnd(30)} cleared ${fmtAmount(clearedBalance)} vs bank ${fmtAmount(bankBalance)} → diff ${fmtAmount(diff)}${pendingNote}`);

        // ── Auto-investigation ───────────────────────────────────────────
        if (Math.abs(totalDiff) < Math.abs(diff)) {
          console.log(`     ↳ Total balance (incl. pending) is closer: ${fmtAmount(actualBalance)} vs bank ${fmtAmount(bankBalance)} (residual ${fmtAmount(totalDiff)})`);
        }


        // 2. Does any single pending transaction explain the diff?
        const uncleared = acctTxns.filter((t) => !t.cleared && !t.is_parent);
        const matchingPending = uncleared.find((t) => Math.abs(t.amount - diff) <= 1);
        if (matchingPending) {
          const pPayee = matchingPending.payee ? (payeeById.get(matchingPending.payee)?.name ?? '') : (matchingPending.notes ?? '');
          console.log(`     ↳ Pending transaction matches diff exactly: ${matchingPending.date} ${pPayee} ${fmtAmount(matchingPending.amount)} — likely already posted at bank.`);
        }

        // 3. Show all pending transactions for this account
        if (uncleared.length) {
          console.log(`     ↳ Pending transactions:`);
          for (const t of uncleared) {
            const pPayee = t.payee ? (payeeById.get(t.payee)?.name ?? '') : (t.notes ?? '—');
            console.log(`        ${t.date}  ${pPayee.padEnd(35)}  ${fmtAmount(t.amount)}`);
          }
        }

        // 4. Check for manual (non-imported) opening balance
        const manualTxns = acctTxns.filter((t) => !t.imported_id && !t.is_parent && !t.transfer_id);
        if (manualTxns.length) {
          console.log(`     ↳ Manual (non-imported) transactions — opening balance may be off:`);
          for (const t of manualTxns) {
            console.log(`        ${t.date}  ${fmtAmount(t.amount)}  (manual)`);
          }
        }
      }
    }
  }

  // ── Load transactions for all remaining checks ───────────────────────────
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

    // Load all rules and all transactions (for payee history) once
    const rules = await api.getRules();
    const allAccountIds = allAccounts.filter((a) => !a.closed).map((a) => a.id);
    const historyTxs = [];
    for (const id of allAccountIds) {
      const txs = await api.getTransactions(id, '2020-01-01', today);
      for (const t of txs) if (t.category && t.payee) historyTxs.push(t);
    }

    // For each payee, find majority category from history
    const payeeCategoryCount = new Map(); // payee_id → Map<cat_id, count>
    for (const t of historyTxs) {
      if (!payeeCategoryCount.has(t.payee)) payeeCategoryCount.set(t.payee, new Map());
      const m = payeeCategoryCount.get(t.payee);
      m.set(t.category, (m.get(t.category) ?? 0) + 1);
    }
    const bestCategoryForPayee = (payeeId) => {
      const m = payeeCategoryCount.get(payeeId);
      if (!m) return null;
      return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    };

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

      // ── Rule proposals ──────────────────────────────────────────────────
      console.log(`\n  Rule proposals:`);
      const proposed = new Set(); // deduplicate proposals for same payee
      for (const t of shown) {
        const payeeId = t.payee;
        const payeeName = payeeId ? (payeeById.get(payeeId)?.name ?? '') : '';
        const importedPayee = t.imported_payee || t.notes || '';
        const key = payeeId ?? importedPayee;
        if (proposed.has(key)) continue;
        proposed.add(key);

        const suggestedCatId = bestCategoryForPayee(payeeId);
        const suggestedCat = suggestedCatId ? catById.get(suggestedCatId)?.name : null;

        // Check if an existing rule already targets this payee
        const existingRule = rules.find((r) =>
          r.conditions.some((c) =>
            c.field === 'payee' && c.value === payeeId ||
            c.field === 'imported_payee' && importedPayee &&
              importedPayee.toLowerCase().includes((c.value ?? '').toLowerCase())
          )
        );

        if (existingRule) {
          const catAction = existingRule.actions.find((a) => a.field === 'category');
          const ruleCat = catAction ? catById.get(catAction.value)?.name : null;
          if (ruleCat) {
            console.log(`    ${payeeName || importedPayee}: rule exists (sets category → ${ruleCat}) but didn't fire — check rule conditions`);
          } else {
            console.log(`    ${payeeName || importedPayee}: rule exists but has no category action — consider adding one`);
          }
        } else if (suggestedCat) {
          const matchText = importedPayee
            ? `imported_payee contains "${importedPayee.slice(0, 30)}"`
            : `payee = "${payeeName}"`;
          console.log(`    ${payeeName || importedPayee}: → create rule [${matchText}] set category = "${suggestedCat}"`);
        } else {
          console.log(`    ${payeeName || importedPayee}: no history — assign a category manually first`);
        }
      }
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

  // ── 6. ORPHANED UNCLEARED TRANSACTIONS ──────────────────────────────────
  section(6, `ORPHANED UNCLEARED TRANSACTIONS (not in SimpleFIN since ${sinceDate})`);

  const unclearedWithId = allTxs.filter(
    (t) => !t.cleared && !t.is_parent && !t.transfer_id && t.imported_id && t.date >= sinceDate,
  );

  if (!unclearedWithId.length) {
    ok('No uncleared imported transactions to check');
  } else {
    let sfinIds;
    try {
      sfinIds = await fetchTransactionIds(sinceDate);
    } catch (err) {
      warn(`Could not reach SimpleFIN to check orphaned transactions: ${err.message}`);
      sfinIds = null;
    }

    if (sfinIds) {
      const orphaned = unclearedWithId.filter((t) => !sfinIds.has(t.imported_id));
      if (!orphaned.length) {
        ok(`All ${unclearedWithId.length} uncleared transaction(s) still present in SimpleFIN`);
      } else {
        bad(`${orphaned.length} uncleared transaction(s) no longer returned by SimpleFIN — may be cancelled/reversed:`);
        tablePrint(orphaned, [
          { header: 'Date', value: (r) => r.date },
          { header: 'Account', value: (r) => r.accountName },
          { header: 'Payee', value: (r) => (r.payee ? payeeById.get(r.payee)?.name || '—' : (r.notes || '—')) },
          { header: 'Amount', align: 'right', value: (r) => fmtAmount(r.amount) },
          { header: 'imported_id', value: (r) => r.imported_id },
        ]);
        console.log(`     ↳ Consider deleting these or confirming with your bank statement.`);
      }
    }
  }

  // ── SUMMARY ──────────────────────────────────────────────────────────────
  section('', 'SUMMARY');
  if (!issueCount) {
    console.log('  ✓  All checks passed — budget data looks clean!\n');
  } else {
    console.log(`  ${issueCount} issue(s) found. See sections above for details.\n`);
  }
});
