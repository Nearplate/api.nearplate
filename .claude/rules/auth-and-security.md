---
paths:
  - "src/guards/**/*.ts"
  - "src/controllers/**/*.ts"
  - "src/adapters/jwt.adapter.ts"
  - "src/decorators/**/*.ts"
---

# Auth and security

## Roles and tokens

`AuthRole`: `admin`, `restaurant`, `user`, `guest` (`src/domain/enums/auth-role.ts`).

- One JWT secret per role (`JWT_{ROLE}_ACCESS_SECRET`). `JwtAdapter.verifyAccessToken` verifies a token against the secret of the role it _claims_, so a token signed for one role never passes as another.
- **admin / restaurant / user** are stored users (`users` collection, one account per email, one role). **guest** is a signed anonymous token (`POST /auth/guest`); no user row exists.
- **`admin` is never assignable through the API.** Sign-up accepts only `user` or `restaurant`; promote a user to admin directly in the database (the user cache may lag up to 5 minutes).

## Sign-in flows (`AuthService` is the single place that resolves a user)

- **Magic link**: `POST /auth/magic-link {email, role?}` → link emailed via `ResendAdapter` (logged instead when `RESEND_API_KEY` is unset in development; required in production). The link points at the **web app** (`WEB_APP_BASE_URL` + `WEB_APP_MAGIC_PATH`), which POSTs the token to `POST /auth/magic-link/verify`. Never make the API itself consume a token on GET (link scanners burn it).
- **Google**: `POST /auth/google {idToken, role?}`. The client obtains the ID token; `GoogleAuthAdapter` verifies it against Google's JWKS with `GOOGLE_CLIENT_IDS` as audience. `email_verified` must be true (linking by email relies on it). Existing accounts are found by `googleSub` first, then email.
- **Sessions**: access JWT (short-lived) + opaque refresh token (only its sha256 is stored in `auth_sessions`), rotated on every `POST /auth/refresh`; a spent token is 401. `POST /auth/logout` revokes it (204, idempotent).
- The result carries a `status` discriminator in a 200 body (`authenticated` | `role_mismatch` | `sent`) because error bodies are bare `{ statusCode }`.
- Unknown and known emails answer identically for magic links (no account enumeration); the only disclosed case is `role_mismatch`. Requests are rate-limited per email in Redis (`MAGIC_LINK_MAX_PER_EMAIL_PER_HOUR`, 429).
- Tokens (magic link, refresh) are single-use: consume with the repository's atomic `findOneAndDelete`, never find-then-delete.

## Controller auth pattern

```typescript
@Roles(AuthRole.Admin, AuthRole.Restaurant, AuthRole.User)
@Get("me")
public async getMe(@AuthUser() user: TAuthUser) { ... }
```

- `@Roles(...)` = metadata + the generic `AccessTokenGuard`. No token / bad token / expired → `401`. Valid token with a disallowed role → `403`.
- The guard sets `req.authUser = { id, role }` (`id` is the JWT `sub`); read it with `@AuthUser()`. Handlers that need the stored user load it by `id` (401 if the account is gone).
- Never accept an owner/user id from query params or body — take it from the token.
- Return `404` (not `403`) when a resource exists but belongs to another account; enforce it in the repository filter.
- Public routes (login, refresh, logout, guest) simply omit `@Roles`.

## Other rules

- CORS is pinned to `CORS_ORIGIN`; add new HTTP verbs to `main.ts`.
- Behind a proxy/load balancer enable `trust proxy` in `main.ts`, otherwise `@ClientContext()` records the proxy's IP.
- Log PII carefully — use `maskEmail` / `stripSensitiveQuery` from the logger module.
- Env vars are validated in `src/app/modules/config/config.ts` via Zod — add new vars there and to `.env.example`.
- Never hardcode secrets; never commit `.env`.
