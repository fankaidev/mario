---
name: next-issue
description: Use when starting work on a GitHub issue - auto-selects lowest open issue without in-progress label, or accepts specific issue ID
---

# next-issue

Pick and start work on a GitHub issue.

## Usage

- `/next-issue` - auto-select lowest available issue
- `/next-issue 5` - work on issue #5

## Workflow

1. **Get issue** - if no ID provided, find open issue without `in-progress` label, sorted by:
   - Priority label first (P0 > P1 > P2 > no priority)
   - Then by issue number (lowest first)
2. **Add label** - mark issue as `in-progress`
3. **Create branch** - `issue-{ID}` from `origin/main`
4. **Show details** - display issue title and body
5. **Enter plan mode** - start planning the implementation

## Commands

```bash
# List available issues
gh issue list --state open --json number,title,labels,body

# Add label
gh issue edit {ID} --add-label "in-progress"

# Create branch from origin/main
git fetch origin main
git checkout -b issue-{ID} origin/main
```

## Error Cases

- No open issues: inform user
- Issue not found: inform user
- Branch exists: ask user how to proceed
- Not a git repo: inform user
