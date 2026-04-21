// One-time script to clean up uncategorized April 2026 transactions:
//  1. Link on-budget and off-budget transfer pairs via transfer_id
//  2. Delete duplicate auto-loan payment (uncleared)
//  3. Categorize: Talita Marques → Cleaning services
//                 Lawrence County DC → Taxes and Fees
//                 Citi Flex Pay → Groceries, household items, clothing, fuel

import { withBudget } from './lib/actual.js';

const START = '2026-04-01';
const END   = '2026-04-30';

await withBudget(async (api) => {
  // ── 1. Build lookup maps ───────────────────────────────────────────────────
  const accounts  = await api.getAccounts();
  const acctById  = Object.fromEntries(accounts.map(a => [a.id, a]));
  const acctByName = Object.fromEntries(accounts.map(a => [a.name.toLowerCase(), a]));

  const payees    = await api.getPayees();
  // transfer payees: payee whose name corresponds to an account
  const xferPayeeByAcctId = Object.fromEntries(
    payees.filter(p => p.transfer_acct).map(p => [p.transfer_acct, p])
  );

  const categories = await api.getCategories();
  const catByName  = Object.fromEntries(categories.map(c => [c.name.toLowerCase(), c]));

  // Find or create "Cleaning services" category
  let cleaningCat = catByName['cleaning services'];
  if (!cleaningCat) {
    const groups = await api.getCategoryGroups();
    // Put it in the first non-income group
    const group = groups.find(g => !g.is_income);
    const newId = await api.createCategory({ name: 'Cleaning services', group_id: group.id });
    cleaningCat = { id: newId, name: 'Cleaning services' };
    console.log('Created category: Cleaning services');
  }

  const taxesCat     = categories.find(c => c.name === 'Taxes and Fees');
  const householdCat = categories.find(c => c.name === 'Groceries, household items, clothing, fuel');

  if (!taxesCat)     throw new Error('Category "Taxes and Fees" not found');
  if (!householdCat) throw new Error('Category "Groceries, household items, clothing, fuel" not found');

  // ── 2. Fetch all April transactions across all accounts ───────────────────
  const allTxns = [];
  for (const acct of accounts) {
    const txns = await api.getTransactions(acct.id, START, END);
    for (const t of txns) allTxns.push({ ...t, _acctId: acct.id });
  }

  const uncategorized = allTxns.filter(t => !t.category && !t.transfer_id);
  console.log(`Uncategorized April transactions: ${uncategorized.length}`);

  // ── 3. Link transfer pairs ────────────────────────────────────────────────
  // Strategy: for each uncategorized tx whose payee is a transfer payee,
  // find its counterpart on the other side.
  const linked = new Set();

  for (const tx of uncategorized) {
    if (linked.has(tx.id)) continue;

    // Is the payee a transfer payee pointing to a known account?
    const payee = payees.find(p => p.id === tx.payee);
    if (!payee?.transfer_acct) continue;

    const destAcctId = payee.transfer_acct;

    // Find matching counterpart: same absolute amount, same date, not yet linked
    const counterpart = uncategorized.find(t =>
      !linked.has(t.id) &&
      t.id !== tx.id &&
      t._acctId === destAcctId &&
      t.amount === -tx.amount &&
      t.date === tx.date &&
      !t.transfer_id
    );

    if (!counterpart) {
      // Try ±1 day
      const txDate  = new Date(tx.date);
      const altCounterpart = uncategorized.find(t => {
        if (linked.has(t.id) || t.id === tx.id || t._acctId !== destAcctId) return false;
        if (t.amount !== -tx.amount || t.transfer_id) return false;
        const diff = Math.abs(new Date(t.date) - txDate) / 86400000;
        return diff <= 1;
      });
      if (!altCounterpart) {
        console.log(`  No counterpart found for: ${tx.date} ${acctById[tx._acctId]?.name} ${tx.amount} (payee: ${payee.name})`);
        continue;
      }

      await api.updateTransaction(tx.id,              { transfer_id: altCounterpart.id });
      await api.updateTransaction(altCounterpart.id,  { transfer_id: tx.id });
      linked.add(tx.id);
      linked.add(altCounterpart.id);
      console.log(`  Linked (±1d): ${tx.date} ${acctById[tx._acctId]?.name} ${tx.amount} ↔ ${altCounterpart.date} ${acctById[altCounterpart._acctId]?.name}`);
      continue;
    }

    await api.updateTransaction(tx.id,          { transfer_id: counterpart.id });
    await api.updateTransaction(counterpart.id,  { transfer_id: tx.id });
    linked.add(tx.id);
    linked.add(counterpart.id);
    console.log(`  Linked: ${tx.date} ${acctById[tx._acctId]?.name} ${tx.amount} ↔ ${acctById[counterpart._acctId]?.name}`);
  }

  // ── 4. Delete duplicate auto-loan payment ────────────────────────────────
  // Two -$777.13 entries from Chase Checking on 2026-04-15: keep the cleared one.
  const autoAcct   = accounts.find(a => a.name.includes('CHASE AUTO'));
  const checkingAcct = accounts.find(a => a.name === 'Chase - Checking');
  const autoXferPayee = xferPayeeByAcctId[autoAcct?.id];

  if (autoXferPayee && checkingAcct) {
    const autoDups = uncategorized.filter(t =>
      t._acctId === checkingAcct.id &&
      t.date === '2026-04-15' &&
      t.amount === -77713 &&
      !linked.has(t.id)
    );
    // Also consider already-linked ones with same criteria
    const allAutoPmts = allTxns.filter(t =>
      t._acctId === checkingAcct.id &&
      t.date === '2026-04-15' &&
      t.amount === -77713
    );
    if (allAutoPmts.length > 1) {
      // Delete the uncleared duplicate
      const toDelete = allAutoPmts.find(t => !t.cleared);
      if (toDelete) {
        await api.deleteTransaction(toDelete.id);
        console.log(`  Deleted duplicate auto-loan payment: ${toDelete.id} (uncleared)`);
        linked.add(toDelete.id);
      }
    }
  }

  // ── 5. Categorize remaining uncategorized transactions ────────────────────
  const stillUncategorized = uncategorized.filter(t => !linked.has(t.id));

  for (const tx of stillUncategorized) {
    const payee = payees.find(p => p.id === tx.payee);
    const payeeName = (payee?.name || '').toLowerCase();
    const notes = (tx.notes || '').toLowerCase();

    let catId = null;
    let label = '';

    if (payeeName.includes('talita') || notes.includes('talita')) {
      catId = cleaningCat.id;
      label = 'Cleaning services';
    } else if (payeeName.includes('lawrence') || notes.includes('certificate of origin') || notes.includes('mo dept revenue')) {
      catId = taxesCat.id;
      label = 'Taxes and Fees';
    } else if (payeeName.includes('citi flex') || notes.includes('citi flex')) {
      catId = householdCat.id;
      label = 'Groceries, household items, clothing, fuel';
    }

    if (catId) {
      await api.updateTransaction(tx.id, { category: catId });
      console.log(`  Categorized [${label}]: ${tx.date} ${acctById[tx._acctId]?.name} ${tx.amount} - ${payee?.name}`);
    } else {
      console.log(`  Skipped (no rule matched): ${tx.date} ${acctById[tx._acctId]?.name} ${tx.amount} - ${payee?.name}`);
    }
  }

  console.log('\nDone.');
});
