"""Administrative CLI for user management in Repository Scanner Engine.

Supports listing users, creating users, resetting individual or all user passwords,
and deleting user accounts. All password updates are hashed with Argon2id.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import secrets
import string
import sys

from sqlalchemy import delete, select

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.db.database import _get_session_factory, close_db
from backend.db.models import RefreshToken, Repository, User
from backend.db.repositories import increment_user_token_version, revoke_user_refresh_tokens
from backend.security.auth import hash_password


def generate_secure_password(length: int = 16) -> str:
    """Generate a high-entropy, alphanumeric secure random password."""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    # Ensure at least one lowercase, one uppercase, one digit, one special
    password = [
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.digits),
        secrets.choice("!@#$%^&*"),
    ]
    password += [secrets.choice(alphabet) for _ in range(length - 4)]
    secrets.SystemRandom().shuffle(password)
    return "".join(password)


async def list_users() -> None:
    """Print all registered users in a tabular format."""
    factory = _get_session_factory()
    async with factory() as session:
        stmt = select(User).order_by(User.id)
        result = await session.execute(stmt)
        users = result.scalars().all()

        if not users:
            print("No users found.")
            return

        print(f"{'ID':<6} {'NAME':<25} {'EMAIL':<35} {'ACTIVE':<8} {'TOKEN_VER':<10}")
        print("-" * 88)
        for u in users:
            print(f"{u.id:<6} {u.name:<25} {u.email:<35} {str(u.is_active):<8} {u.token_version:<10}")
        print(f"\nTotal users: {len(users)}")


async def create_user_cmd(email: str, name: str, password: str | None = None) -> None:
    """Create a new user."""
    factory = _get_session_factory()
    clean_email = email.strip().lower()
    clean_name = name.strip()
    generated = False
    if not password:
        password = generate_secure_password()
        generated = True

    hashed = hash_password(password)

    async with factory() as session:
        # Check duplicate
        stmt = select(User).where(User.email == clean_email)
        existing = (await session.execute(stmt)).scalar_one_or_none()
        if existing:
            print(f"Error: User with email '{clean_email}' already exists (ID: {existing.id}).")
            sys.exit(1)

        user = User(name=clean_name, email=clean_email, password_hash=hashed)
        session.add(user)
        await session.commit()
        await session.refresh(user)

        print(f"Successfully created user '{clean_name}' (ID: {user.id})")
        print(f"Email: {user.email}")
        if generated:
            print(f"Generated Password: {password}")


async def reset_password_cmd(email: str, password: str | None = None) -> None:
    """Reset the password for a specific user."""
    factory = _get_session_factory()
    clean_email = email.strip().lower()
    generated = False
    if not password:
        password = generate_secure_password()
        generated = True

    hashed = hash_password(password)

    async with factory() as session:
        stmt = select(User).where(User.email == clean_email)
        user = (await session.execute(stmt)).scalar_one_or_none()
        if not user:
            print(f"Error: User with email '{clean_email}' not found.")
            sys.exit(1)

        user.password_hash = hashed
        await increment_user_token_version(session, user.id)
        await revoke_user_refresh_tokens(session, user.id)
        await session.commit()

        print(f"Password reset successful for user: {user.email} (ID: {user.id})")
        if generated:
            print(f"New Password: {password}")


async def reset_all_passwords_cmd() -> list[dict[str, str]]:
    """Reset passwords for all existing users to distinct secure random passwords.

    Returns the list of user credentials for presentation.
    """
    factory = _get_session_factory()
    results = []

    async with factory() as session:
        stmt = select(User).order_by(User.id)
        users = (await session.execute(stmt)).scalars().all()

        if not users:
            print("No users to reset.")
            return []

        for user in users:
            new_pw = generate_secure_password()
            user.password_hash = hash_password(new_pw)
            await increment_user_token_version(session, user.id)
            await revoke_user_refresh_tokens(session, user.id)
            results.append(
                {
                    "id": str(user.id),
                    "name": user.name,
                    "email": user.email,
                    "password": new_pw,
                }
            )

        await session.commit()

    return results


async def delete_user_cmd(email: str) -> None:
    """Delete a user and associated refresh tokens / owned repositories."""
    factory = _get_session_factory()
    clean_email = email.strip().lower()

    async with factory() as session:
        stmt = select(User).where(User.email == clean_email)
        user = (await session.execute(stmt)).scalar_one_or_none()
        if not user:
            print(f"Error: User with email '{clean_email}' not found.")
            sys.exit(1)

        user_id = user.id
        await revoke_user_refresh_tokens(session, user_id)
        await session.execute(delete(RefreshToken).where(RefreshToken.user_id == user_id))
        await session.execute(delete(Repository).where(Repository.user_id == user_id))
        await session.delete(user)
        await session.commit()

        print(f"Successfully deleted user: {clean_email} (ID: {user_id})")


def main() -> None:
    parser = argparse.ArgumentParser(description="Antigravity Engine User Management CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # list
    subparsers.add_parser("list", help="List all users")

    # create
    create_p = subparsers.add_parser("create", help="Create a new user")
    create_p.add_argument("--email", required=True, help="User email address")
    create_p.add_argument("--name", required=True, help="Full name")
    create_p.add_argument("--password", required=False, help="Password (optional, generated if omitted)")

    # reset-password
    reset_p = subparsers.add_parser("reset-password", help="Reset password for a single user")
    reset_p.add_argument("--email", required=True, help="User email address")
    reset_p.add_argument("--password", required=False, help="New password (optional, generated if omitted)")

    # reset-all-passwords
    subparsers.add_parser("reset-all-passwords", help="Reset passwords for all existing users")

    # delete
    del_p = subparsers.add_parser("delete", help="Delete a user account")
    del_p.add_argument("--email", required=True, help="User email address")

    args = parser.parse_args()

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    try:
        if args.command == "list":
            loop.run_until_complete(list_users())
        elif args.command == "create":
            loop.run_until_complete(create_user_cmd(args.email, args.name, args.password))
        elif args.command == "reset-password":
            loop.run_until_complete(reset_password_cmd(args.email, args.password))
        elif args.command == "reset-all-passwords":
            res = loop.run_until_complete(reset_all_passwords_cmd())
            print(f"\nSuccessfully reset passwords for {len(res)} users:")
            print(f"{'ID':<6} {'NAME':<20} {'EMAIL':<32} {'NEW_PASSWORD':<20}")
            print("-" * 82)
            for r in res:
                print(f"{r['id']:<6} {r['name']:<20} {r['email']:<32} {r['password']:<20}")
        elif args.command == "delete":
            loop.run_until_complete(delete_user_cmd(args.email))
    finally:
        loop.run_until_complete(close_db())
        loop.close()


if __name__ == "__main__":
    main()
