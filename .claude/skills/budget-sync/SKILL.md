---
name: budget-sync
description: Sync local Actual Budget cache with the server, and optionally pull new transactions from connected banks (GoCardless / SimpleFIN). Use when the user asks to "sync", "pull latest", "refresh", "download new transactions from my bank", or "check for new charges".
---

# Sync with server and (optionally) banks

Two modes:

1. **Server sync only** — pulls down any changes made on other clients (web/mobile/another agent). Fast.
2. **Bank sync** — runs the third-party bank-sync (GoCardless / SimpleFIN) for one or all connected accounts. Slower; downloads new transactions and inserts them into the ledger.

## When to use

- "Sync my budget"
- "Pull the latest"
- "Refresh from server"
- "Download new transactions from my bank"
- "Check for new charges this week"
- Before producing a report or doing analysis, to make sure local data is fresh.

## Commands

```bash
# Just sync local cache with server
node scripts/sync.js

# Sync server + run bank-sync on all open accounts
node scripts/sync.js --bank

# Bank-sync only one account (id or name substring)
node scripts/sync.js --bank "Chase Checking"
```

## Notes

- The connection helper (`scripts/lib/actual.js`) automatically calls `api.sync()` on every connect, so most other scripts already pull latest on start. Use this skill explicitly when you want to force a refresh or pull from banks.
- Bank sync requires the account to have a third-party connection configured in the Actual web UI. Accounts without one will error — that's expected and reported per-account.
- After bank-sync, you may want to run `/categorize-transactions` to handle anything new that landed uncategorized.
