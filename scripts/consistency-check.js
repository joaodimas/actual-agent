// Consistency check: compare Actual against SimpleFIN and flag data quality issues.
//
// Checks:
//   1. Balance drift  — Actual balance vs SimpleFIN balance per account
//   2. Uncategorized  — transactions with no category (excl. transfers)
//   3. Duplicates     — same date+amount appearing more than once in an account
//   4. Unlinked transfers — transactions whose payee is a transfer payee but
//                          have no transfer_id set
//   5. Uncleared old  — transactions older than 14 days that are still uncleared
//
// Usage:
//   node scripts/consistency-check.js
//   node scripts/consistency-check.js --months 3   # look back N months (default 2)

import 'dotenv/config';
import { withBudget, fmtAmount } from './lib/actual.js';

const args      = process.argv.slice(2);
const getArg    = f => { const i = args.indexOf(f); return i !== -1 ? args[i+1] ?? null : null; };
const lookback  = parseInt(getArg('--months') ?? '2', 10);

// ── SimpleFIN fetch ───────────────────────────────────────────────────────────
async function fetchSimpleFin() {
  const ACCESS_URL = process.env.SIMPLEFIN_ACCESS_URL;
  if (!ACCESS_URL) return { data: null, error: 'SIMPLEFIN_ACCESS_URL not set' };

  const p = new URL(ACCESS_URL);
  const basicAuth = Buffer.from(`${p.username}:${p.password}`).toString('base64');
  p.username = ''; p.password = '';
  const base = p.toString().replace(/\/?$/, '/');

  const startTs = Math.floor(Date.now() / 1000) - 45 * 86400;
  const endTs   = Math.floor(Date.now() / 1000);
  const url     = `${base}accounts?start-date=${startTs}&end-date=${endTs}`;

  try {
    const res = await fetch(url, { headers: { Authorization: `Basic ${basicAuth}` } });
    if (!res.ok) return { data: null, error: `SimpleFIN returned ${res.status}` };
    return { data: await res.json(), error: null };
  } catch (e) {
    return { data: null, error: `SimpleFIN fetch failed: ${e.message}` };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isoDate(ts) {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

function section(title) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(` ${title}`);
  console.log('─'.repeat(60));
}

function ok(msg)   { console.log(`  ✓  ${msg}`); }
function warn(msg) { console.log(`  ⚠  ${msg}`); }
function bad(msg)  { console.log(`  ✗  ${msg}`); }

// ── Main ──────────────────────────────────────────────────────────────────────
// Fetch SimpleFIN before connecting to Actual to avoid DNS contention
const sfResult = await fetchSimpleFin();

await withBudget(async (api) => {
  const now        = new Date();
  const startMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - lookback, 1));
  const startISO   = startMonth.toISOString().slice(0, 10);
  const endISO     = now.toISOString().slice(0, 10);
  const cutoff14   = new Date(now - 14 * 86400 * 1000).toISOString().slice(0, 10);

  console.log(`\nConsistency check — ${endISO}  (lookback: ${lookback} months)`);

  const [accounts, allPayees, allCats] = await Promise.all([
    api.getAccounts(),
    api.getPayees(),
    api.getCategories(),
  ]);

  const { data: sfData, error: sfError } = sfResult;

  const payeeMap        = Object.fromEntries(allPayees.map(p => [p.id, p]));
  const xferPayeeAccts  = new Set(allPayees.filter(p => p.transfer_acct).map(p => p.id));

  // ── 1. Balance drift ────────────────────────────────────────────────────────
  section('1. Account balances vs SimpleFIN');

  if (!sfData) {
    warn(`Skipping balance check — ${sfError}`);
  } else {
    const sfAccounts = sfData.accounts || [];
    const noise      = new Set(['card', 'cards', 'account', 'unlimited', 'customized', 'rewards',
      'visa', 'signature', 'prime', 'world', 'elite', 'anywhere', 'preferred', 'store']);
    const openAccts  = accounts.filter(a => !a.closed);

    // Two-pass matching so digit-matched accounts don't get stolen by keyword matching
    const claimedSfIds = new Set();
    const sfMatchMap   = new Map(); // actualAcctId → sfAccount

    // Pass 1: 4-digit suffix (most reliable)
    for (const acct of openAccts) {
      const digits = (acct.name.match(/\b(\d{4})\b/g) || []);
      if (!digits.length) continue;
      const sf = sfAccounts.find(s => !claimedSfIds.has(s.id) &&
        digits.some(d => (s.name || '').toLowerCase().includes(d)));
      if (sf) { sfMatchMap.set(acct.id, sf); claimedSfIds.add(sf.id); }
    }

    // Pass 2: keyword fallback for digit-less accounts
    for (const acct of openAccts) {
      if (sfMatchMap.has(acct.id)) continue;
      const digits = (acct.name.match(/\b(\d{4})\b/g) || []);
      if (digits.length) continue;
      const kws = acct.name.toLowerCase().split(/\W+/)
        .filter(w => w.length >= 4 && !noise.has(w))
        .sort((a, b) => b.length - a.length);
      for (const kw of kws) {
        const hits = sfAccounts.filter(s => !claimedSfIds.has(s.id) && (s.name || '').toLowerCase().includes(kw));
        if (hits.length === 1) { sfMatchMap.set(acct.id, hits[0]); claimedSfIds.add(hits[0].id); break; }
      }
    }

    for (const acct of openAccts) {
      const actualBal = await api.getAccountBalance(acct.id);
      const sfMatch   = sfMatchMap.get(acct.id) ?? null;

      if (!sfMatch) {
        warn(`${acct.name.padEnd(32)} — no SimpleFIN match found`);
        continue;
      }

      const sfBal      = Math.round(Number(sfMatch.balance) * 100);
      const sfDate     = sfMatch['balance-date'] ? isoDate(sfMatch['balance-date']) : '?';
      const diff       = actualBal - sfBal;
      const diffFmt    = fmtAmount(Math.abs(diff));
      const label      = `${acct.name.padEnd(32)} actual:${fmtAmount(actualBal).padStart(12)}  simplefin:${fmtAmount(sfBal).padStart(12)}  (as of ${sfDate})`;

      if (diff === 0) {
        ok(label);
      } else if (Math.abs(diff) <= 100) {
        warn(`${label}  diff:${diffFmt} — minor rounding`);
      } else {
        bad(`${label}  diff:${diffFmt}`);
      }
    }
  }

  // ── 2. Uncategorized transactions ───────────────────────────────────────────
  section('2. Uncategorized transactions');

  let uncatTotal = 0;
  const uncatRows = [];

  for (const acct of accounts.filter(a => !a.closed)) {
    const txns = await api.getTransactions(acct.id, startISO, endISO);
    const uncat = txns.filter(t => !t.category && !t.transfer_id && !t.is_child);
    uncatTotal += uncat.length;
    uncat.forEach(t => uncatRows.push({ acct: acct.name, ...t }));
  }

  if (!uncatTotal) {
    ok('No uncategorized transactions');
  } else {
    bad(`${uncatTotal} uncategorized transaction(s):`);
    uncatRows.sort((a, b) => b.date.localeCompare(a.date)).forEach(t => {
      const p = payeeMap[t.payee]?.name || '(no payee)';
      console.log(`     ${t.date}  ${fmtAmount(t.amount).padStart(10)}  [${t.acct}]  ${p}`);
    });
  }

  // ── 3. Duplicate transactions ───────────────────────────────────────────────
  section('3. Duplicate transactions');

  let dupTotal = 0;

  for (const acct of accounts.filter(a => !a.closed)) {
    const txns  = await api.getTransactions(acct.id, startISO, endISO);
    const seen  = {};
    for (const t of txns) {
      const key = `${t.date}|${t.amount}`;
      seen[key] = seen[key] || [];
      seen[key].push(t);
    }
    for (const [key, group] of Object.entries(seen)) {
      if (group.length < 2) continue;
      dupTotal += group.length - 1;
      const [date, amt] = key.split('|');
      const p = payeeMap[group[0].payee]?.name || '(no payee)';
      bad(`${acct.name}: ${date}  ${fmtAmount(Number(amt)).padStart(10)}  ×${group.length}  ${p}`);
    }
  }

  if (!dupTotal) ok('No duplicates found');

  // ── 4. Unlinked transfers ───────────────────────────────────────────────────
  section('4. Unlinked transfer payees (missing transfer_id)');

  let unlinkTotal = 0;

  for (const acct of accounts.filter(a => !a.closed)) {
    const txns = await api.getTransactions(acct.id, startISO, endISO);
    const unlinked = txns.filter(t =>
      !t.transfer_id &&
      !t.is_child &&
      t.payee &&
      xferPayeeAccts.has(t.payee)
    );
    unlinkTotal += unlinked.length;
    unlinked.forEach(t => {
      const p = payeeMap[t.payee]?.name || '';
      bad(`${acct.name}: ${t.date}  ${fmtAmount(t.amount).padStart(10)}  payee: ${p}`);
    });
  }

  if (!unlinkTotal) ok('All transfer payees are properly linked');

  // ── 5. Old uncleared transactions ───────────────────────────────────────────
  section(`5. Uncleared transactions older than 14 days (before ${cutoff14})`);

  let oldUnclearedTotal = 0;

  for (const acct of accounts.filter(a => !a.closed)) {
    const txns = await api.getTransactions(acct.id, startISO, cutoff14);
    const stale = txns.filter(t => !t.cleared && !t.is_child);
    oldUnclearedTotal += stale.length;
    stale.forEach(t => {
      const p = payeeMap[t.payee]?.name || '(no payee)';
      warn(`${acct.name}: ${t.date}  ${fmtAmount(t.amount).padStart(10)}  ${p}`);
    });
  }

  if (!oldUnclearedTotal) ok('No stale uncleared transactions');

  // ── Summary ─────────────────────────────────────────────────────────────────
  section('Summary');
  const issues = uncatTotal + dupTotal + unlinkTotal;
  if (issues === 0 && oldUnclearedTotal === 0) {
    ok('All checks passed — budget is clean');
  } else {
    if (uncatTotal)        bad(`${uncatTotal} uncategorized transaction(s)`);
    if (dupTotal)          bad(`${dupTotal} duplicate(s)`);
    if (unlinkTotal)       bad(`${unlinkTotal} unlinked transfer(s)`);
    if (oldUnclearedTotal) warn(`${oldUnclearedTotal} stale uncleared transaction(s)`);
  }
  console.log();
});
