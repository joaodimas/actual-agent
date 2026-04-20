#!/usr/bin/env node
// Apply Claude's first-pass payee → category mapping to out/uncategorized.json.
// Heuristic + manual lookup table. Re-run after editing.
//
// Usage:
//   node scripts/draft-mapping.js                 # default in/out path
//   node scripts/draft-mapping.js path.json

import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT } from './lib/actual.js';

const file =
  process.argv[2] || path.join(PROJECT_ROOT, 'out', 'uncategorized.json');

const data = JSON.parse(fs.readFileSync(file, 'utf8'));

// Manual exact mapping (case-insensitive payee name → category name)
const EXACT = {
  // Travel
  'airbnb': 'California rent airbnb',
  'american airlines': 'California to St. Louis',
  'delta airlines': 'California to St. Louis',
  'frontier airlines': 'California to St. Louis',
  'gol linhas aereas': 'California to St. Louis',
  'trip.com': 'California to St. Louis',
  'chase travel': 'California to St. Louis',
  'localiza': 'California to St. Louis',
  'foxrentacar san fran': 'California to St. Louis',
  'allianz insurance': 'California to St. Louis',
  'blueground i st f m q b m h web': 'California rent airbnb',

  // Transportation (gas / parking / tolls / DMV / car maintenance)
  'arco': 'Transportation',
  'chevron': 'Transportation',
  'sfo prepaid parking': 'Transportation',
  'park sfo': 'Transportation',
  'happy hollow parking': 'Transportation',
  'smarte carte': 'Transportation',
  'california department of motor vehicles': 'Taxes and Fees',
  'certificate of origin mo dept revenue': 'Taxes and Fees',
  'mobile auto pros': 'Car maintenance',

  // School / kids
  'brightwheel': "Alice's school",
  'wilson school': "Alice's school",
  'the wilson schoo st k r p e i web': "Alice's school",
  'the wilson schoo st t f b z s web': "Alice's school",
  'parchment': 'Education',
  'cookie cutters creve': 'Going out',

  // Eating out (restaurants, cafes, fast food)
  'fogo de chao': 'Eating out',
  'bay sushi': 'Eating out',
  'paris baguette cup': 'Eating out',
  'parisbaguette': 'Eating out',
  'par fogo san jose': 'Eating out',
  'scopazzis': 'Eating out',
  'five guys': 'Eating out',
  'dl brazuca': 'Eating out',
  'pints of joy': 'Eating out',
  'bacio di latte': 'Eating out',
  'eataly': 'Eating out',
  'pinkberry': 'Eating out',
  'daves hot chicken': 'Eating out',
  'avila alves dim san jose ca': 'Eating out',
  'coca cola': 'Eating out',
  'hudson news': 'Eating out',
  'happy hollow food & bev': 'Eating out',
  'gilroy gardens food': 'Eating out',

  // Going out (entertainment, parks, events)
  'knight center': 'Going out',
  'happy hollow web sales': 'Going out',
  'gilroygardens.org': 'Going out',
  'safari run sunnyvale': 'Going out',
  'natural bridges s via nic inc.': 'Going out',
  'ssa happy hollow park': 'Going out',
  'face painting': 'Going out',
  'groupon': 'Going out',
  'total wine and more': 'Going out',
  'sousas wines and liquor': 'Going out',

  // Health / personal care
  'action urgent care': 'Health',
  'pamf kearney st': 'Health',
  'avita': 'Health',
  'millbrook pharmacy': 'Health',
  'european wax center': 'Health',
  'blesseli spa': 'Health',
  'face body brentwood': 'Health',
  'vursatyle massage and': 'Health',

  // Groceries / household / fuel
  'wayfair': 'Groceries, household items, clothing, fuel',
  'trade rite market inc': 'Groceries, household items, clothing, fuel',

  // Online services
  'microsoft': 'Online Services',
  'nvidia': 'Online Services',

  // Other expenses / fees
  'public storage': 'Other expenses',
  'late fee': 'Other expenses',
  'interest charge': 'Other expenses',
  'balance transfer transaction fee': 'Other expenses',
  'ups': 'Other expenses',
  'us postal service': 'Other expenses',
  'ebonynews st': 'Other expenses',
  'plus feb': 'Other expenses',
  'homeowners insurance': 'Other expenses',
  'federal companies': 'Other expenses', // moving company; large; user should confirm

  // Income
  'cash rewards': 'Cashback',
  'small balance credit': 'Cashback',
  'statement credit': 'Cashback',
};

// Substring patterns mapped to a category. Matched after EXACT.
const SUBSTRING = [
  // Brazilian incoming wires from user's own Brazilian account
  [/^real time transfer recd from aba contr bank joao henrique avila alves dimas/i, 'Bacen'],
  // Zelle / PayPal payments to outside people = real expenses (user can refine)
  [/^zelle transfer to lampros pnevmatikos/i, 'Other expenses'],
  [/^zelle transfer to cleaning/i, 'Other expenses'],
  [/^paypal transfer/i, 'Other expenses'],
  // Incoming Zelle without payee detail
  [/^zelle transfer$/i, 'Other income or debt'],
  // Misc small charges
  [/^dfw ameritex inc/i, 'Other expenses'],
];

// Patterns to skip explicitly (these are handled by find-transfer-pairs / apply-transfer-pairs,
// or are too ambiguous to auto-categorize without user input).
const SKIP_PATTERNS = [
  /^starting balance$/i,
  // Likely self-transfers — the transfer-pair flow handles these
  /^bank of america payment$/i,
  /^online payment to auto loan$/i,
  /^citi flex pay$/i,
  /^bill payment$/i,
  /^payment thank you$/i,
  /^online mobile payment/i,
  /^online mobile recurring$/i,
  /^onetimepayment$/i,
  /^apf inc$/i,
  /^\(no payee\)$/i,
  // Specific ambiguous payees (require user input)
  /^lawrence$/i,
  /^loose leaf prope web$/i,
  /^intempus$/i,
  /^plus feb$/i,
];

function suggest(payeeName) {
  const lower = payeeName.toLowerCase().trim();
  if (SKIP_PATTERNS.some((re) => re.test(lower))) return null;
  if (EXACT[lower]) return EXACT[lower];
  for (const [re, cat] of SUBSTRING) {
    if (re.test(lower)) return cat;
  }
  // Loose patterns
  if (/airline|airways|airline/.test(lower)) return 'California to St. Louis';
  if (/sushi|cafe|coffee|bistro|grill|pizza|burger|taco|kitchen/.test(lower))
    return 'Eating out';
  if (/spa|salon|massage|wax|barber/.test(lower)) return 'Health';
  if (/pharmacy|clinic|medical|hospital|urgent care|dental/.test(lower))
    return 'Health';
  if (/parking|toll|gas|fuel|chevron|shell|exxon|arco/.test(lower))
    return 'Transportation';
  return null;
}

let filled = 0;
let skipped = 0;
for (const p of data.payees) {
  const sug = suggest(p.payeeName);
  if (sug) {
    p.suggested_category = sug;
    filled += 1;
  } else {
    p.suggested_category = null;
    skipped += 1;
  }
}

fs.writeFileSync(file, JSON.stringify(data, null, 2));
console.log(`Filled ${filled} payees, skipped ${skipped} (left as null).`);
console.log(`Wrote ${file}`);
