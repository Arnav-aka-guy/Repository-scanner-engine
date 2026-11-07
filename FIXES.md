# Repository Scanner Engine V2.1 — Engineering Upgrade & Fixes Log

**Release:** V2.1  
**Target Git Branch:** `upgrade/v2.1`  
**Date:** November 2026  
**Status:** All tasks completed, verified, and passing 100% of automated test suites.

---

## 1. Executive Summary

This document details the complete engineering upgrade and bug resolution performed on **Repository Scanner Engine (Antigravity Engine V2.1)**. Every confirmed backend bug (A1–A7), frontend architectural defect (B1–B13), target user workflow scenario (Section C), and verification criteria (Section D & E) has been implemented and validated with automated regression test suites.

---

## 2. Backend Fixes (A1–A7)

### A1. Local Mode Default Overriding Explicit `AUTH_ENABLED=true`
- **File Changed:** `backend/core/config.py`, `backend/security/auth.py`
- **Problem:** `app_mode` defaulted to `"local"`, and `_validate_and_normalize()` forced `auth_enabled = False` even when `AUTH_ENABLED=true` was set explicitly in the environment. `get_current_user` returned an anonymous user for all requests, disabling user isolation and weak JWT checks.
- **Changes Made:**
  - Used Pydantic's `self.model_fields_set` in `backend/core/config.py` so an explicit `AUTH_ENABLED=true` strictly overrides the local mode default.
  - Enforced the invariant that `local_mode = not auth_enabled` and `auth_enabled != local_mode`.
  - Refactored `get_current_user` in `backend/security/auth.py` to check only `if not settings.auth_enabled:`.
- **Verification:**
  - All 7 previously failing isolation tests passed immediately:
    - `tests/test_hardening_bugs.py::test_cross_user_isolation_across_endpoints`
    - `tests/test_multiuser_repositories.py::TestUserDataIsolation::test_user_b_cannot_access_user_a_repository`
    - `tests/test_phase2_security_isolation.py::TestUserIsolationAcrossRoutes::test_user_b_receives_404_by_id_across_routes`
    - `tests/test_phase2_security_isolation.py::TestUserIsolationAcrossRoutes::test_user_b_receives_403_by_path_across_data_routes`
    - `tests/test_security.py::TestAuth::test_protected_route_enforcement_when_auth_enabled`
    - `tests/test_v2_upgrades.py::TestAuthEnforcement::test_auth_enabled_with_weak_secret_fails_startup`
    - `tests/test_v2_upgrades.py::TestAuthEnforcement::test_auth_enabled_with_strong_secret_ok`
  - Added new regression tests in `tests/test_v2_upgrades.py` for explicit auth override.

### A2. Startup Crash with `.env.example` on List Fields
- **File Changed:** `backend/core/config.py`
- **Problem:** `.env.example` provides `ALLOWED_ROOTS=~/projects`. Pydantic-settings attempted to JSON-decode `list[str]` fields prior to running `mode="before"` validators, crashing with `SettingsError`.
- **Changes Made:**
  - Annotated `allowed_roots` and `trusted_proxies` with `Annotated[list[str], NoDecode]` using `pydantic_settings.NoDecode`.
  - Upgraded `pydantic-settings` to version 2.16.2.
  - Added support for tilde expansion (`~/...`), comma-delimited strings (`/a,/b`), and JSON lists (`["/a","/b"]`).
- **Verification:**
  - Verified backend startup directly with `Settings(_env_file='.env.example')`.
  - Added regression tests in `tests/test_v2_upgrades.py` asserting all 3 formats parse cleanly without startup errors.

### A3. Multi-User Repository `source_path` vs `path` Discrepancy
- **File Changed:** `backend/security/repo_auth.py`, `backend/api/repositories.py`
- **Problem:** The DB schema defines `source_path`, but disk lookup logic checked `source_path or path`, while local directory imports saved to `path`. File resolution and deletion failed for repositories where `source_path` was a virtual name or null.
- **Changes Made:**
  - Created canonical helper `repo_disk_path(repo)` in `backend/security/repo_auth.py` that prefers `repo.path or repo.source_path`.
  - Updated all authorization and lookup routines in `backend/api/repositories.py` (`scan_user_repository`, `delete_repository`) to use `repo_disk_path`.
  - Added `path: str | None = None` to the `RepositoryItem` schema and populated it in `_to_item`.
- **Verification:**
  - Added regression tests in `tests/test_multiuser_repositories.py` asserting disk paths resolve accurately for both local directories and cloned repositories.

### A4. Background Scanning Pipeline Unification & Status Persistence
- **File Changed:** `backend/api/repository.py`, `backend/api/repositories.py`
- **Problem:** Scanning operations had duplicate background worker routines (`queue_scan_job` vs `background_tasks.add_task(_run_scan_job)`) that did not update the `repositories` database table status, leaving repos in `SCANNING` permanently.
- **Changes Made:**
  - Unified background jobs to use the async job worker pipeline.
  - Modified `POST /api/repositories/{id}/scan` to queue the scan and return `202 Accepted` with `job_id`.
  - Added database status updates (`SCANNING` -> `READY` with `file_count`/`total_lines`, or `FAILED` with `error_message`) committed inside the background worker execution loop.
- **Verification:**
  - Added `test_scan_user_repository_returns_202_and_job_id` in `tests/test_v2_upgrades.py`.

### A5. Health History Snapshot Timestamp Collision
- **File Changed:** `backend/services/health_history.py`
- **Problem:** Snapshot IDs were generated from millisecond timestamps (`f"snap_{int(time.time()*1000)}"`). Rapid back-to-back snapshots resulted in identical IDs and collisions.
- **Changes Made:**
  - Replaced millisecond IDs with collision-proof UUIDs: `f"snap_{uuid.uuid4().hex}"`.
  - Ensured chronological snapshot sorting strictly by ISO-8601 timestamp.
- **Verification:**
  - Ran `tests/test_v2_1_features.py::test_health_history_snapshot_and_comparison`; passed without collisions.

### A6. Local Mode Support for Repository Endpoints
- **File Changed:** `backend/api/repositories.py`, `backend/db/database.py`, `backend/db/repositories.py`
- **Problem:** `/api/repositories/*` endpoints used `get_required_user`, returning 401 Unauthorized in local mode even when the user wanted to save and manage repositories without auth.
- **Changes Made:**
  - Switched repository endpoints from `get_required_user` to `get_current_user`.
  - In `init_db()`, created a default local user (`id=1, email="local@localhost"`).
  - Maintained strict token requirements for `/api/auth/me` to protect auth verification.
- **Verification:**
  - Added `TestLocalModeRepositoryWorkflow` in `tests/test_v2_upgrades.py` testing list, create, scan, and delete in local mode without credentials.

### A7. Code Quality, Formatting, and User-Facing Errors
- **File Changed:** `backend/api/repository.py`, `backend/api/search.py`
- **Problem:** Unformatted code, missing status imports, generic error strings on scan limit/git failures, and unnecessary `repo_path` requirements in local search.
- **Changes Made:**
  - Formatted all backend code with `ruff format` and resolved all linter issues with `ruff check`.
  - Added human-readable error messages for specific scan failure types (`FILE_LIMIT_EXCEEDED`, `LINE_LIMIT_EXCEEDED`, `GIT_CLONE_FAILED`, permission errors).
  - Enforced `repo_path` requirement in `backend/api/search.py` only when multi-user isolation (`auth_enabled`) is active.
- **Verification:**
  - `ruff check backend` clean; `ruff format --check backend` clean; all 255 pytest tests passing.

---

## 3. Frontend Fixes (B1–B13)

### B1. Blank Page Freezing & Layout Remounts
- **Files Changed:** `frontend/src/App.tsx`, `frontend/src/layouts/MainLayout.tsx`, `frontend/src/components/ErrorBoundary.tsx`
- **Problem:** `<Routes key={location.pathname}>` wrapped in `<AnimatePresence mode="wait">` destroyed and remounted the entire application shell on every route transition, causing blank flashes, lost scroll positions, and unrecoverable error boundaries.
- **Changes Made:**
  - Removed `location={location}` and `key={location.pathname}` from `<Routes>`.
  - Removed the outer `<AnimatePresence>` from `<Routes>`, moving page transitions into `MainLayout.tsx` wrapping only `<Outlet />`.
  - Added `resetKey?: string | number` to `ErrorBoundary.tsx` with `componentDidUpdate` lifecycle resetting `hasError` when the route changes.
- **Verification:**
  - Verified with `frontend/src/tests/navigation.test.tsx` testing error recovery across navigation.

### B2. Repository State Leakage on Switch
- **Files Changed:** `frontend/src/stores/workspaceStore.ts`, `frontend/src/pages/MyRepositories.tsx`, `frontend/src/components/RepositorySwitcher.tsx`, `frontend/src/layouts/MainLayout.tsx`
- **Problem:** Switching repositories set `activeRepository` without resetting old files, trees, selected details, graphs, or chat history, causing the old repo's data to display on the newly selected repo.
- **Changes Made:**
  - Implemented `openRepository(repo: SavedRepository): Promise<void>` in `workspaceStore.ts`.
  - Clears repository-scoped state (`files: []`, `fileTree: []`, `selectedFilePath: null`, `selectedFileDetail: null`, `graphData: null`, `analysisResult: null`, `searchResults: []`, `chatMessages: []`).
  - Resolves disk path (`repo.path || repo.source_path`), maps status, and preloads file tree when `READY`.
  - Replaced all calls to `setActiveRepository` with `openRepository`.
- **Verification:**
  - Verified with `openRepository resets stale state and populates repository data` in `frontend/src/tests/workspaceStore.test.ts`.

### B3. Repository Validation on Startup and Refresh
- **File Changed:** `frontend/src/layouts/MainLayout.tsx`
- **Problem:** Refreshing or navigating directly to a repository page didn't verify whether the repository existed or belonged to the user, leading to hanging layouts on deleted repositories.
- **Changes Made:**
  - In `MainLayout.tsx`, added route inspection for `targetRepoId`.
  - Calls `getUserRepository(targetRepoId)` on mount; if it returns 404 or errors, calls `clearWorkspace({ silent: true })` and navigates to `/app`.
  - If no repository is active in store or URL, redirects cleanly to `/app`.
- **Verification:**
  - Tested in `frontend/src/tests/navigation.test.tsx` verifying 404 repo redirects to `/app`.

### B4. Route Architecture Consolidation
- **Files Changed:** `frontend/src/App.tsx`, `frontend/src/hooks/useRepoNavigate.ts`, `frontend/src/components/Sidebar.tsx`, `frontend/src/components/CommandPalette.tsx`
- **Problem:** Two competing route structures existed: unscoped routes (`/overview`, `/explorer`) and scoped routes (`/app/repositories/:id/...`), leading to broken navigation and 404s.
- **Changes Made:**
  - Standardized on scoped routes: `/app/repositories/:repositoryId/<page>`.
  - Created `<LegacyRouteRedirect targetPage="..." />` for legacy paths to redirect to scoped URLs if a repo is active, or `/app` otherwise.
  - Created `useRepoNavigate()` hook to generate repository-scoped links throughout `Sidebar.tsx` and `CommandPalette.tsx`.
- **Verification:**
  - Tested in `frontend/src/tests/navigation.test.tsx`.

### B5. "My Repositories" Local Mode & Dynamic Quotas
- **Files Changed:** `frontend/src/pages/MyRepositories.tsx`, `frontend/src/components/RepositorySwitcher.tsx`
- **Problem:** `MyRepositories.tsx` redirected to `/login` whenever `!token`, blocking local mode users. The 10-repository quota was hardcoded.
- **Changes Made:**
  - Updated auth condition in `MyRepositories.tsx`: `if (!authEnabled || !!token) { fetchRepos(); } else { navigate('/login'); }`.
  - Dynamic quota limit extracted from backend `response.max_limit` (with `response.available_slots`).
- **Verification:**
  - Tested in `frontend/src/tests/multiUserAndLanding.test.tsx`.

### B6. Stale Repository ID Attachment in `scanRepo`
- **File Changed:** `frontend/src/stores/workspaceStore.ts`
- **Problem:** `scanRepo` attached the previously active `activeRepositoryId` when scanning a new folder without `repoId`.
- **Changes Made:**
  - `scanRepo` queries `getUserRepositories()`; if not found, it creates a new database record via `createUserRepository({ name, source_path, source_type })` to acquire a fresh ID.
  - Commits `activeRepositoryId: resolvedRepoId` without falling back to stale IDs.
- **Verification:**
  - Tested in `frontend/src/tests/workspaceStore.test.ts`.

### B7 & B8. Service Parameter Standardization & `repository_id` Support
- **Files Changed:** `frontend/src/services/*`, `backend/api/repository.py`, `backend/api/search.py`, `backend/api/chat.py`, `backend/api/documentation.py`
- **Problem:** Inconsistent parameter naming (`{ path }` vs `{ repo_path }` in `healthHistory.ts`), and missing `repository_id` support across service methods and backend routes.
- **Changes Made:**
  - Corrected `fetchHealthHistory` and `compareHealthSnapshots` to pass `repo_path` or `repository_id`.
  - Updated all frontend service functions to accept and prefer `repository_id` (with fallback to `repo_path`).
  - Added `repository_id` query/payload support across all corresponding backend API routes.
- **Verification:**
  - Tested in `frontend/src/tests/serviceParams.test.ts`.

### B9. API Client Consolidation & Deduplication
- **Files Changed:** `frontend/src/services/api.ts`, `frontend/src/stores/authStore.ts`, `frontend/src/stores/workspaceStore.ts`
- **Problem:** Duplicate 401 refresh logic across 5 methods; header stripping on retry; duplicate logout calls; noisy "Workspace Cleared" toast on token expiry; lack of AbortSignal support.
- **Changes Made:**
  - Consolidated into a central `requestRaw` and `request<T>` implementation.
  - Deduplicated in-flight `refreshAccessToken()` with single refresh call across concurrent requests.
  - Preserved original headers (including `Content-Type`) during retries.
  - Added `AbortSignal` support via `options.signal`.
  - Handled 204 No Content and empty responses gracefully without parsing errors.
  - Formatted HTML error pages (SPA fallbacks, 502s) into clean, human-readable messages.
  - Made `clearWorkspace({ silent: true })` suppress toast alerts during logout.
- **Verification:**
  - Added `frontend/src/tests/apiClient.test.ts` (6 tests passing).

### B10. Race Conditions on Rapid Repository / Page Switches
- **Files Changed:** `frontend/src/stores/workspaceStore.ts`, `frontend/src/pages/ArchitectureViewer.tsx`, `frontend/src/pages/ChangeImpact.tsx`, `frontend/src/pages/CodeReview.tsx`, `frontend/src/pages/DocumentationGenerator.tsx`, `frontend/src/pages/SemanticSearch.tsx`, `frontend/src/pages/DependencyGraph.tsx`
- **Problem:** Rapidly switching repositories caused late async responses to overwrite state for the new repository.
- **Changes Made:**
  - In all async store actions (`fetchGraph`, `runAnalysis`, `searchCode`, `generateDocs`, `loadFileDetail`, `loadPersistentChatHistory`), recorded `activeRepositoryId` at the start and aborted state commits if the ID changed before resolution.
  - In page components, used `AbortController` in effects and button handlers to cancel in-flight requests on unmount or repository change.
- **Verification:**
  - Added `frontend/src/tests/raceConditions.test.ts` (4 tests passing).

### B11. Silent Failures, Error Separation, and Walkthrough Queue
- **Files Changed:** `frontend/src/pages/Overview.tsx`, `frontend/src/stores/workspaceStore.ts`, `frontend/src/pages/AIChat.tsx`, `frontend/src/components/ChatMessage.tsx`
- **Problem:** Silent 8-second `Promise.race` timeout in `Overview.tsx` leaving cards blank without error; file read errors overwriting `scanError` in status bar; `setTimeout` for assistant walkthrough navigation; raw unhelpful Ollama connection errors.
- **Changes Made:**
  - Removed the 8-second silent timeout from `Overview.tsx`. Added error panel with retry button when health metrics fail to load.
  - Added dedicated `fileError` field in `workspaceStore.ts`, leaving `scanError` purely for indexing jobs.
  - Added `queueChatMessage()` in `workspaceStore.ts` and consumed it on `AIChat.tsx` mount.
  - Added a friendly setup card in `ChatMessage.tsx` with a direct link to Settings when LLM connection errors occur.
- **Verification:**
  - Added `frontend/src/tests/silentFailuresAndErrors.test.tsx` (3 tests passing).

### B12. Scan Progress Coordination & Job Cancellation
- **Files Changed:** `frontend/src/stores/workspaceStore.ts`, `frontend/src/services/repository.ts`, `frontend/src/components/StatusBar.tsx`
- **Problem:** Arbitrary 120-second timeout cancelling UI while backend kept running; SSE and polling running concurrently; no way to cancel an in-progress scan.
- **Changes Made:**
  - Removed the hard 120s timeout. Added a watchdog that polls only if SSE goes quiet for >3 seconds, and times out only if stalled with zero progress for 5 minutes.
  - Implemented `cancelScanJob` calling `POST /api/repository/scan/jobs/{id}/cancel` and exposed `cancelScan()` in `workspaceStore.ts`.
  - Added a Cancel button in `StatusBar.tsx` while scanning.
- **Verification:**
  - Added `frontend/src/tests/scanProgress.test.tsx` (2 tests passing).

### B13. Multi-User Browser Storage Isolation
- **Files Changed:** `frontend/src/stores/workspaceStore.ts`, `frontend/src/stores/authStore.ts`
- **Problem:** `antigravity-workspace` in `localStorage` was unnamespaced, leaking recent repositories and chat history between different users on the same machine.
- **Changes Made:**
  - Created `userNamespacedStorage` dynamically keying storage by user ID: `antigravity-workspace:user-{id}` (or `antigravity-workspace:local` in local mode).
  - Ensured `clearWorkspace({ silent: true })` is called on user changes and logout to wipe in-memory state.
- **Verification:**
  - Added `frontend/src/tests/multiUserStorage.test.ts` (3 tests passing).

---

## 4. Section C: Target Workflow Verification Log

Manual and automated walkthrough of the canonical end-to-end user workflow:

| Step | Workflow Scenario | Local Mode (`AUTH_ENABLED=false`) | Cloud Mode (`AUTH_ENABLED=true`) |
|---|---|---|---|
| **1** | Open `/` and click "Open app" | Navigates directly to `/app` | Redirects unauthenticated users to `/login` |
| **2** | Auth flow | N/A (bypassed, auto-assigned User ID 1) | Login/Signup succeeds, returns JWT, redirects to `/app` |
| **3** | `/app` repository list | Displays repositories for default local user with dynamic quota | Displays only authenticated user's repositories with live quota |
| **4** | Add repository (Local or GitHub) | Creates record, starts background scan, streams progress, turns `READY` | Validates quota, starts sandboxed scan, updates DB to `READY` |
| **5** | Open repository | Loads files, file tree, navigates to `/app/repositories/:id/overview` | Scoped route active; sidebar links preserve repository ID |
| **6** | Page isolation & error handling | All pages display only active repo's data; error boundaries catch errors locally | Data strictly isolated; no cross-repository leakage |
| **7** | Repository switcher | Clears old files, graphs, and chat; cleanly loads new repo | Instant clean transition with no stale state flash |
| **8** | F5 Page Refresh | Restores active repository from URL param; remains on same page | Verifies ownership via `getUserRepository(id)`; remains on page |
| **9** | Rescan | Header/Sidebar rescan queues async job and refreshes file stats | Works for both local directories and GitHub clones |
| **10** | Delete repository | Deletes repository and index; redirects to `/app` if active | Deletes user repository and enforces ownership checks |
| **11** | Logout & User Switch | N/A | Clears workspace and tokens; new user sees empty/isolated storage |

- **Automated Verification:** Added `frontend/src/tests/targetWorkflowE2E.test.tsx` verifying steps 4, 5, 7, and 8.

---

## 5. Verification Checklist & Test Results

| Verification Suite | Target Requirement | Status | Result Details |
|---|---|---|---|
| **Backend Tests** | `pytest tests -q` | **PASS** | **255 passed, 0 failed, 3 skipped** |
| **Backend Linter** | `ruff check backend` | **PASS** | Clean (All checks passed) |
| **Backend Formatter** | `ruff format --check backend` | **PASS** | Clean (108 files already formatted) |
| **Startup Check** | Load `.env.example` | **PASS** | Clean startup without `SettingsError` |
| **Frontend TypeScript** | `npx tsc -b` | **PASS** | 0 type errors |
| **Frontend Linter** | `npm run lint` | **PASS** | 0 errors (253 non-fatal warnings) |
| **Frontend Tests** | `npx vitest run` | **PASS** | **21 test files passed, 77 tests passed** |
| **Frontend Build** | `npm run build` | **PASS** | Production client built in 976ms |

---

## 6. Housekeeping

- Verified that `frontend/dist/`, `data/`, and `__pycache__/` are present in `.gitignore` and not tracked by Git.
- Updated `readme.md` version badge to **2.1.0** and updated test passing counts (**332+ passing**).
- All changes committed into Git branch `upgrade/v2.1`.
