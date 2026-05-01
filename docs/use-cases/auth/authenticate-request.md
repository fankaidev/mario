# UC-AUTH-002: Authenticate Request

> System authenticates incoming API requests via Mario API tokens or verified Cloudflare Access JWTs.

## Rules

| ID | Rule |
|----|------|
| R1 | `Authorization: Bearer <token>` validates against stored SHA-256 token hashes and loads the token owner from `users` |
| R2 | Bearer token authentication takes priority over Cloudflare Access JWT authentication if both are present |
| R3 | Web authentication requires a Cloudflare Access JWT from `CF_Authorization` cookie or `Cf-Access-Jwt-Assertion` header with verified signature, issuer, and configured audience |
| R4 | `CF-Access-Authenticated-User-Email` alone is never sufficient to authenticate a request |
| R5 | On first successful verified Cloudflare Access JWT auth for a new email, auto-create user record in users table |

## Scenarios

### api-test

| ID | Priority | Status | Scenario | Rules |
|----|----------|--------|----------|-------|
| UC-AUTH-002-S02 | P0 | ✅ | Given request has valid `Authorization: Bearer <token>`, When calling any authenticated endpoint, Then request succeeds with token owner as current user and records token usage | R1 |
| UC-AUTH-002-S03 | P0 | ✅ | Given request has both a valid Bearer token and a valid Cloudflare Access JWT for different users, When calling any authenticated endpoint, Then use Bearer token user | R2 |
| UC-AUTH-002-S04 | P0 | ✅ | Given request has no Bearer token and no Cloudflare Access JWT, When calling any authenticated endpoint, Then return 401 unauthorized |
| UC-AUTH-002-S05 | P0 | ✅ | Given request has invalid Bearer token, When calling any authenticated endpoint, Then return 401 unauthorized |
| UC-AUTH-002-S07 | P0 | ✅ | Given request has a valid Cloudflare Access JWT for user@example.com, When calling any authenticated endpoint, Then request succeeds with user@example.com as current user | R3 |
| UC-AUTH-002-S08 | P0 | ✅ | Given request only has spoofed `CF-Access-Authenticated-User-Email: user@example.com` header, When calling any authenticated endpoint, Then return 401 unauthorized | R4 |
| UC-AUTH-002-S09 | P1 | ✅ | Given a new email authenticates with a valid Cloudflare Access JWT for the first time, When request completes, Then user record created in users table | R5 |
| UC-AUTH-002-S10 | P0 | ✅ | Given request has a Cloudflare Access JWT signed by a trusted key but for the wrong audience, When calling any authenticated endpoint, Then return 401 unauthorized | R3 |

### ai-e2e
(none)
