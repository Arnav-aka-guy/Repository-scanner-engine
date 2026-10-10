"""Dependency vulnerability checker.

Adheres strictly to Rule 18:
- Dependency issues come from OSV.
- If the check didn't run or is offline, mark it "not checked", never "pass".
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def check_dependencies_status(repo_path: str = "") -> dict[str, Any]:
    """Check repository dependencies against OSV vulnerabilities.

    Returns status "not checked" if offline, never "pass" without execution.
    """
    # Unless a valid OSV scan result is executed or present, return 'not checked'
    return {
        "status": "not checked",
        "vulnerabilities_found": 0,
        "details": "OSV vulnerability audit was not executed in this offline scan pass.",
        "packages_scanned": 0,
    }
