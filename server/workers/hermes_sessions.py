"""Project Hermes SessionDB rows into the shape Minions consumes.

Owns transcript sanitization for replay-as-conversation, message projection
for the chat UI, and session metadata projection for cost/token displays.
"""

from __future__ import annotations

import json
import sqlite3
import time
from typing import Any

from hermes_worker_utils import (
    TOOL_ARGS_MAX_CHARS,
    TOOL_RESULT_MAX_CHARS,
    WorkerError,
    json_safe,
    string_or_none,
    truncate_tool_field,
)


AGENT_HISTORY_KEYS = {
    "role",
    "content",
    "tool_calls",
    "tool_call_id",
    "tool_name",
    "finish_reason",
    "reasoning",
    "reasoning_content",
    "reasoning_details",
    "codex_reasoning_items",
    "codex_message_items",
}


def _sanitize_agent_history(history: Any) -> list[dict[str, Any]]:
    if not isinstance(history, list):
        return []
    safe: list[dict[str, Any]] = []
    for item in history:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        if role not in {"user", "assistant", "system", "tool"}:
            continue

        safe_item = {
            key: json_safe(value)
            for key, value in item.items()
            if key in AGENT_HISTORY_KEYS and value is not None
        }
        if not safe_item.get("content") and not safe_item.get("tool_calls") and not safe_item.get("tool_call_id"):
            continue
        safe_item["role"] = role
        safe.append(safe_item)
    return safe


COMPACTION_REFERENCE_PREFIX = "[CONTEXT COMPACTION"
COMPACTION_MARKER_TEXT = "Context compacted. Earlier conversation was summarized so the agent could continue."


def open_session(session_id: str, *, resolve_live: bool = True) -> tuple[Any, str]:
    """Return (session_db, resolved_session_id) for the given session.

    Resolves Hermes compression aliases so chat runs continue from the live
    session tip instead of replaying an old root session.
    """
    # Lazy import so this module has no top-level dependency on hermes_worker.
    # `hermes_worker` aliases itself into sys.modules at startup (see top of
    # `hermes_worker.py`), so this returns the same module instance even when
    # the worker is invoked as a script.
    import hermes_worker

    hermes_worker._ensure_imports()
    if hermes_worker._SessionDB is None:
        raise WorkerError(
            "Hermes session database is unavailable.",
            code="session_db_unavailable",
        )
    db = hermes_worker._SessionDB()
    if not resolve_live:
        return db, session_id
    return db, _resolve_live_session_id(db, session_id)


def _resolve_live_session_id(session_db: Any, session_id: str) -> str:
    compression_tip = getattr(session_db, "get_compression_tip", None)
    if callable(compression_tip):
        try:
            return compression_tip(session_id) or session_id
        except Exception:
            pass

    resolve = getattr(session_db, "resolve_resume_session_id", None)
    if callable(resolve):
        try:
            return resolve(session_id) or session_id
        except Exception:
            return session_id
    return session_id


def _session_lineage_ids(session_db: Any, root_session_id: str) -> list[str]:
    """Return root plus compression child sessions in chronological order."""
    session_ids = [root_session_id]
    db_path = getattr(session_db, "db_path", None)
    if db_path:
        try:
            with sqlite3.connect(str(db_path)) as conn:
                rows = conn.execute(
                    """
                    WITH RECURSIVE lineage(id, started_at, depth) AS (
                      SELECT id, started_at, 0
                      FROM sessions
                      WHERE id = ?
                      UNION ALL
                      SELECT child.id, child.started_at, lineage.depth + 1
                      FROM sessions child
                      JOIN lineage ON child.parent_session_id = lineage.id
                      JOIN sessions parent ON parent.id = lineage.id
                      WHERE lineage.depth < 100
                        AND parent.end_reason = 'compression'
                    )
                    SELECT id
                    FROM lineage
                    ORDER BY started_at, id
                    """,
                    (root_session_id,),
                ).fetchall()
            queried_ids = [str(row[0]) for row in rows if row and row[0]]
            if queried_ids:
                session_ids = queried_ids
        except Exception:
            pass

    # Fallback: if CTE failed or db_path unavailable, resolve via Hermes API
    if len(session_ids) == 1:
        live_session_id = _resolve_live_session_id(session_db, root_session_id)
        if live_session_id != root_session_id:
            session_ids.append(live_session_id)
    return session_ids


def load_agent_history(session_db: Any, session_id: str) -> list[dict[str, Any]]:
    if not session_id:
        return []
    try:
        get_session = getattr(session_db, "get_session", None)
        if callable(get_session) and not get_session(session_id):
            return []
        history = session_db.get_messages_as_conversation(session_id)
    except Exception as exc:
        raise WorkerError(f"Could not load Hermes session history: {exc}", code="session_load_error") from exc
    return _sanitize_agent_history(history)


def _content_to_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if content is None:
        return ""
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                if item:
                    parts.append(item)
                continue
            if isinstance(item, dict):
                text = item.get("text") or item.get("content")
                if isinstance(text, str) and text:
                    parts.append(text)
                    continue
                item_type = string_or_none(item.get("type"))
                if item_type:
                    parts.append(f"[{item_type}]")
        return "\n".join(parts) if parts else "[non-text content]"
    if isinstance(content, dict):
        text = content.get("text") or content.get("content")
        if isinstance(text, str):
            return text
        return "[non-text content]"
    return str(content)


def _strip_minions_user_scaffold(content: str) -> str:
    stripped = content.lstrip()
    if stripped.startswith("[TASK AGENT]"):
        marker = "[TASK DESCRIPTION]"
        marker_index = stripped.find(marker)
        if marker_index >= 0:
            return stripped[marker_index + len(marker):].lstrip("\r\n ")

    if stripped.startswith("<task_agent>"):
        marker = "</task_agent>"
        marker_index = stripped.find(marker)
        if marker_index >= 0:
            remainder = stripped[marker_index + len(marker):].lstrip()
            if remainder.startswith("<task_description>"):
                end_marker = "</task_description>"
                end_index = remainder.find(end_marker)
                if end_index >= 0:
                    return remainder[len("<task_description>"):end_index].strip()
            return remainder

    return content


def _is_compaction_reference(content: str) -> bool:
    stripped = content.lstrip()
    return (
        stripped.startswith(COMPACTION_REFERENCE_PREFIX)
        and "REFERENCE ONLY" in stripped[:200]
    )


def _timestamp_to_ms(timestamp: Any) -> int:
    try:
        value = float(timestamp)
    except (TypeError, ValueError):
        return int(time.time() * 1000)
    if value < 10_000_000_000:
        value *= 1000
    return int(value)


def _thinking_to_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value or None
    try:
        return json.dumps(value, ensure_ascii=False)
    except Exception:
        return str(value)


_TOOL_LABEL_ARG_KEYS = ("command", "path", "pattern", "query", "url")


def _tool_call_name(tool_call: dict[str, Any]) -> str:
    function = tool_call.get("function")
    if isinstance(function, dict):
        name = string_or_none(function.get("name"))
        if name:
            return name
    return string_or_none(tool_call.get("name")) or string_or_none(tool_call.get("function_name")) or "tool"


def _tool_call_argument_string(tool_call: dict[str, Any]) -> str | None:
    function = tool_call.get("function")
    raw = function.get("arguments") if isinstance(function, dict) else None
    if raw is None:
        raw = tool_call.get("arguments")
    if raw is None:
        return None
    if isinstance(raw, str):
        text = raw
    else:
        try:
            text = json.dumps(json_safe(raw), ensure_ascii=False)
        except Exception:
            text = str(raw)
    return text or None


def _tool_call_label(args_text: str | None) -> str | None:
    if not args_text:
        return None
    try:
        parsed = json.loads(args_text)
    except Exception:
        return None
    if not isinstance(parsed, dict):
        return None
    for key in _TOOL_LABEL_ARG_KEYS:
        value = parsed.get(key)
        if isinstance(value, str) and value.strip():
            return truncate_tool_field(value.strip(), 200)
    return None


def _project_tool_result(content: Any) -> tuple[bool, str | None]:
    text = _content_to_text(content)
    if not text.strip():
        return False, None
    is_error = False
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict) and "error" in parsed:
            is_error = True
    except Exception:
        pass
    return is_error, truncate_tool_field(text, TOOL_RESULT_MAX_CHARS)


def _project_row_tool_calls(tool_calls: Any, tool_results: dict[str, Any]) -> list[dict[str, Any]]:
    if not isinstance(tool_calls, list) or not tool_calls:
        return []

    tools: list[dict[str, Any]] = []
    for tool_call in tool_calls:
        if not isinstance(tool_call, dict):
            continue

        args_text = _tool_call_argument_string(tool_call)
        entry: dict[str, Any] = {"tool": _tool_call_name(tool_call), "status": "completed"}

        label = _tool_call_label(args_text)
        if label:
            entry["label"] = label
        if args_text:
            entry["args"] = truncate_tool_field(args_text, TOOL_ARGS_MAX_CHARS)

        call_id = string_or_none(tool_call.get("id"))
        result_content = tool_results.get(call_id) if call_id else None
        if result_content is not None:
            is_error, result_text = _project_tool_result(result_content)
            if result_text is not None:
                entry["result"] = result_text
            if is_error:
                entry["status"] = "error"

        tools.append(entry)
    return tools


def project_session_messages(session_id: Any, task_id: Any = None) -> dict[str, Any]:
    session_id = string_or_none(session_id)
    if not session_id:
        raise WorkerError("Session ID is required.", code="bad_request")

    session_db, root_session_id = open_session(session_id, resolve_live=False)
    projected: list[dict[str, Any]] = []
    projected_task_id = string_or_none(task_id) or session_id

    for lineage_index, lineage_session_id in enumerate(_session_lineage_ids(session_db, root_session_id)):
        try:
            rows = session_db.get_messages(lineage_session_id)
        except Exception as exc:
            raise WorkerError(f"Could not load Hermes session messages: {exc}", code="session_load_error") from exc

        is_root_session = lineage_index == 0
        compaction_seen = is_root_session
        child_user_seen = is_root_session

        # Tool-role rows carry the result content for a tool call, keyed by the
        # tool_call_id it answers. Assistant rows that only carry tool_calls
        # (no visible text) never get their own projected message, so their
        # tool calls are accumulated here and attached to the next assistant
        # row in the turn that does have content — mirroring how live-chat.ts
        # accumulates every tool_progress event onto a single assistant message.
        tool_results: dict[str, Any] = {}
        for row in rows:
            if isinstance(row, dict) and row.get("role") == "tool":
                call_id = string_or_none(row.get("tool_call_id"))
                if call_id:
                    tool_results[call_id] = row.get("content")

        pending_tools: list[dict[str, Any]] = []

        for row in rows:
            if not isinstance(row, dict):
                row = dict(row)
            role = row.get("role")
            if role not in {"user", "assistant"}:
                continue

            content = _content_to_text(row.get("content"))
            if role == "user":
                content = _strip_minions_user_scaffold(content)
                if _is_compaction_reference(content):
                    projected.append({
                        "id": f"hermes:{lineage_session_id}:compaction:{row.get('id')}",
                        "task_id": projected_task_id,
                        "role": "system",
                        "content": COMPACTION_MARKER_TEXT,
                        "created_at": _timestamp_to_ms(row.get("timestamp")),
                    })
                    compaction_seen = True
                    child_user_seen = False
                    pending_tools = []
                    continue
                if not compaction_seen:
                    continue
                child_user_seen = True
                pending_tools = []
            elif not compaction_seen or not child_user_seen:
                continue

            if role == "assistant":
                pending_tools.extend(_project_row_tool_calls(row.get("tool_calls"), tool_results))

            if role == "assistant" and not content.strip() and row.get("tool_calls"):
                continue
            if not content.strip():
                continue

            message = {
                "id": f"hermes:{lineage_session_id}:{row.get('id')}",
                "task_id": projected_task_id,
                "role": role,
                "content": content,
                "created_at": _timestamp_to_ms(row.get("timestamp")),
            }
            if role == "assistant":
                thinking = (
                    _thinking_to_text(row.get("reasoning_content"))
                    or _thinking_to_text(row.get("reasoning"))
                    or _thinking_to_text(row.get("reasoning_details"))
                    or _thinking_to_text(row.get("codex_reasoning_items"))
                )
                if thinking:
                    message["thinking"] = thinking
                if pending_tools:
                    message["tools"] = pending_tools
                    pending_tools = []
            projected.append(message)

    return {"messages": projected}


def _int_field(row: dict[str, Any], key: str) -> int:
    try:
        return int(row.get(key) or 0)
    except Exception:
        return 0


def _float_or_none(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except Exception:
        return None


def search_sessions(query: Any, limit: Any) -> dict[str, Any]:
    query = string_or_none(query)
    if not query:
        return {"matches": []}

    try:
        limit_int = int(limit) if limit is not None else 20
    except (TypeError, ValueError):
        limit_int = 20
    limit_int = max(1, min(limit_int, 100))

    import hermes_worker

    hermes_worker._ensure_imports()
    if hermes_worker._SessionDB is None:
        return {"matches": []}

    try:
        session_db = hermes_worker._SessionDB()
    except Exception:
        return {"matches": []}

    # Wrap as a quoted phrase so FTS5 treats the query as a literal substring
    # instead of parsing AND/OR/NOT or other query syntax out of user input.
    fts_query = '"' + query.replace('"', '""') + '"'
    try:
        rows = session_db.search_messages(fts_query, limit=limit_int, sort="newest")
    except Exception:
        return {"matches": []}

    matches = [
        {
            "session_id": string_or_none(row.get("session_id")) or "",
            "snippet": string_or_none(row.get("snippet")) or "",
            "role": string_or_none(row.get("role")) or "",
            "created_at": _timestamp_to_ms(row.get("timestamp")),
        }
        for row in rows
    ]
    return {"matches": matches}


CHILD_SESSION_MAX_RESULTS = 50
CHILD_SESSION_MAX_DEPTH = 3


def _optional_timestamp_to_ms(value: Any) -> int | None:
    if value is None:
        return None
    return _timestamp_to_ms(value)


def list_child_sessions(session_id: Any) -> dict[str, Any]:
    session_id = string_or_none(session_id)
    if not session_id:
        raise WorkerError("Session ID is required.", code="bad_request")

    session_db, _ = open_session(session_id, resolve_live=False)
    db_path = getattr(session_db, "db_path", None)
    if not db_path:
        return {"children": []}

    try:
        with sqlite3.connect(str(db_path)) as conn:
            conn.row_factory = sqlite3.Row
            rows = [
                dict(row)
                for row in conn.execute(
                    """
                    WITH RECURSIVE descendants(id, depth) AS (
                      SELECT id, 0
                      FROM sessions
                      WHERE id = ?
                      UNION ALL
                      SELECT child.id, descendants.depth + 1
                      FROM sessions child
                      JOIN descendants ON child.parent_session_id = descendants.id
                      WHERE descendants.depth < ?
                    )
                    SELECT s.id, s.parent_session_id, d.depth, s.title, s.model, s.started_at,
                           s.ended_at, s.end_reason, s.message_count, s.tool_call_count,
                           s.input_tokens, s.output_tokens, s.estimated_cost_usd
                    FROM descendants d
                    JOIN sessions s ON s.id = d.id
                    WHERE d.depth > 0
                    ORDER BY d.depth ASC, s.started_at ASC
                    """,
                    (session_id, CHILD_SESSION_MAX_DEPTH),
                ).fetchall()
            ]
    except Exception as exc:
        raise WorkerError(f"Could not load child sessions: {exc}", code="session_load_error") from exc

    capped = rows[:CHILD_SESSION_MAX_RESULTS]
    capped.sort(key=lambda row: row.get("started_at") or 0)

    children = [
        {
            "id": str(row.get("id")),
            "parent_id": string_or_none(row.get("parent_session_id")),
            "depth": int(row.get("depth") or 0),
            "title": string_or_none(row.get("title")),
            "model": string_or_none(row.get("model")),
            "started_at": _timestamp_to_ms(row.get("started_at")),
            "ended_at": _optional_timestamp_to_ms(row.get("ended_at")),
            "end_reason": string_or_none(row.get("end_reason")),
            "message_count": _int_field(row, "message_count"),
            "tool_call_count": _int_field(row, "tool_call_count"),
            "total_tokens": _int_field(row, "input_tokens") + _int_field(row, "output_tokens"),
            "estimated_cost_usd": _float_or_none(row.get("estimated_cost_usd")),
        }
        for row in capped
    ]
    return {"children": children}


def project_session_metadata(session_id: Any) -> dict[str, Any]:
    session_id = string_or_none(session_id)
    if not session_id:
        raise WorkerError("Session ID is required.", code="bad_request")

    session_db, live_session_id = open_session(session_id)
    try:
        row = session_db.get_session(live_session_id)
    except Exception as exc:
        raise WorkerError(f"Could not load Hermes session metadata: {exc}", code="session_load_error") from exc

    if not row:
        return {"session": None}

    return {
        "session": {
            "id": str(row.get("id") or live_session_id),
            "input_tokens": _int_field(row, "input_tokens"),
            "output_tokens": _int_field(row, "output_tokens"),
            "cache_read_tokens": _int_field(row, "cache_read_tokens"),
            "cache_write_tokens": _int_field(row, "cache_write_tokens"),
            "reasoning_tokens": _int_field(row, "reasoning_tokens"),
            "estimated_cost_usd": _float_or_none(row.get("estimated_cost_usd")),
            "cost_status": string_or_none(row.get("cost_status")) or "unknown",
            "model": string_or_none(row.get("model")),
        }
    }


INSIGHTS_MAX_DAYS = 365
_INSIGHTS_WANTED_COLS = (
    "source", "model", "started_at", "message_count", "tool_call_count",
    "input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens",
    "estimated_cost_usd",
)
_DOW_NAMES = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


def insights_report(days: Any) -> dict[str, Any]:
    """Aggregate token, cost, model, and activity analytics over the session store."""
    import hermes_worker
    from datetime import datetime, timedelta

    try:
        days_int = int(days)
    except (TypeError, ValueError):
        days_int = 30
    days_int = max(1, min(days_int, INSIGHTS_MAX_DAYS))

    hermes_worker._ensure_imports()
    if hermes_worker._SessionDB is None:
        raise WorkerError("Hermes session database is unavailable.", code="session_db_unavailable")
    try:
        session_db = hermes_worker._SessionDB()
    except Exception as exc:
        raise WorkerError(f"Could not open Hermes session store: {exc}", code="session_load_error") from exc

    db_path = getattr(session_db, "db_path", None)
    if not db_path:
        raise WorkerError("Hermes session store path is unavailable.", code="session_load_error")

    cutoff = time.time() - days_int * 86400
    try:
        with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as conn:
            conn.row_factory = sqlite3.Row
            available = {row["name"] for row in conn.execute("PRAGMA table_info(sessions)")}
            cols = [c for c in _INSIGHTS_WANTED_COLS if c in available]
            if "started_at" not in cols:
                raise WorkerError("Session store is missing expected columns.", code="session_load_error")
            rows = [
                dict(row)
                for row in conn.execute(
                    f"SELECT {', '.join(cols)} FROM sessions WHERE started_at >= ? ORDER BY started_at ASC",
                    (cutoff,),
                )
            ]
    except WorkerError:
        raise
    except Exception as exc:
        raise WorkerError(f"Could not read session analytics: {exc}", code="session_load_error") from exc

    totals = {
        "sessions": 0, "messages": 0, "toolCalls": 0,
        "inputTokens": 0, "outputTokens": 0, "cacheReadTokens": 0,
        "cacheWriteTokens": 0, "totalTokens": 0, "estimatedCostUsd": 0.0,
    }
    by_model: dict[str, dict[str, Any]] = {}
    daily: dict[str, dict[str, Any]] = {}
    hour_counts = [0] * 24
    dow_counts = [0] * 7

    for row in rows:
        inp = _int_field(row, "input_tokens")
        out = _int_field(row, "output_tokens")
        cache_read = _int_field(row, "cache_read_tokens")
        cache_write = _int_field(row, "cache_write_tokens")
        tokens = inp + out + cache_read + cache_write
        cost = _float_or_none(row.get("estimated_cost_usd")) or 0.0
        tool_calls = _int_field(row, "tool_call_count")
        messages = _int_field(row, "message_count")

        totals["sessions"] += 1
        totals["messages"] += messages
        totals["toolCalls"] += tool_calls
        totals["inputTokens"] += inp
        totals["outputTokens"] += out
        totals["cacheReadTokens"] += cache_read
        totals["cacheWriteTokens"] += cache_write
        totals["totalTokens"] += tokens
        totals["estimatedCostUsd"] += cost

        model = string_or_none(row.get("model")) or "unknown"
        display = model.split("/")[-1] if "/" in model else model
        entry = by_model.setdefault(display, {
            "model": display, "sessions": 0, "totalTokens": 0,
            "inputTokens": 0, "outputTokens": 0, "toolCalls": 0, "estimatedCostUsd": 0.0,
        })
        entry["sessions"] += 1
        entry["totalTokens"] += tokens
        entry["inputTokens"] += inp
        entry["outputTokens"] += out
        entry["toolCalls"] += tool_calls
        entry["estimatedCostUsd"] += cost

        started_at = row.get("started_at")
        if started_at is None:
            continue
        try:
            dt = datetime.fromtimestamp(float(started_at))
        except (TypeError, ValueError, OverflowError, OSError):
            continue
        key = dt.strftime("%Y-%m-%d")
        bucket = daily.setdefault(key, {
            "date": key, "sessions": 0, "totalTokens": 0,
            "inputTokens": 0, "outputTokens": 0, "estimatedCostUsd": 0.0,
        })
        bucket["sessions"] += 1
        bucket["totalTokens"] += tokens
        bucket["inputTokens"] += inp
        bucket["outputTokens"] += out
        bucket["estimatedCostUsd"] += cost
        hour_counts[dt.hour] += 1
        dow_counts[dt.weekday()] += 1

    today = datetime.now().date()
    start_date = today - timedelta(days=days_int - 1)
    if daily:
        earliest = min(datetime.strptime(k, "%Y-%m-%d").date() for k in daily)
        if earliest < start_date:
            start_date = earliest
    series: list[dict[str, Any]] = []
    day = start_date
    while day <= today:
        key = day.isoformat()
        series.append(daily.get(key) or {
            "date": key, "sessions": 0, "totalTokens": 0,
            "inputTokens": 0, "outputTokens": 0, "estimatedCostUsd": 0.0,
        })
        day += timedelta(days=1)

    model_list = sorted(by_model.values(), key=lambda m: (m["totalTokens"], m["sessions"]), reverse=True)

    return {
        "days": days_int,
        "generatedAt": _timestamp_to_ms(time.time()),
        "totals": totals,
        "daily": series,
        "byModel": model_list,
        "byHour": [{"hour": h, "count": hour_counts[h]} for h in range(24)],
        "byDayOfWeek": [{"day": _DOW_NAMES[i], "count": dow_counts[i]} for i in range(7)],
    }
