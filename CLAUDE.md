# Mario - Personal Asset Management

A personal portfolio tracker for US, HK, and China A-share markets. Deployed on Cloudflare Workers with D1 database.

## Mario Workflow

**Always use `pnpm` instead of `npm` for dependency management and script execution.**

**Always use the `gh` CLI for GitHub operations, including issues, labels, pull requests, checks, comments, and reviews.**

**All changes must be issue-driven and follow the BDD workflow (see `docs/bdd.md`):**

1. **Create Issue first** — Before making any changes, create a GitHub Issue with a priority label (`P0`, `P1`, or `P2`) describing:
   - Goal: What problem are we solving or what feature are we adding
   - Approach: How we plan to implement it
   - **Checklist** (must complete before merge):

     ```markdown
     ## Checklist

     - [ ] Use cases and tests updated
     - [ ] CI passes
     - [ ] Sub-agent review submitted on PR
     - [ ] All PR comments resolved
     ```

2. **Audit & Update Use Cases** — Before writing code:
   - Find relevant use cases in `docs/use-cases/{domain}/`
   - **Use Case level**: Delete obsolete use cases, create new ones, or merge/split as needed. Only reuse UC ID if core intent unchanged
   - **Rules**: Add/remove/modify business invariants
   - **Scenarios**:
     - Delete scenarios no longer valid
     - Add new scenarios for new behavior
     - Only reuse scenario ID for wording-only changes; new logic = new ID
     - Mark priority: P0 (must test) / P1 (should test) / P2 (can defer)
     - Mark strategy: `api-test` or `ai-e2e`
     - Mark status: ❌ (not implemented) → ✅ (implemented and tested)

3. **Implement with Tests** — Keep tests in sync with use cases:
   - Delete tests for removed scenarios
   - Add tests for new scenarios
   - Update test names when scenario IDs change
   - Test coverage requirements: P0 (must before merge) / P1 (should) / P2 (can defer)
   - `api-test` → vitest integration tests
   - `ai-e2e` → AI-driven browser tests
   - **Test names must include scenario ID**, e.g.:
     ```typescript
     it('[UC-PORTFOLIO-001-S01] user creates portfolio and sees it in list', async () => {
     ```

4. **Run pre-PR checks** — Before creating a PR, run `pnpm check`, inspect `git diff --stat origin/main...`, and inspect `git diff origin/main... -- docs/use-cases` when use cases may be affected. Confirm the diff scope matches the Issue and no required BDD updates are missing

5. **Create PR for the Issue** — After implementation is complete:
   - Create branch `issue-{ID}` from `origin/main` (or use `/next-issue` skill which does this automatically)
   - Commit changes, push branch, and open a PR
   - Include `Closes #{issue_number}` in PR body to auto-close issue on merge

6. **Wait for PR checks** — Wait for all PR checks to finish. If any check fails, investigate, fix the issue, commit and push the fix to the same PR branch, and wait for checks again until they pass

7. **Review the PR** — Once CI passes, **always spawn a sub-agent** for independent review (avoid bias from implementation context). Sub-agent must:
   - Read Issue description and PR description carefully
   - Verify all requirements in Issue are fully implemented
   - Verify diff matches BDD scenarios
   - Verify all `api-test` scenarios have test coverage (ai-e2e scenarios excluded)
   - Confirm no unrelated changes
   - Evaluate implementation approach for correctness and reasonableness
   - **Submit review via `gh pr review`** (not just a comment)

8. **Handle PR comments** — Inspect all PR comments and reviews. Blocking comments must be fixed or answered with a clear reason why no code change is needed. Non-blocking suggestions may be addressed immediately or converted into a follow-up Issue. After any PR follow-up fix, commit and push the fix to the same PR branch. After handling a comment, reply to the original comment with the fix commit, verification result, or follow-up Issue

9. **Merge** — Before merging, verify all Issue checklist items are checked. Then merge with `gh pr merge --squash --delete-branch`. The linked issue will auto-close via `Closes #XX` keyword

10. **Wait for CD** — After merge, wait for the CD workflow to complete successfully. Development is only considered done when the change is deployed to production. If CD fails, investigate and fix immediately.

This ensures all work is traceable, specified, tested, and documented.

**Exception for trivial changes:** Typos, dependency updates, and config tweaks can skip the full BDD workflow, but must still go through a branch + PR. **Never commit directly to `main`.**

## Autopilot Mode

When instructed to enter **Autopilot**, keep calling `/next-issue` and processing each issue through the full Mario Workflow (design → implement → PR → review → merge → deploy) until no open issues remain without the `in-progress` label.

### Git Commit Rules

- **Never use `git commit --amend` or `git rebase` to rewrite published history.** Always create new commits for fixes and follow-up changes, even on PR branches. Rewriting history breaks review tracking, CI references, and collaborative context.
- **Never force-push (`git push --force`) unless explicitly instructed.** Force-push orphans previous review comments and makes PR threads unrecoverable.

### Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/) format for all commits and PR titles:

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation only
- `chore:` maintenance (deps, config, CI)
- `refactor:` code change that neither fixes a bug nor adds a feature
- `test:` adding or updating tests

Example: `feat: add FIFO lot tracking for sell transactions`

## Language

**All content must be in English**, including:

- Code (variables, functions, comments)
- Documentation (README, CLAUDE.md, use cases, specs)
- Git commit messages
- GitHub issues and PRs
- API responses and error messages

## Architecture

- **Runtime**: Cloudflare Workers (Hono framework)
- **Database**: Cloudflare D1 (SQLite)
- **Auth**: Cloudflare Access + Google OAuth + API tokens (for remote API)
- **Price Data**: Finnhub API (US stocks) + Eastmoney API (HK/CN stocks and funds) + Yahoo Finance (US stock history only)
- **Frontend**: React 19 SPA served as static assets from Workers
- **Cron**: Weekly auto price update + manual trigger via API

## Key Design Decisions

### Multi-Portfolio, Single Currency

- No cross-currency conversion. Each portfolio is isolated to one currency (USD/HKD/CNY).
- P&L is calculated only within the portfolio's own currency.

### FIFO Lot Tracking

- Every buy creates a `lot` with remaining quantity and cost basis (quantity \* price, fee tracked on transaction).
- Every sell consumes lots in FIFO order, creating `realized_pnl` records.
- Lots are immutable; sells update `remaining_quantity` and set `closed=1` when exhausted.

### Fee Semantics by Transaction Type

- `buy`: fee = commission/broker fee
- `sell`: fee = commission/broker fee
- `dividend`: fee = withholding tax

### Append-Only Transactions

- Transactions cannot be edited. Delete + recreate if correction needed.
- Deleting a transaction rolls back its lot effects (restores consumed quantities for sells, removes created lots for buys).

### Prices Table

- Shared across all users. Updated by Cron or manual trigger.
- Only fetches prices for stocks currently held in any portfolio.
- Null price = stock not updated yet or fetch failed.

### Single Source of Truth

**Principle:** Derive data from authoritative sources rather than storing redundant copies. If data can be calculated from other data, calculate it dynamically instead of storing it.

**Benefits:**

- Always correct: if calculation logic is right, result is right
- Simpler code: no need to update derived values in multiple places
- Easier to fix bugs: change one calculation, everywhere updates instantly
- No data inconsistency: stored redundant data can drift out of sync

**Examples:**

1. **Cash Balance** (implemented in issue #133)
   - ❌ Before: Stored `cash_balance` in `portfolios` table, updated incrementally on every transaction/transfer
   - ✅ After: Calculate dynamically from `transfers` and `transactions` tables
   - Why: 10+ update locations led to bugs (dividend bug subtracting instead of adding); dynamic calculation is always correct

2. **Holdings Summary**
   - ❌ Don't store: Total quantity, market value, unrealized P&L in a separate table
   - ✅ Instead: Calculate from `lots` table + current prices
   - Why: Values change when prices update; calculating on-demand ensures freshness

3. **Portfolio P&L**
   - ❌ Don't store: Total P&L, return rate as static values
   - ✅ Instead: Calculate from realized P&L records + current holdings value
   - Why: Values depend on current prices and lot state; calculation reflects reality

**When to store vs. calculate:**

- Store: Historical snapshots (`portfolio_snapshots`), immutable events (`transactions`, `transfers`)
- Calculate: Current state that can be derived (`cash_balance`, `holdings`, `summary`)

## Code Quality

- **Formatter**: `oxfmt` — format all `.ts`, `.tsx`, `.json`, `.sql` files
- **Linter**: `oxlint` — lint all `.ts`, `.tsx` files
- Both run in CI and as pre-commit hooks. No code is merged without passing both.

## Testing

All backend tests are **RESTful integration tests** against real API endpoints.

- Framework: vitest
- Database: real D1 (local via wrangler) or SQLite
- No unit tests, no function mocks, no `vi.mock()`
- External dependencies use **fake objects** implementing the same interface (e.g., `FakeFinnhubClient`)
- Tests seed data via SQL, make HTTP requests, assert on JSON responses

## API Conventions

- Base path: `/api`
- All portfolio-scoped endpoints verify ownership via `user_id`
- JSON responses with consistent envelope: `{ data: T }` or `{ error: string }`
- HTTP status codes: 200 (OK), 201 (Created), 400 (Bad Request), 401 (Unauthorized), 403 (Forbidden), 404 (Not Found), 409 (Conflict)

### Authentication

Dual-auth approach supporting both web UI and remote API access:

1. **Web UI (behind Cloudflare Access)**
   - Browser requests use a Cloudflare Access JWT from `CF_Authorization` cookie or `Cf-Access-Jwt-Assertion` header
   - Worker verifies JWT signature, issuer, and `ACCESS_AUD` before using the email claim
   - First successful verified Access JWT auth auto-creates the user record

2. **Remote API (scripts, CLI, external services)**
   - User generates API tokens in the app UI
   - Remote calls use `Authorization: Bearer <token>` header
   - Tokens stored as SHA-256 hashes in `api_tokens` table

**Auth middleware priority:**

1. If `Authorization: Bearer <token>` exists → validate token hash, get user
2. Else if a Cloudflare Access JWT exists → verify JWT, issuer, and audience, then get or create user
3. Else → 401 Unauthorized

`CF-Access-Authenticated-User-Email` is never sufficient to authenticate a request.

### Symbol Format

- US: `AAPL`, `MSFT`
- HK: `0700.HK` (Tencent), `9988.HK` (Alibaba)
- China A-shares: `600519.SS` (Shanghai), `000858.SZ` (Shenzhen)

## Frontend Stack

- **Framework**: React 19 + Vite
- **Language**: TypeScript (strict mode, `noImplicitAny: true`)
- **Styling**: Tailwind CSS
- **State/Data**: TanStack Query (React Query)
- **Tables**: TanStack Table
- **Forms**: React Hook Form + Zod
- **Routing**: React Router
- **HTTP**: Native Fetch API
- **Build**: Vite builds to `web/dist/`, served as Workers static assets

### TypeScript Requirements

- All source files must be `.ts` or `.tsx`. No `.js` or `.jsx`.
- `strict: true` in `tsconfig.json`.
- All API response types shared between frontend and backend (single source of truth in `shared/types/`).
- No `any` type. Use `unknown` with type guards when type is not known.
- All React components typed with explicit props interfaces.
- All fetch calls typed with generic `<T>` for response shape.

## Directory Structure

```
web/                    # Frontend source
  src/
    components/         # React components
    pages/              # Route pages
    hooks/              # Custom React hooks
    lib/                # Utilities, API client
    types/              # Frontend-specific types
  public/
  index.html
  vite.config.ts
tsconfig.json           # Root tsconfig for shared types
shared/
  types/                # API contract types (shared between frontend and backend)
src/                    # Backend source
  index.ts              # Hono app entry
  routes/               # API route handlers
  middleware/           # Auth middleware
  clients/              # External API clients (Finnhub)
migrations/             # D1 SQL migrations
tests/                  # Integration tests
docs/use-cases/         # BDD use case specifications
```
