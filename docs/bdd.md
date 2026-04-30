# BDD Workflow Specification

## Core Concepts

| Concept | Definition |
|---------|------------|
| **Use Case** | A user-perceivable business capability, describing why the user needs this capability and what value it provides once completed |
| **Scenario** | An executable representative example, explaining what result should be observed after a certain action is triggered in a given state |

- Use Case granularity = business capability (not UI page, API, or test file)
- Scenario = representative example (not exhaustive test list)

## GWT Quality Standard

A Scenario must answer three things:
- **Given**: What business state is required before execution
- **When**: What action did the user or system perform
- **Then**: What is the externally observable result

Format serves clarity — natural language that clearly explains doesn't need to be split into three columns.

## Rules (Business Invariants)

- Rules that hold across multiple Scenarios, optional
- Good for: re-authorization overwrites old connection, invitation link can only be used once
- Not for: user can click button, API returns 200

## Scenario Execution Strategy

| Strategy | Use Case | Execution Method |
|----------|----------|------------------|
| `api-test` | Pure backend logic, permissions, state changes | Standard automated tests |
| `e2e-test` | Real UI, Agent, third-party integrations | E2E tests |

Priority order: api-test > e2e-test

## Priority

| Priority | Meaning | Regression Requirement |
|----------|---------|------------------------|
| P0 | Core path, failure breaks main business capability | PR or nightly stable coverage |
| P1 | Important branches or common edge cases | Should be automated, goes into nightly based on risk |
| P2 | Low-frequency edge cases, auxiliary experience | Can defer automation |

## File Specification

```text
docs/use-cases/
  {domain}/
    {use-case-name}.md
```

Each file contains one Use Case, including: Use Case description, Rules table, Scenarios table (grouped by api-test / e2e-test / manual).

Scenario table format:

```text
| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-DOMAIN-001-S01 | P0 | ❌ | ... |  |
| UC-DOMAIN-001-S02 | P0 | ✅ | ... | R1 |
```

- **Status column** (api-test only): `✅` = automated test implemented, `❌` = not yet implemented

### ID Naming Convention

- Use Case ID: `UC-{DOMAIN}-{NNN}` (e.g., `UC-PORTFOLIO-001`, `UC-AUTH-002`)
- Scenario ID: `UC-{DOMAIN}-{NNN}-S{NN}` (e.g., `UC-PORTFOLIO-001-S01`)
- Test names must include the scenario ID for traceability:
  ```typescript
  it('[UC-PORTFOLIO-001-S01] user creates portfolio and sees it in list', async () => {
  ```

- Rules column only contains related Rule IDs, leave blank if none
- Empty strategy groups show `(none)`, don't delete the section
- Scenario ID is globally unique across the project
- **When modifying scenarios**: Prefer assigning a new ID to avoid drift between specs and tests. If reusing the same ID, you must update the corresponding test implementation to match.

## Non-Goals

- Scenarios don't need 1:1 correspondence with test cases
- Don't need to exhaustively list all edge cases
