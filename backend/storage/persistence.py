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


def _get_analysis_cache_path(repo_path: str, cache_type: str) -> str:
    import hashlib

    settings = get_settings()
    norm_path = repo_path.replace("\\", "/").rstrip("/")
    h = hashlib.sha256(norm_path.encode()).hexdigest()[:16]
    cache_dir = os.path.join(settings.cache_dir, "analysis_cache", h)
    os.makedirs(cache_dir, exist_ok=True)
    return os.path.join(cache_dir, f"{cache_type}.json")


def load_analysis_cache(repo_path: str, cache_type: str) -> dict[str, Any] | None:
    """Load cached analysis report (e.g. 'health_score', 'tech_debt') from disk."""
    path = _get_analysis_cache_path(repo_path, cache_type)
    with _lock:
        if not os.path.exists(path):
            return None
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    return data
        except Exception as exc:
            logger.debug("Could not read analysis cache %s: %s", path, exc)
    return None


def save_analysis_cache(repo_path: str, cache_type: str, data: dict[str, Any]) -> None:
    """Save computed analysis report to disk for compute-once-read-many performance."""
    path = _get_analysis_cache_path(repo_path, cache_type)
    with _lock:
        try:
            tmp_path = f"{path}.tmp"
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, default=str)
            os.replace(tmp_path, path)
        except Exception as exc:
            logger.warning("Failed saving analysis cache %s: %s", path, exc)


def invalidate_analysis_cache(repo_path: str) -> None:
    """Invalidate all analysis caches for a repository."""
    import hashlib
    import shutil

    settings = get_settings()
    norm_path = repo_path.replace("\\", "/").rstrip("/")
    h = hashlib.sha256(norm_path.encode()).hexdigest()[:16]
    cache_dir = os.path.join(settings.cache_dir, "analysis_cache", h)
    with _lock:
        if os.path.exists(cache_dir):
            try:
                shutil.rmtree(cache_dir, ignore_errors=True)
            except Exception as exc:
                logger.debug("Failed deleting analysis cache directory %s: %s", cache_dir, exc)


# ── Scan Jobs Persistence ─────────────────────────────────────────────────────


def _normalize_repo_key(repo_path: str | None) -> str:
    """Canonicalize repository path with forward slashes and resolved path."""
    if not repo_path:
        return ""
    try:
        from pathlib import Path

        return str(Path(repo_path).resolve()).replace("\\", "/").rstrip("/")
    except Exception:
        return str(repo_path).replace("\\", "/").rstrip("/")


def load_scan_jobs(recover_interrupted: bool = True) -> dict[str, dict[str, Any]]:
    """Load scan jobs from persistent file storage, recovering interrupted jobs on restart."""
    path = _get_jobs_path()
    with _lock:
        if not os.path.exists(path):
            return {}
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
                if not isinstance(data, dict):
                    return {}

                changed = False
                for _jid, job in list(data.items()):
                    if not isinstance(job, dict):
                        continue
                    # Recover abandoned or interrupted jobs
                    if recover_interrupted and job.get("status") in ("pending", "running"):
                        job["status"] = "failed"
                        job["error"] = "Scan job interrupted by server restart."
                        job["message"] = "Scan job interrupted."
                        changed = True

                if changed:
                    try:
                        tmp_path = f"{path}.tmp"
                        with open(tmp_path, "w", encoding="utf-8") as f_out:
                            json.dump(data, f_out, indent=2, default=str)
                        os.replace(tmp_path, path)
                    except Exception:
                        pass
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


def load_chat_data(user_id: int | None = None) -> dict[str, Any]:
    """Load persistent chat conversations and history, optionally scoped to a user."""
    path = _get_chat_path()
    with _lock:
        if not os.path.exists(path):
            return {"global": [], "by_repo": {}, "conversations": {}}
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
                if not isinstance(data, dict):
                    return {"global": [], "by_repo": {}, "conversations": {}}

                if user_id is not None:
                    # Filter data strictly for user_id to prevent cross-user leakage
                    user_conversations = {
                        cid: c for cid, c in data.get("conversations", {}).items() if c.get("user_id") == user_id
                    }
                    user_by_repo = {}
                    for rkey, msgs in data.get("by_repo", {}).items():
                        filtered_msgs = [m for m in msgs if m.get("user_id") == user_id]
                        if filtered_msgs:
                            user_by_repo[rkey] = filtered_msgs
                    user_global = [m for m in data.get("global", []) if m.get("user_id") == user_id]
                    return {
                        "global": user_global,
                        "by_repo": user_by_repo,
                        "conversations": user_conversations,
                    }

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
    user_id: int | None = None,
) -> None:
    """Append a chat message entry to persistent storage with canonical path and user isolation."""
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

        if user_id is not None:
            entry["user_id"] = user_id

        global_list: list[Any] = data.setdefault("global", [])
        global_list.append(entry)
        if repo_path:
            norm_repo = _normalize_repo_key(repo_path)
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
                    "repo_path": _normalize_repo_key(repo_path) if repo_path else None,
                    "user_id": user_id,
                    "created_at": time.time(),
                    "updated_at": time.time(),
                    "messages": [],
                },
            )
            conv["updated_at"] = time.time()
            if user_id is not None and "user_id" not in conv:
                conv["user_id"] = user_id
            msg_list: list[Any] = conv.setdefault("messages", [])
            msg_list.append(entry)

        try:
            tmp_path = f"{path}.tmp"
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, default=str)
            os.replace(tmp_path, path)
        except Exception as exc:
            logger.error("Failed to append chat message to %s: %s", path, exc)


def delete_chat_history(
    repo_path: str | None = None,
    conversation_id: str | None = None,
    user_id: int | None = None,
) -> None:
    """Clear chat history globally or for a specific repository/conversation, respecting user ownership."""
    path = _get_chat_path()
    with _lock:
        if not os.path.exists(path):
            return
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)

            if conversation_id and "conversations" in data:
                conv = data["conversations"].get(conversation_id)
                if conv and (user_id is None or conv.get("user_id") == user_id):
                    data["conversations"].pop(conversation_id, None)
            elif repo_path and "by_repo" in data:
                norm_repo = _normalize_repo_key(repo_path)
                if user_id is not None:
                    # Only remove entries for this user
                    if norm_repo in data["by_repo"]:
                        data["by_repo"][norm_repo] = [
                            m for m in data["by_repo"][norm_repo] if m.get("user_id") != user_id
                        ]
                else:
                    data["by_repo"].pop(norm_repo, None)
            else:
                if user_id is not None:
                    data["global"] = [m for m in data.get("global", []) if m.get("user_id") != user_id]
                    for rkey in list(data.get("by_repo", {}).keys()):
                        data["by_repo"][rkey] = [m for m in data["by_repo"][rkey] if m.get("user_id") != user_id]
                    for ckey in list(data.get("conversations", {}).keys()):
                        if data["conversations"][ckey].get("user_id") == user_id:
                            data["conversations"].pop(ckey, None)
                else:
                    data = {"global": [], "by_repo": {}, "conversations": {}}

            tmp_path = f"{path}.tmp"
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, default=str)
            os.replace(tmp_path, path)
        except Exception as exc:
            logger.warning("Failed to delete chat history: %s", exc)
