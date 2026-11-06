# Security Policy & Architecture

## Reporting Security Issues

We take the security of **Repository Scanner Engine** seriously. If you discover a security vulnerability, please do not open a public GitHub issue.

Please report vulnerabilities directly to the maintainers or via a private security advisory on GitHub. We aim to acknowledge receipt of all vulnerability reports within 24 hours and provide an initial assessment or remediation timeline within 72 hours.

---

## Security Architecture & Defense in Depth

### 1. Authentication & Session Management
- **Password Hashing**: Implemented strictly using **Argon2id** (`passlib[argon2]`), resilient against GPU-accelerated brute-force attacks.
- **JWT Cryptography**: Backed exclusively by audited **PyJWT** using HMAC-SHA256 with minimum 256-bit entropy keys. Redundant and unmaintained libraries (`python-jose`) have been eliminated.
- **Token Versioning & Revocation**: Every token payload includes a `token_version` claim tied to the user record in PostgreSQL. Password resets and account invalidations immediately bump the token version, instantly invalidating all active sessions.
- **Zero Insecure Defaults in Production**: The application refuses to boot in staging or production (`APP_ENV != 'development'`) if default or placeholder secret keys are detected.

### 2. Multi-Tenant Authorization & Data Boundary
- **Adversarial IDOR Protections**: All repository access points (`/api/repository/*`, `/api/scans/*`, `/api/impact/*`, `/api/review/*`, `/api/health-score/*`) enforce multi-user authorization via `authorize_repository_access` and `get_owned_repository`.
- **Cross-User Repository Isolation**: Users cannot inspect, compare, scan, or query repositories owned by another user without explicit role-based access grants.
- **Cross-User Chat History Isolation**: Chat history conversations are scoped strictly to the authenticated `user_id` and verified repository scope.

### 3. File System & Subprocess Safety
- **Path Traversal & Symlink Attacks**: Every repository path is validated via `SanitizedRepoPath`, resolving real filesystem paths and verifying they reside inside authorized base directories. Directory escape sequences (`../`, `..\`) are rejected.
- **Git Subprocess Execution**: Subprocess calls avoid shell interpretation (`shell=False`) and pass arguments as strict lists. URLs are validated against allowed protocols (`https://`, `ssh://`) and malicious argument injection (`--upload-pack`, `-u`) is blocked before calling Git.
- **SSRF Defenses**: Arbitrary network requests to private IP ranges (`127.0.0.1`, `10.0.0.0/8`, `192.168.0.0/16`, `169.254.169.254`) are prohibited during external repository cloning.

### 4. API Hardening & Error Handling
- **Security Headers**: Standard response headers configured via middleware:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `X-XSS-Protection: 1; mode=block`
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- **Rate Limiting**: Sliding window rate limiter protects against brute-force authentication and API denial-of-service, returning `429 Too Many Requests` when limits are exceeded.
- **Safe Error Responses**: Production error handlers mask internal database tracebacks and system internals, returning uniform JSON payloads with correlation IDs:
  ```json
  {
    "detail": "Requested operation failed.",
    "code": "OPERATION_FAILED"
  }
  ```
- **Readiness Probes Without Credential Leakage**: Probes in `/health/ready` check provider availability without logging or exposing API keys or credentials.

### 5. Infrastructure & Container Hardening
- **Localhost Port Binding**: Database ports in `docker-compose.yml` are bound exclusively to `127.0.0.1:${POSTGRES_PORT:-5432}:5432`, preventing exposure on public interfaces.
- **Non-Root Execution**: Production Docker containers execute under dedicated non-root application users (`appuser:appgroup`).
