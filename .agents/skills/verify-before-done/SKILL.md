---
name: verify-before-done
description: Definition of done and the exact verification commands for the Repository Scanner Engine. Use before marking any task, phase or walkthrough as complete, after changing backend or frontend code, or when tests or builds fail.
---

# Verify before you say "done"

A task is done only when all of these pass and you've shown the output.

## Backend

```bash
pip install -r backend/requirements.txt
MOCK_EMBEDDINGS=true pytest tests/ -q
ruff check backend/ && ruff format --check backend/
mypy backend/ --ignore-missing-imports
alembic upgrade head   # against a fresh SQLite file in a temp DATA_DIR
```

## Frontend

```bash
cd frontend
npm ci
npx tsc -b
npm run lint      # zero errors; don't disable rules to pass
npm test
npm run build     # check the chunk sizes in the output
```

## Running app

1. Start the backend and frontend. In the browser, sign up, log out, log in, add a repository, open the graph and the chat, then log out.
2. For UI work, take screenshots at 1440, 768 and 375 px, in light and dark.
3. Check the browser console. It should have no errors and no React warnings.

## Rules

- If a test fails, fix the code. Don't delete the test or weaken it. If you're sure the test itself is wrong, explain why in the Walkthrough.
- Every bug fix comes with a test that fails before the fix and passes after it.
- Never say "should work". Say what you actually ran and what it printed.
- Commit only when everything above is green. Write commit messages in the imperative mood: "Fix token forgery with placeholder secret".
