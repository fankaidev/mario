# UC-AUTH-003: Display User Email in Nav Bar

> The logged-in user's email is displayed in the top right corner of the navigation bar.

## Rules

| ID | Rule |
|----|------|
| R1 | User email is fetched from `/api/me` and displayed in the nav bar |
| R2 | Email is shown as small muted text aligned to the right of the nav links |
| R3 | If the `/api/me` request fails or returns no email, nothing is displayed |

## Scenarios

### ai-e2e

| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-AUTH-003-S01 | P1 | ❌ | Given a user is authenticated, When viewing any page with the nav bar, Then the user's email appears in the top right corner of the nav bar | R1, R2 |
| UC-AUTH-003-S02 | P2 | ❌ | Given the `/api/me` request fails, When viewing any page with the nav bar, Then no email is displayed in the nav bar | R3 |
