import 'dotenv/config';
import api from '@actual-app/api';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

export const DATA_DIR =
  process.env.ACTUAL_DATA_DIR || path.join(PROJECT_ROOT, '.actual-data');

let initialized = false;
let downloaded = false;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// The bundled @actual-app/api emits internal sync/loading messages via
// console.log/console.info. Wrap calls into this to keep our scripts clean.
async function withSilencedStdout(fn) {
  if (process.env.ACTUAL_VERBOSE === '1') return fn();
  const origLog = console.log;
  const origInfo = console.info;
  const origWarn = console.warn;
  console.log = () => {};
  console.info = () => {};
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    console.log = origLog;
    console.info = origInfo;
    console.warn = origWarn;
  }
}

function requireEnv(key) {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key} (check .env)`);
  return v;
}

export async function init() {
  if (initialized) return api;
  ensureDataDir();
  await withSilencedStdout(() =>
    api.init({
      dataDir: DATA_DIR,
      serverURL: requireEnv('ACTUAL_SERVER_URL'),
      password: requireEnv('ACTUAL_PASSWORD'),
    }),
  );
  initialized = true;
  return api;
}

export async function listBudgets() {
  await init();
  return api.getBudgets();
}

export async function findBudgetSyncId(name) {
  const budgets = await listBudgets();
  const exact = budgets.find((b) => b.name === name);
  if (exact) return exact.groupId;
  const ci = budgets.find(
    (b) => b.name && b.name.toLowerCase() === name.toLowerCase(),
  );
  if (ci) return ci.groupId;
  const partial = budgets.find(
    (b) => b.name && b.name.toLowerCase().includes(name.toLowerCase()),
  );
  if (partial) return partial.groupId;
  throw new Error(
    `Budget "${name}" not found. Available: ${budgets
      .map((b) => `"${b.name}"`)
      .join(', ')}`,
  );
}

export async function connect({ budgetName, sync = true, forceDownload = false } = {}) {
  await init();
  if (!downloaded) {
    const name = budgetName || requireEnv('ACTUAL_BUDGET_NAME');
    const syncId = await findBudgetSyncId(name);
    const localBudgetPath = path.join(DATA_DIR, syncId);
    const hasLocal = !forceDownload && fs.existsSync(localBudgetPath);
    if (hasLocal) {
      // Open local copy without downloading — preserves uncommitted local changes.
      // Falls back to downloadBudget on the first run (no local file yet).
      await withSilencedStdout(() => api.loadBudget(syncId));
    } else {
      const opts = process.env.ACTUAL_E2E_PASSWORD
        ? { password: process.env.ACTUAL_E2E_PASSWORD }
        : undefined;
      await withSilencedStdout(() => api.downloadBudget(syncId, opts));
    }
    downloaded = true;
  }
  return api;
}

export async function shutdown() {
  if (!initialized) return;
  try {
    await withSilencedStdout(() => api.shutdown());
  } catch (err) {
    // swallow — shutdown errors when no budget is open
  } finally {
    initialized = false;
    downloaded = false;
  }
}

export async function withBudget(fn, opts = {}) {
  await connect(opts);
  try {
    return await fn(api);
  } finally {
    await shutdown();
  }
}

// ---------- Formatting helpers ----------

export function fmtAmount(n) {
  if (n == null) return '—';
  const dollars = api.utils.integerToAmount(n);
  const sign = dollars < 0 ? '-' : '';
  const abs = Math.abs(dollars);
  return `${sign}$${abs.toFixed(2)}`;
}

export function fmtAmountColored(n) {
  if (n == null) return '—';
  const dollars = api.utils.integerToAmount(n);
  const s = `$${Math.abs(dollars).toFixed(2)}`;
  if (dollars < 0) return `-${s}`;
  return s;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function monthOf(dateISO) {
  return dateISO.slice(0, 7);
}

export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function previousMonth(month = currentMonth()) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

export function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const start = `${month}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${month}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

export function tablePrint(rows, columns) {
  if (!rows.length) {
    console.log('(no rows)');
    return;
  }
  const headers = columns.map((c) => c.header);
  const widths = columns.map((c) =>
    Math.max(
      c.header.length,
      ...rows.map((r) => String(c.value(r) ?? '').length),
    ),
  );
  const pad = (s, w, align = 'left') =>
    align === 'right' ? String(s).padStart(w) : String(s).padEnd(w);

  console.log(
    headers
      .map((h, i) => pad(h, widths[i], columns[i].align || 'left'))
      .join('  '),
  );
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const r of rows) {
    console.log(
      columns
        .map((c, i) =>
          pad(c.value(r) ?? '', widths[i], c.align || 'left'),
        )
        .join('  '),
    );
  }
}

export { api, withSilencedStdout };
