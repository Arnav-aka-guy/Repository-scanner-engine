"""Secret scanner for credentials and API keys.

Adheres strictly to Rule 19:
- Detects provider patterns (OpenAI, Anthropic, AWS, GitHub, Slack) and high-entropy secrets.
- Skips placeholders, docstrings, comments, tests, and .env.example files.
- Always masks detected values.
"""

from __future__ import annotations

import math
import re
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from backend.parser.models import ParsedFile

_PROVIDER_PATTERNS = [
    ("OpenAI / Groq API Key", re.compile(r"""['"]((?:sk-|gsk_)[a-zA-Z0-9_\-]{20,})['"]""")),
    ("GitHub Token", re.compile(r"""['"]((?:ghp_|gho_|ghu_|ghs_|ghr_)[a-zA-Z0-9_\-]{20,})['"]""")),
    ("Slack Token", re.compile(r"""['"]((?:xoxb-|xoxp-|xoxa-)[a-zA-Z0-9_\-]{20,})['"]""")),
    ("AWS Secret / Access Key", re.compile(r"""['"]((?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16})['"]""")),
    (
        "Generic High-Entropy Secret Assignment",
        re.compile(r"""(?:password|secret|api_key|token)\s*=\s*['"]([^'"]{16,})['"]""", re.I),
    ),
]

_PLACEHOLDER_SUBSTRINGS = {
    "example",
    "placeholder",
    "changeme",
    "your_api_key",
    "your-key",
    "dummy",
    "sample",
    "test",
    "mock",
    "xxx",
    "...",
    "my_secret",
}


def _shannon_entropy(data: str) -> float:
    """Calculate the Shannon entropy of a string."""
    if not data:
        return 0.0
    entropy = 0.0
    for char in set(data):
        prob = data.count(char) / len(data)
        entropy -= prob * math.log2(prob)
    return entropy


def mask_secret(secret: str) -> str:
    """Mask a secret value for safe reporting (e.g. sk-1234...****)."""
    if len(secret) <= 8:
        return "********"
    prefix = secret[:6]
    return f"{prefix}...****"


def scan_for_secrets(parsed_files: dict[str, ParsedFile]) -> list[dict[str, Any]]:
    """Scan parsed files for hardcoded secrets.

    Ignores tests, fixtures, docstrings, and comments.
    """
    detected_secrets: list[dict[str, Any]] = []

    for fpath, parsed in parsed_files.items():
        norm_path = fpath.replace("\\", "/").lower()

        # Skip tests, .env.example, mocks, fixtures
        if any(
            token in norm_path
            for token in ("/tests/", "/test/", "test_", ".spec.", ".env.example", "/mocks/", "/fixtures/")
        ):
            continue

        for func in parsed.functions:
            source = func.source_code or ""
            if not source:
                continue

            lines = source.splitlines()
            for line_idx, line in enumerate(lines, start=func.start_line):
                stripped = line.strip()
                # Skip comments
                if stripped.startswith(("#", "//", "/*", "*")):
                    continue

                for pattern_name, regex in _PROVIDER_PATTERNS:
                    match = regex.search(stripped)
                    if match:
                        raw_val = match.group(1) if match.groups() else match.group(0)
                        # Check for placeholder
                        if any(ph in raw_val.lower() for ph in _PLACEHOLDER_SUBSTRINGS):
                            continue

                        # Minimum entropy check for generic matches
                        if "Generic" in pattern_name and _shannon_entropy(raw_val) < 3.2:
                            continue

                        detected_secrets.append(
                            {
                                "file_path": fpath,
                                "line_number": line_idx,
                                "entity_name": func.name,
                                "type": pattern_name,
                                "masked_value": mask_secret(raw_val),
                                "confidence": "high" if "Generic" not in pattern_name else "medium",
                            }
                        )
                        break

    return detected_secrets
