---
name: auth-security
description: Rules for authentication, sessions, passwords, tokens and data ownership in the Repository Scanner Engine FastAPI backend and React frontend. Use when touching login, signup, password reset, JWTs, cookies, user models, or any API route that reads user data or repositories.
---

# Auth and security rules

## Never do these

- Never fall back to a default user id (such as `1`), and never invent a profile when the user isn't found. Missing or invalid user → 401.
- Never accept a JWT signed with a placeholder or short secret. The secret must be at least 32 random characters.
- Never store access tokens in localStorage or sessionStorage. Keep them in memory. The refresh token goes in an httpOnly cookie.
- Never log passwords, tokens, reset links (except the console in local mode), or full Authorization headers.
- Never trust a `repo_path`, file path or record id from the client without checking that it belongs to the current user. Use the `get_owned_repository` dependency.
- Never show different error messages for "no such email" and "wrong password".
- Never add a backdoor, a master password or a debug login route.

## Always do these

- Hash passwords with `pwdlib` (Argon2id). Still verify old bcrypt hashes, and rehash them with Argon2id on the next successful login.
- Allow passwords of 10 to 128 characters. Don't send raw passwords longer than 72 bytes to bcrypt.
- Use PyJWT, and give every token these claims: `iss`, `aud`, `iat`, `exp`, `jti`, `type`, `ver`. Check `type` and `ver` against the database on every request.
- When a password is changed or reset, or the user signs out of all devices, increment `token_version` and revoke their refresh tokens.
- Store only the SHA-256 hash of a reset token or refresh token, never the raw token. Reset tokens are single-use and expire after 30 minutes.
- Rate-limit by IP and by email on login, register and forgot-password.
- For an unknown email, still run a dummy password check, so the response takes the same time as for a real account.
- Make every schema change as an Alembic migration. Never use `create_all` in app code.

## Tests every auth change needs

- the happy path
- wrong password
- unknown email (same message)
- a forged token signed with a wrong secret
- an expired token
- a deleted or deactivated user
- a stale `ver` after a password change
- user A trying to reach user B's data (expect 404)
- rate limit hit (expect 429)

## Frontend

- Send every request through one `apiFetch`. On a 401, run a single refresh that all waiting requests share, retry once, and if that fails, log out and redirect to `/login?next=`.
- Only accept `next` if it starts with a single `/`. This blocks open-redirect attacks.
- Set `autocomplete` correctly on forms. Show errors inline and announce them with `aria-live`.
