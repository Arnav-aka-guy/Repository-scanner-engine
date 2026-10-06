"""Persistent storage manager for scan jobs, chat conversations, and analysis state.

Stores state locally in JSON files inside `settings.data_dir` (e.g. data/scan_jobs.json,
data/chat_conversations.json) so background workers, scans, and chat history persist
across backend server restarts without requiring an external database.
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from typing import Any

from backend.core.config import get_settings

logger = logging.getLogger(__name__)

_lock = threading.Lock()


def _get_jobs_path() -> str:
    settings = get_settings()
    os.makedirs(settings.data_dir, exist_ok=True)
    return os.path.join(settings.data_dir, "scan_jobs.json")


def _get_chat_path() -> str:
    settings = get_settings()
    os.makedirs(settings.data_dir, exist_ok=True)
    return os.path.join(settings.data_dir, "chat_conversations.json")


# ── Scan Jobs Persistence ─────────────────────────────────────────────────────


def load_scan_jobs() -> dict[str, dict[str, Any]]:
    """Load scan jobs from persistent file storage."""
    path = _get_jobs_path()
    with _lock:
        if not os.path.exists(path):
            return {}
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    return data
        except Exception as exc:
            logger.warning("Could not read persistent scan jobs from %s: %s", path, exc)
    return {}


def save_scan_job(job_id: str, job_data: dict[str, Any]) -> None:
    """Save or update a single scan job in persistent file storage."""
    path = _get_jobs_path()
    with _lock:
        jobs: dict[str, Any] = {}
        if os.path.exists(path):
            try:
                with open(path, encoding="utf-8") as f:
                    content = json.load(f)
                    if isinstance(content, dict):
                        jobs = content
            except Exception:
                jobs = {}

        # Serialize result if present (RepositoryInfo or dict)
        job_copy = dict(job_data)
        if "result" in job_copy and job_copy["result"] is not None:
            if hasattr(job_copy["result"], "model_dump"):
                job_copy["result"] = job_copy["result"].model_dump()
            elif hasattr(job_copy["result"], "dict"):
                job_copy["result"] = job_copy["result"].dict()

        jobs[job_id] = job_copy
        try:
            tmp_path = f"{path}.tmp"
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(jobs, f, indent=2, default=str)
            os.replace(tmp_path, path)
        except Exception as exc:
            logger.error("Failed to write scan job %s to %s: %s", job_id, path, exc)


def delete_scan_job(job_id: str) -> None:
    """Remove a scan job from storage."""
    path = _get_jobs_path()
    with _lock:
        if not os.path.exists(path):
            return
        try:
            with open(path, encoding="utf-8") as f:
                jobs = json.load(f)
            if job_id in jobs:
                jobs.pop(job_id, None)
                tmp_path = f"{path}.tmp"
                with open(tmp_path, "w", encoding="utf-8") as f:
                    json.dump(jobs, f, indent=2, default=str)
                os.replace(tmp_path, path)
        except Exception as exc:
            logger.warning("Failed to delete scan job %s: %s", job_id, exc)


# ── Chat Conversations Persistence ───────────────────────────────────────────


def load_chat_data() -> dict[str, Any]:
    """Load persistent chat conversations and history."""
    path = _get_chat_path()
    with _lock:
        if not os.path.exists(path):
            return {"global": [], "by_repo": {}, "conversations": {}}
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    return {
                        "global": data.get("global", []),
                        "by_repo": data.get("by_repo", {}),
                        "conversations": data.get("conversations", {}),
                    }
        except Exception as exc:
            logger.warning("Could not read persistent chat history from %s: %s", path, exc)
    return {"global": [], "by_repo": {}, "conversations": {}}


def append_chat_message(
    repo_path: str | None,
    entry: dict[str, Any],
    conversation_id: str | None = None,
) -> None:
    """Append a chat message entry to persistent storage."""
    path = _get_chat_path()
    with _lock:
        data: dict[str, Any] = {"global": [], "by_repo": {}, "conversations": {}}
        if os.path.exists(path):
            try:
                with open(path, encoding="utf-8") as f:
                    loaded = json.load(f)
                    if isinstance(loaded, dict):
                        data = loaded
            except Exception:
                pass

        global_list: list[Any] = data.setdefault("global", [])
        global_list.append(entry)
        if repo_path:
            norm_repo = repo_path.replace("\\", "/")
            by_repo_dict: dict[str, Any] = data.setdefault("by_repo", {})
            repo_list: list[Any] = by_repo_dict.setdefault(norm_repo, [])
            repo_list.append(entry)

        if conversation_id:
            convos: dict[str, Any] = data.setdefault("conversations", {})
            conv: dict[str, Any] = convos.setdefault(
                conversation_id,
                {
                    "id": conversation_id,
                    "title": entry.get("question", "Conversation")[:40],
                    "repo_path": repo_path,
                    "created_at": time.time(),
                    "updated_at": time.time(),
                    "messages": [],
                },
            )
            conv["updated_at"] = time.time()
            msg_list: list[Any] = conv.setdefault("messages", [])
            msg_list.append(entry)

        try:
            tmp_path = f"{path}.tmp"
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, default=str)
            os.replace(tmp_path, path)
        except Exception as exc:
            logger.error("Failed to append chat message to %s: %s", path, exc)


def delete_chat_history(repo_path: str | None = None, conversation_id: str | None = None) -> None:
    """Clear chat history globally or for a specific repository/conversation."""
    path = _get_chat_path()
    with _lock:
        if not os.path.exists(path):
            return
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)

            if conversation_id and "conversations" in data:
                data["conversations"].pop(conversation_id, None)
            elif repo_path and "by_repo" in data:
                norm_repo = repo_path.replace("\\", "/")
                data["by_repo"].pop(norm_repo, None)
            else:
                data = {"global": [], "by_repo": {}, "conversations": {}}

            tmp_path = f"{path}.tmp"
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, default=str)
            os.replace(tmp_path, path)
        except Exception as exc:
            logger.warning("Failed to delete chat history: %s", exc)
