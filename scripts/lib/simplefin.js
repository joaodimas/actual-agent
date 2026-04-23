// SimpleFIN API client — calls the bridge directly using SIMPLEFIN_ACCESS_URL from .env
import 'dotenv/config';

const ACCESS_URL = process.env.SIMPLEFIN_ACCESS_URL;
if (!ACCESS_URL) throw new Error('SIMPLEFIN_ACCESS_URL not set in .env');

/**
 * Fetch accounts and transactions from SimpleFIN.
 * @param {object} opts
 * @param {string|Date} [opts.startDate]  - only return transactions on or after this date
 * @param {boolean}     [opts.pending]    - include pending transactions (default: true)
 * @param {boolean}     [opts.balancesOnly] - skip transactions, just get balances
 * @returns {Promise<{accounts: Array, errlist: Array}>}
 */
export async function fetchAccounts({ startDate, pending = true, balancesOnly = false } = {}) {
  const params = new URLSearchParams();
  if (startDate) {
    const ts = startDate instanceof Date
      ? Math.floor(startDate.getTime() / 1000)
      : Math.floor(new Date(startDate).getTime() / 1000);
    params.set('start-date', ts);
  }
  if (pending) params.set('pending', '1');
  if (balancesOnly) params.set('balances-only', '1');
  params.set('version', '2');

  // Node's fetch rejects URLs with embedded credentials — extract and pass as Basic Auth header
  const parsed = new URL(`${ACCESS_URL}/accounts`);
  const auth = Buffer.from(`${parsed.username}:${parsed.password}`).toString('base64');
  parsed.username = '';
  parsed.password = '';
  parsed.search = params.toString();

  const res = await fetch(parsed.toString(), {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`SimpleFIN /accounts returned ${res.status}`);
  return res.json();
}

/**
 * Return a map of SimpleFIN transaction id → transaction for all accounts.
 * The SimpleFIN bridge prefixes ids with "TRN-" when Actual imports them.
 * @param {string|Date} startDate
 * @returns {Promise<Map<string, object>>}  keyed by "TRN-<id>" to match Actual's imported_id
 */
export async function fetchTransactionIds(startDate) {
  const data = await fetchAccounts({ startDate, pending: true });
  const map = new Map();
  for (const acct of data.accounts ?? []) {
    for (const tx of acct.transactions ?? []) {
      // SimpleFIN Bridge already prefixes ids with "TRN-", matching Actual's imported_id
      map.set(tx.id, { ...tx, sfinAccountId: acct.id, sfinAccountName: acct.name });
    }
  }
  return map;
}
