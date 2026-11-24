"""Minimal outgoing email using the standard library (no paid service needed).

Works with any SMTP server, for example a Gmail account with an app password:
SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_USERNAME=you@gmail.com,
SMTP_PASSWORD=<16-character app password>, SMTP_FROM=you@gmail.com.
"""

from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage

from backend.core.config import get_settings

logger = logging.getLogger(__name__)


def email_enabled() -> bool:
    """True when enough SMTP settings exist to send mail."""
    s = get_settings()
    return bool(s.smtp_host and (s.smtp_from or s.smtp_username))


def send_email(to: str, subject: str, body: str) -> None:
    """Send a plain-text email. Raises on failure so the caller can log it."""
    s = get_settings()
    msg = EmailMessage()
    msg["From"] = s.smtp_from or s.smtp_username
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)

    context = ssl.create_default_context()
    if s.smtp_port == 465:
        with smtplib.SMTP_SSL(s.smtp_host, s.smtp_port, context=context, timeout=15) as server:
            if s.smtp_username:
                server.login(s.smtp_username, s.smtp_password)
            server.send_message(msg)
        return
    with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=15) as server:
        if s.smtp_use_tls:
            server.starttls(context=context)
        if s.smtp_username:
            server.login(s.smtp_username, s.smtp_password)
        server.send_message(msg)


def send_password_reset(to: str, reset_link: str) -> None:
    """Email a password reset link that is valid for 30 minutes."""
    send_email(
        to,
        "Reset your Repository Scanner password",
        "Someone asked to reset the password for this email address.\n\n"
        f"Open this link within 30 minutes to choose a new password:\n{reset_link}\n\n"
        "If you did not ask for this, you can ignore this email. Your password has not changed.\n",
    )
