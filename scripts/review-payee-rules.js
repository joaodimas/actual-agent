#!/usr/bin/env node
// Analyze payee rules for redundancy, conflicts, dead rules, and suspicious patterns.
// Outputs structured JSON for AI interpretation.
//
// Usage:
//   node scripts/review-payee-rules.js
//   node scripts/review-payee-rules.js --since 2026-01-01  # lookback for match counts

import { withBudget, fmtAmount } from './lib/actual.js';

const args = process.argv.slice(2);
const argVal = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };

const sinceDate = argVal('--since') || (() => {
  const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().slice(0, 10);
})();
const today = new Date().toISOString().slice(0, 10);

await withBudget(async (api) => {
  const [rules, payees, cats, accounts] = await Promise.all([
    api.getRules(),
    api.getPayees(),
    api.getCategories(),
    api.getAccounts(),
  ]);

  const payeeById  = new Map(payees.map(p => [p.id, p]));
  const catById    = new Map(cats.map(c => [c.id, c]));
  const catIds     = new Set(cats.map(c => c.id));
  const payeeIds   = new Set(payees.map(p => p.id));

  // Load all transactions in lookback window for match-count analysis
  const allTxs = [];
  for (const a of accounts.filter(a => !a.closed)) {
    const txs = await api.getTransactions(a.id, sinceDate, today);
    for (const t of txs) allTxs.push(t);
  }

  // Build payee → transactions map
  const txsByPayee = new Map();
  for (const t of allTxs) {
    if (!t.payee) continue;
    if (!txsByPayee.has(t.payee)) txsByPayee.set(t.payee, []);
    txsByPayee.get(t.payee).push(t);
  }

  // ── Resolve each rule to human-readable form ─────────────────────────────
  const resolved = rules.map(r => {
    const conditions = r.conditions.map(c => {
      let valueLabel = c.value;
      if (c.field === 'payee' && c.type === 'id') {
        valueLabel = payeeById.get(c.value)?.name ?? `<unknown payee ${c.value}>`;
      } else if (c.field === 'category' && c.type === 'id') {
        valueLabel = catById.get(c.value)?.name ?? `<unknown category ${c.value}>`;
      }
      return { ...c, valueLabel };
    });

    const actions = r.actions.map(a => {
      let valueLabel = a.value;
      if (a.field === 'payee' && a.type === 'id') {
        valueLabel = payeeById.get(a.value)?.name ?? `<unknown payee ${a.value}>`;
      } else if (a.field === 'category' && a.type === 'id') {
        valueLabel = catById.get(a.value)?.name ?? `<unknown category ${a.value}>`;
      }
      return { ...a, valueLabel };
    });

    // Count transactions matched by this rule's payee conditions
    const payeeCond = conditions.find(c => c.field === 'payee' && c.type === 'id');
    const matchCount = payeeCond ? (txsByPayee.get(payeeCond.value)?.length ?? 0) : null;

    // Issues detected by script
    const issues = [];

    // No actions at all
    if (!r.actions.length) issues.push('NO_ACTIONS');

    // No conditions at all
    if (!r.conditions.length) issues.push('NO_CONDITIONS');

    // Category action references nonexistent category
    const catAction = actions.find(a => a.field === 'category' && a.type === 'id');
    if (catAction && !catIds.has(catAction.value)) issues.push('DEAD_CATEGORY');

    // Payee condition references nonexistent payee
    if (payeeCond && !payeeIds.has(payeeCond.value)) issues.push('DEAD_PAYEE');

    // Rule hasn't matched anything in the lookback window
    if (matchCount === 0) issues.push('NO_RECENT_MATCHES');

    // Rule has no category action (may be intentional — e.g. only sets payee name)
    if (!catAction) issues.push('NO_CATEGORY_ACTION');

    return {
      id: r.id,
      stage: r.stage,
      conditionsOp: r.conditionsOp,
      conditions,
      actions,
      matchCount,
      issues,
    };
  });

  // ── Detect duplicate/conflicting rules ───────────────────────────────────
  // Rules that target the same payee (by payee condition)
  const byTargetPayee = new Map();
  for (const r of resolved) {
    const pc = r.conditions.find(c => c.field === 'payee' && c.type === 'id');
    if (!pc) continue;
    if (!byTargetPayee.has(pc.value)) byTargetPayee.set(pc.value, []);
    byTargetPayee.get(pc.value).push(r);
  }
  const duplicatePayeeTargets = [...byTargetPayee.entries()]
    .filter(([, rs]) => rs.length > 1)
    .map(([payeeId, rs]) => ({
      payee: payeeById.get(payeeId)?.name ?? payeeId,
      rules: rs.map(r => r.id),
      actions: rs.map(r => r.actions.map(a => `${a.field}=${a.valueLabel}`).join(', ')),
    }));

  // Rules that share the same imported_payee contains text
  const byImportedPayeeText = new Map();
  for (const r of resolved) {
    const ic = r.conditions.find(c => c.field === 'imported_payee');
    if (!ic || !ic.value) continue;
    const key = `${ic.op}::${String(ic.value).toLowerCase()}`;
    if (!byImportedPayeeText.has(key)) byImportedPayeeText.set(key, []);
    byImportedPayeeText.get(key).push(r);
  }
  const duplicateImportedPayeeText = [...byImportedPayeeText.entries()]
    .filter(([, rs]) => rs.length > 1)
    .map(([key, rs]) => ({
      condition: key,
      rules: rs.map(r => r.id),
    }));

  // ── Summary stats ─────────────────────────────────────────────────────────
  const stats = {
    total: resolved.length,
    withNoActions: resolved.filter(r => r.issues.includes('NO_ACTIONS')).length,
    withDeadCategory: resolved.filter(r => r.issues.includes('DEAD_CATEGORY')).length,
    withDeadPayee: resolved.filter(r => r.issues.includes('DEAD_PAYEE')).length,
    withNoRecentMatches: resolved.filter(r => r.issues.includes('NO_RECENT_MATCHES')).length,
    withNoCategoryAction: resolved.filter(r => r.issues.includes('NO_CATEGORY_ACTION')).length,
    duplicatePayeeTargets: duplicatePayeeTargets.length,
  };

  // ── Output ────────────────────────────────────────────────────────────────
  const output = {
    meta: { sinceDate, today, lookbackDays: Math.round((new Date(today) - new Date(sinceDate)) / 86400000) },
    stats,
    duplicatePayeeTargets,
    duplicateImportedPayeeText,
    // Only output rules with issues or that are interesting — full list is too large for AI context
    rulesWithIssues: resolved.filter(r => r.issues.some(i => i !== 'NO_CATEGORY_ACTION')),
    // Sample of rules with no category action (may be intentional — just set payee rename)
    rulesWithNoCategoryOnly: resolved
      .filter(r => r.issues.length === 1 && r.issues[0] === 'NO_CATEGORY_ACTION')
      .slice(0, 20),
    // All rules for full AI review (grouped by category action for readability)
    allRules: resolved,
  };

  console.log(JSON.stringify(output, null, 2));
});
