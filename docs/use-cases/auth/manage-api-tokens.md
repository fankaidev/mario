# UC-AUTH-001: Manage API Tokens

> Users can generate, view, and revoke API tokens for remote API access (scripts, CLI, external services).

## Rules

| ID | Rule |
|----|------|
| R1 | Token is only displayed once at creation time, never retrievable afterward |
| R2 | Tokens are stored as SHA-256 hashes, never plaintext |
| R3 | Each token has a user-provided name for identification |
| R4 | Token list shows name, created_at, last_used_at (but not the token itself) |
| R5 | Revoking a token immediately invalidates it for all future requests |
| R6 | A user can have multiple active tokens |

## Scenarios

### api-test

| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-AUTH-001-S01 | P0 | ✅ | Given user is logged in via web UI, When creating a token named "CLI Tool", Then return the raw token once, token list shows "CLI Tool" with created_at | R1, R3 |
| UC-AUTH-001-S02 | P0 | ✅ | Given user has token "CLI Tool", When listing tokens, Then return name, created_at, last_used_at, but NOT the raw token | R1, R4 |
| UC-AUTH-001-S03 | P0 | ❌ | Given user has token "CLI Tool", When calling API with valid Bearer token, Then request succeeds, last_used_at is updated |
| UC-AUTH-001-S04 | P0 | ✅ | Given user has token "CLI Tool", When revoking the token, Then token is deleted, subsequent API calls with that token return 401 | R5 |
| UC-AUTH-001-S05 | P0 | ❌ | Given user has no tokens, When calling API with invalid Bearer token, Then return 401 unauthorized |
| UC-AUTH-001-S06 | P1 | ✅ | Given user has tokens "Token A" and "Token B", When revoking "Token A", Then "Token B" still works | R6 |
| UC-AUTH-001-S07 | P1 | ❌ | Given user is not logged in, When attempting to create/list/revoke tokens, Then return 401 unauthorized |

### ai-e2e
(none)
