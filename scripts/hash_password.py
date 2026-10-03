"""Helper script to generate a bcrypt password hash for ADMIN_PASSWORD_HASH."""

from __future__ import annotations

import getpass
import sys


def main() -> None:
    try:
        from backend.security.auth import hash_password
    except ImportError:
        import bcrypt

        def hash_password(p: str) -> str:
            return bcrypt.hashpw(p.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    if len(sys.argv) > 1:
        pwd = sys.argv[1]
    else:
        pwd = getpass.getpass("Enter administrator password to hash: ")

    if not pwd:
        print("Password cannot be empty.", file=sys.stderr)
        sys.exit(1)

    hashed = hash_password(pwd)
    print("\nBcrypt hash generated successfully:")
    print(hashed)
    print("\nSet this in your .env file:")
    print(f"ADMIN_PASSWORD_HASH={hashed}")


if __name__ == "__main__":
    main()
