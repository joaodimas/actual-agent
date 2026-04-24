// Categorize known uncategorized transactions.
// Usage:
//   node scripts/fix-uncategorized.js           # dry-run
//   node scripts/fix-uncategorized.js --apply   # write categories

import 'dotenv/config';
import { withBudget, fmtAmount } from './lib/actual.js';

const apply = process.argv.includes('--apply');

// Category IDs (from the live budget)
const CAT = {
  rent:          'b10bd993-c3c3-4f72-a388-bbd9a201bf49',
  onlineServices:'37f99569-411f-4b99-9ac2-560a4b3a4940',
  autoLoan:      '57a5cbb8-c2ca-426a-af96-a87c55ca4dd3',
  taxesFees:     '03be8ae4-9044-4aa4-ab29-6a78baa3013a',
  otherExpense:  '27bb793b-59ab-46f9-82ac-bcfa79655015',
  groceries:     '33818a8d-f6fb-47c8-bff8-a940c6d3c671',
  otherIncome:   'b8f21a48-9ad2-4264-8155-274854059835',
};

// Rules: payee name substring (lowercase) → category id
// Checked in order, first match wins.
const PAYEE_RULES = [
  { match: 'loose leaf',     cat: CAT.rent,           note: 'Rent' },
  { match: 'plus feb',       cat: CAT.onlineServices, note: 'Online Services (Chase+ fee)' },
  { match: 'intempus',       cat: CAT.onlineServices, note: 'Online Services' },
  { match: 'apf inc',        cat: CAT.otherExpense,   note: 'Other expenses (APF Inc)' },
  { match: 'bill payment',   cat: CAT.otherExpense,   note: 'Other expenses (Bill Payment)' },
  { match: 'onetimepayment', cat: CAT.otherIncome,    note: 'Other income or debt (credit card payment received)' },
  { match: 'starting balance',cat: CAT.autoLoan,      note: 'Auto Loan (starting balance)' },
];

// Rules by payee id for orphaned transfers — we can't safely auto-category these,
// but we can recognize them and skip with an explanation.
// (payee has transfer_acct = they're orphaned transfers, not spending)
// Handled below by checking payee.transfer_acct.

const now      = new Date();
const startISO = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1))
  .toISOString().slice(0, 10);
const endISO   = now.toISOString().slice(0, 10);

await withBudget(async (api) => {
  const accounts = await api.getAccounts();
  const payees   = await api.getPayees();
  const payeeMap = Object.fromEntries(payees.map(p => [p.id, p]));

  let updated = 0;
  let skipped = 0;

  for (const acct of accounts.filter(a => !a.closed)) {
    const txns = await api.getTransactions(acct.id, startISO, endISO);
    const uncat = txns.filter(t => !t.category && !t.transfer_id && !t.is_child);

    for (const t of uncat) {
      const payee     = payeeMap[t.payee];
      const payeeName = payee?.name || '(no payee)';

      // Skip orphaned transfers — they have a transfer payee but no transfer_id
      if (payee?.transfer_acct) {
        console.log(`SKIP  ${t.date}  ${fmtAmount(t.amount).padStart(10)}  [${acct.name}]  ${payeeName}  ← orphaned transfer`);
        skipped++;
        continue;
      }

      // Skip CHASE AUTO starting balance — off-budget account, leave as-is
      if (acct.offBudget || acct.off_budget) {
        console.log(`SKIP  ${t.date}  ${fmtAmount(t.amount).padStart(10)}  [${acct.name}]  ${payeeName}  ← off-budget account`);
        skipped++;
        continue;
      }

      // Match payee rules
      const nameLower = payeeName.toLowerCase();
      const rule = PAYEE_RULES.find(r => nameLower.includes(r.match));

      if (rule) {
        console.log(`SET   ${t.date}  ${fmtAmount(t.amount).padStart(10)}  [${acct.name}]  ${payeeName}  → ${rule.note}`);
        if (apply) {
          await api.updateTransaction(t.id, { category: rule.cat });
          updated++;
        }
      } else {
        // No payee or unrecognized — flag for manual review
        const flag = !t.payee ? 'no payee — needs manual review' : 'unrecognized payee — needs manual review';
        console.log(`SKIP  ${t.date}  ${fmtAmount(t.amount).padStart(10)}  [${acct.name}]  ${payeeName}  ← ${flag}`);
        skipped++;
      }
    }
  }

  console.log(`\n${'─'.repeat(60)}`);
  if (apply) {
    console.log(`  Updated ${updated} transaction(s).  Skipped ${skipped} (orphaned transfers or manual review needed).`);
  } else {
    console.log(`  Would update ${updated > 0 ? updated : '(see SET lines above)'}.  Skipped ${skipped}.  Run with --apply to proceed.`);
  }
  console.log();
});
