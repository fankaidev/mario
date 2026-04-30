# Mario - Personal Asset Management

A personal portfolio tracker for US, HK, and China A-share markets. Deployed on Cloudflare Workers with D1 database.

## Development Workflow

**Always use `pnpm` instead of `npm` for dependency management and script execution.**

**Always use the `gh` CLI for GitHub operations, including issues, labels, pull requests, checks, comments, and reviews.**

**All changes must be issue-driven and follow the BDD workflow (see `docs/bdd.md`):**

1. **Create Issue first** — Before making any changes, create a GitHub Issue describing:
   - Goal: What problem are we solving or what feature are we adding
   - Approach: How we plan to implement it

2. **Audit & Update Use Cases** — Before writing code:
   - Audit existing use cases for accuracy against current behavior
   - Find or create the relevant use case in `docs/use-cases/`
   - Define Rules (business invariants)
   - Define Scenarios (Given/When/Then) with priorities (P0/P1/P2)
   - Mark execution strategy: `api-test` or `e2e-test`

3. **Implement with Tests** — For each scenario:
   - P0 scenarios: must have automated tests before PR merge
   - P1 scenarios: should be automated, can follow shortly after
   - P2 scenarios: can defer automation
   - `api-test` → vitest integration tests
   - `e2e-test` → AI-driven browser tests
   - **Test names must include UC scenario ID**, e.g.:
     ```typescript
     it('[UC-PORTFOLIO-001-S01] user creates portfolio and sees it in list', async () => {
     ```

4. **Run pre-PR checks** — Before creating a PR, run `pnpm check`, inspect `git diff --stat origin/main...`, and inspect `git diff origin/main... -- docs/use-cases` when use cases may be affected. Confirm the diff scope matches the Issue and no required BDD updates are missing

5. **Create PR for the Issue** — After implementation is complete, commit the changes, push the branch, and open a PR linked to the Issue

6. **Wait for PR checks** — Wait for all PR checks to finish. If any check fails, investigate, fix the issue, commit and push the fix to the same PR branch, and wait for checks again until they pass

7. **Review the PR** — Review the PR once checks pass. Start a subagent to perform an independent PR review so the review is less biased by the implementation context. The review must verify the diff matches the Issue and BDD scenarios, confirm no unrelated changes were introduced, and leave a PR comment summarizing the review result. If the subagent finds a blocking issue, fix it, commit and push the fix to the same PR branch, wait for checks again, and re-verify the specific risk before marking the review complete

8. **Handle PR comments** — Inspect all PR comments and reviews. Blocking comments must be fixed or answered with a clear reason why no code change is needed. Non-blocking suggestions may be addressed immediately or converted into a follow-up Issue. After any PR follow-up fix, commit and push the fix to the same PR branch. After handling a comment, reply to the original comment with the fix commit, verification result, or follow-up Issue

9. **Merge after approval** — After CI passes, independent review is complete, and all blocking comments are handled, merge the PR with `gh pr merge --squash` unless the user asks to leave it open

This ensures all work is traceable, specified, tested, and documented.

**Exception for trivial changes:** Typos, dependency updates, and config tweaks can skip the full workflow — commit directly to main with a clear commit message.

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
- **Price Data**: Finnhub API (US stocks) + Yahoo Finance (HK/China A-shares)
- **Frontend**: React 19 SPA served as static assets from Workers
- **Cron**: Weekly auto price update + manual trigger via API

## Key Design Decisions

### Multi-Portfolio, Single Currency
- No cross-currency conversion. Each portfolio is isolated to one currency (USD/HKD/CNY).
- P&L is calculated only within the portfolio's own currency.

### FIFO Lot Tracking
- Every buy creates a `lot` with remaining quantity and cost basis (quantity * price, fee tracked on transaction).
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
   - Trust `CF-Access-Authenticated-User-Email` header directly
   - CF Access validates user before request reaches Workers

2. **Remote API (scripts, CLI, external services)**
   - User generates API tokens in the app UI
   - Remote calls use `Authorization: Bearer <token>` header
   - Tokens stored as SHA-256 hashes in `api_tokens` table

**Auth middleware priority:**
1. If `CF-Access-Authenticated-User-Email` header exists → use it
2. Else if `Authorization: Bearer <token>` exists → validate token hash, get user
3. Else → 401 Unauthorized

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
