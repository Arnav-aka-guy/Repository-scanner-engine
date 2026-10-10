# User Management CLI & Authentication Administration

This document describes the administrative CLI tool for managing user accounts in the Repository Scanner Engine.

## CLI Location

```bash
backend/scripts/manage_users.py
```

## Available Commands

### 1. List All Users
Displays all registered users with their ID, full name, email, active status, and token version.

```bash
python backend/scripts/manage_users.py list
```

### 2. Create User
Creates a new user account with Argon2id password hashing. If `--password` is omitted, a cryptographically secure random password is generated and displayed.

```bash
python backend/scripts/manage_users.py create --name "Alice Smith" --email "alice@example.com"
# Or with explicit password:
python backend/scripts/manage_users.py create --name "Alice Smith" --email "alice@example.com" --password "MySecretPass123!"
```

### 3. Reset User Password
Updates the password for a specific user to Argon2id hash, increments their `token_version` (invalidating all issued JWTs), and revokes all active refresh tokens in the database.

```bash
python backend/scripts/manage_users.py reset-password --email "alice@example.com"
# Or with explicit password:
python backend/scripts/manage_users.py reset-password --email "alice@example.com" --password "NewPassword123!"
```

### 4. Bulk Reset All Passwords
Resets all existing user accounts in the database to individual secure random passwords, invalidates all sessions and tokens, and prints the result.

```bash
python backend/scripts/manage_users.py reset-all-passwords
```

### 5. Delete User
Removes a user account, revoking their refresh tokens and deleting owned repositories.

```bash
python backend/scripts/manage_users.py delete --email "alice@example.com"
```

## Security & Architecture Notes
- Password hashing uses standard Argon2id via `pwdlib` (`backend.security.auth.hash_password`).
- Changing or resetting a password immediately increments `token_version` on the `users` table and revokes records in `refresh_tokens`.
- Passwords should never be checked into version control or logged into persistent files.
