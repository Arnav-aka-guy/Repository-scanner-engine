# Baseline Audit Report — Repository Scanner Engine

**Date:** 2026-10-15  
**Reference Commit:** `9fa5e07`  
**Branch:** `main`  
**Working Tree Status:** Clean  

---

## 1. Runtime Environment & Toolchain

| Component | Version / Status | Notes |
|---|---|---|
| Python | 3.13.11 | CPython 64-bit |
| Node.js | v24.12.0 | |
| npm | 11.13.0 | |
| Ruff | Installed | Checked 95 source files |
| Mypy | Installed | Checked 95 source files |
| Vitest | Installed | Frontend test runner |

---

## 2. Baseline Verification Results

| Check | Command | Result | Notes |
|---|---|---|---|
| Backend Lint & Format | `ruff check backend/ && ruff format --check backend/` | **PASSED** | 95 files clean |
| Backend Typecheck | `mypy backend/ --ignore-missing-imports` | **PASSED** | 0 errors across 95 files |
| Backend Tests | `MOCK_EMBEDDINGS=true pytest tests/ -q` | **229 passed, 3 skipped** | All unit and integration tests green |
| Frontend Typecheck | `cd frontend && npx tsc -b` | **PASSED** | 0 compile errors |
| Frontend Unit Tests | `cd frontend && npm test -- --run` | **39 passed** | All vitest tests green |
| Frontend Lint | `cd frontend && npm run lint` | **PASSED** | 0 ESLint errors |
| Frontend Production Build | `cd frontend && npm run build` | **PASSED** | Built in 863ms |

---

## 3. Existing CI Configuration (.github/workflows/ci.yml)
- **Jobs:** `lint`, `test`, `typecheck`, `build-frontend`.
- Runs on push and PR to `main` and `master`.
- Uses Python 3.13 and Node 20.
- All 4 jobs are currently passing against commit `9fa5e07`.

---

## 4. Audit Findings Register (BUG-01 through BUG-24)

| Bug ID | Summary | Baseline Status | Confirmed Root Cause |
|---|---|---|---|
| BUG-01 | Repository path authorization bypass | **CONFIRMED** | No centralized deny-by-default repo auth service; /api/compare and multiple routes perform partial or no ownership validation. |
| BUG-02 | Shared global state leaks across users | **CONFIRMED** | Global vector store replacement in EmbeddingsService; un-scoped chat history fallback in file storage; un-scoped scan jobs list. |
| BUG-03 | Refresh/reset tokens accepted as access tokens | **CONFIRMED** | `get_required_user` in `backend/security/auth.py:278` calls `verify_token` without `expected_type="access"`. |
| BUG-04 | Password-reset security weaknesses | **CONFIRMED** | Reset tokens lack single-use enforcement; plaintext reset tokens logged in `forgot_password`; refresh sessions not revoked on reset; token version not incremented. |
| BUG-05 | Rate-limit bypass via unverified tokens | **CONFIRMED** | `get_user_or_ip` in `backend/security/rate_limiter.py` decodes unverified JWT headers to derive rate-limiting identity. |
| BUG-06 | Deactivated users and token-version invalidation | **CONFIRMED** | `/api/auth/token` does not check `user.is_active`; access token checks do not reject deactivated users or enforce `token_version`. |
| BUG-07 | `.env.example` prevents startup | **CONFIRMED** | `ALLOWED_ROOTS=~/projects` is not expanded with `Path.expanduser()`, breaking allowlist checks when copied. |
| BUG-08 | Chat stream fails when auth is disabled | **CONFIRMED** | `repo` variable referenced in `_event_stream` without initialization when `auth` is False (`UnboundLocalError`). |
| BUG-09 | GitHub repository imports fail | **CONFIRMED** | `create_repository` attempts to treat GitHub URL as local directory path instead of cloning with `clone_github_repo`. |
| BUG-10 | Duplicate repos cause DB errors & shared-index deletion | **CONFIRMED** | Duplicate imports create duplicate rows; clone directory lacks per-user namespace; deletion removes shared directory for all users. |
| BUG-11 | Embeddings remain stale after rescan | **CONFIRMED** | `_file_embeddings_cache` uses filepath keys only, ignoring file modification time and content hash. |
| BUG-12 | Health/debt/dependency metrics stale after rescan | **CONFIRMED** | Rescan endpoints fail to invalidate `analysis_cache` and parser disk manifests. |
| BUG-13 | Authenticated scan event stream hangs | **CONFIRMED** | Browser `EventSource` lacks auth headers; error handler never resolves/rejects promise in `workspaceStore.ts`. |
| BUG-14 | Failed repository scans never persist FAILED status | **CONFIRMED** | `get_db` rolls back transaction on exception, undoing `repo.status = "FAILED"` flush. |
| BUG-15 | Streaming chat logs users out on token expiration | **CONFIRMED** | `apiPostStream` in `services/api.ts` does not call `refreshAccessToken()` on 401. |
| BUG-16 | Frontend logout does not revoke server sessions | **CONFIRMED** | `authStore.ts:logout` only clears local state without calling `/api/auth/logout` or clearing workspace store. |
| BUG-17 | Scan jobs accumulate or remain stuck after restart | **CONFIRMED** | `load_scan_jobs` does not transition abandoned "running" jobs to "failed" on server startup. |
| BUG-18 | Docker Compose PostgreSQL configuration mismatch | **CONFIRMED** | `DATABASE_ENABLED` defaults to `false` in `docker-compose.yml` despite postgres container being defined. |
| BUG-19 | Invalid repository paths produce HTTP 500 | **CONFIRMED** | `SanitizedRepoPath` raises `ValidationError` inside endpoint body, resulting in unhandled 500 instead of 400/422. |
| BUG-20 | `/api/compare` bypasses ownership and path validation | **CONFIRMED** | `compare_repos` has no user authentication dependency and does not verify user ownership of either repository. |
| BUG-21 | Git clone prompts and leaks internal errors | **CONFIRMED** | `GIT_TERMINAL_PROMPT=0` is missing; raw stderr and full paths are leaked in client-facing HTTP 400 details. |
| BUG-22 | Repository update client uses wrong HTTP method | **CONFIRMED** | `services/repository.ts:updateUserRepository` calls POST instead of PATCH on `/api/repositories/{id}`. |
| BUG-23 | Filenames containing `#` or `?` cannot be opened | **CONFIRMED** | `getFile` passes raw unescaped file path to URL string without encoding individual path segments. |
| BUG-24 | Windows file-based chat history path separator mismatch | **CONFIRMED** | `persistence.py` stores paths with forward slashes while `api/chat.py` queries with Windows backslashes on Windows. |

---

## 5. Protected Features Matrix
The following core capabilities must remain operational throughout all fixes:
1. Repository exploration, file tree display, and file viewing.
2. AST parsing for Python, TypeScript, and JavaScript.
3. Architecture dependency graph generation and circular dependency detection.
4. Scale-invariant Code Health Scoring and Tech Debt analysis.
5. Hybrid BM25 + Vector semantic search.
6. RAG-based AI chat with streaming responses and grounded citations.
7. Local mode operation without database when `AUTH_ENABLED=false` or `DATABASE_ENABLED=false`.
8. Multi-user isolation when authentication is enabled.
