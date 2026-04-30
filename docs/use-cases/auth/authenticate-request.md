# UC-AUTH-002: Authenticate Request

> System authenticates incoming API requests via Cloudflare Access header or Bearer token.

## Rules

| ID | Rule |
|----|------|
| R1 | If `CF-Access-Authenticated-User-Email` header exists, use it as the authenticated user |
| R2 | If no CF header, check `Authorization: Bearer <token>` and validate against stored token hashes |
| R3 | CF Access header takes priority over Bearer token if both present |
| R4 | On first successful auth for a new email, auto-create user record in users table |
| R5 | Token validation compares SHA-256 hash of provided token against stored hash |

## Scenarios

### api-test

| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-AUTH-002-S01 | P0 | ❌ | Given request has valid `CF-Access-Authenticated-User-Email: user@example.com` header, When calling any authenticated endpoint, Then request succeeds with user@example.com as current user | R1 |
| UC-AUTH-002-S02 | P0 | ❌ | Given request has valid `Authorization: Bearer <token>`, When calling any authenticated endpoint, Then request succeeds with token owner as current user | R2 |
| UC-AUTH-002-S03 | P0 | ❌ | Given request has both CF header and Bearer token (different users), When calling any authenticated endpoint, Then use CF header user | R3 |
| UC-AUTH-002-S04 | P0 | ❌ | Given request has neither CF header nor Bearer token, When calling any authenticated endpoint, Then return 401 unauthorized |
| UC-AUTH-002-S05 | P0 | ❌ | Given request has invalid Bearer token, When calling any authenticated endpoint, Then return 401 unauthorized |
| UC-AUTH-002-S06 | P1 | ❌ | Given new user@example.com authenticates for first time, When request completes, Then user record created in users table | R4 |

### ai-e2e
(none)
