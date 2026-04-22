---
name: bank-sync
description: Pull the latest transactions from all connected banks (SimpleFIN / GoCardless) and sync with the Actual server. Use when the user says "sync banks", "pull from banks", "download bank transactions", "refresh from bank", "get latest bank data", or "sync all accounts".
---

# Bank Sync

Pulls new transactions from all connected bank accounts via SimpleFIN or GoCardless, then syncs with the Actual server.

## When to use

- "Sync with my banks"
- "Pull the latest transactions"
- "Download new bank transactions"
- "Refresh from bank"
- "Get new charges"

## Commands

```bash
# Sync all connected accounts
node scripts/sync.js --bank

# Sync a single account (id or name substring)
node scripts/sync.js --bank "Chase"
```

## Notes

- Accounts without a SimpleFIN/GoCardless connection will report an error per account — that's expected and safe.
- After bank sync, new transactions may land uncategorized. Consider running `/categorize-transactions` next.
- To check whether the downloaded balances match Actual's records, run `/consistency-check --bank`.
