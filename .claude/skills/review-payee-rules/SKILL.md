---
name: review-payee-rules
description: Analyze all payee rules for redundancy, conflicts, dead references, and suspicious patterns. Summarizes findings and proposes specific changes.
type: budget
---

# Review Payee Rules

Analyzes all Actual Budget payee rules to surface cleanup opportunities.

## When to use

- "Review my payee rules"
- "Are my rules well organized?"
- "Find redundant or broken rules"
- "Clean up payee rules"

## Command

```bash
node scripts/review-payee-rules.js 2>/dev/null > /tmp/rules-review.json
```

## Agent Instructions

Run the command above, then analyze the JSON output as follows. Work through each section systematically and produce a structured report with proposed changes.

### 1. Read the stats block
Summarize the counts: total rules, dead categories, dead payees, duplicates, no recent matches.

### 2. Dead references (fix immediately)
- `withDeadCategory` — rules that set a category that no longer exists. These do nothing. **Propose: delete the category action or delete the rule entirely.**
- `withDeadPayee` — rules whose condition targets a payee that no longer exists. **Propose: delete the rule.**
- Look in `rulesWithIssues` for items with `DEAD_CATEGORY` or `DEAD_PAYEE` issue tags.

### 3. Duplicate rules (consolidate)
- Check `duplicatePayeeTargets` — multiple rules targeting the same payee.
- If they set the same category → one is redundant, **propose: delete the duplicate.**
- If they set different categories → conflict. **Propose: keep the more specific one, delete the other.**
- If one has no category action and one does → **propose: merge into a single rule.**

### 4. No recent matches (review for relevance)
- `withNoRecentMatches` = 96 rules that haven't fired in the lookback window.
- These may be for infrequent payees (annual subscriptions, etc.) — don't blindly delete.
- Look for patterns: rules for payees that sound like one-off merchants or old services. **Propose: flag the suspicious ones for manual review.**

### 5. Rules with no actions (`NO_ACTIONS`)
- These are broken rules that do nothing. **Propose: delete them.**

### 6. Rules with no category action (`NO_CATEGORY_ACTION`)
- These only rename payees or set other fields. That may be intentional.
- Review `rulesWithNoCategoryOnly` — if the payee rename is the only action and it seems useful, keep it.
- If the payee name in the condition and the rename action are identical, the rule does nothing useful. **Propose: delete.**

### 7. Suspicious / odd rules
Use judgment to flag rules that look wrong:
- Condition text too generic (e.g. `contains "pay"` could match many things)
- Category assignment that doesn't match the payee name (e.g. "Netflix" → "Groceries")
- Rules in wrong stage (`pre` vs default) without clear reason

### Output format

Produce a report with these sections:
1. **Summary** — key stats, overall health rating
2. **Critical issues** — dead refs, broken rules → propose specific deletes/fixes
3. **Consolidation opportunities** — duplicates → propose merges
4. **Review candidates** — no-recent-match rules that look suspicious
5. **Proposed rule changes** — numbered list of concrete actions to take

After presenting the report, ask: "Should I apply any of these changes?"
