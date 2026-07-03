"""Manage Hermes MCP servers (the `mcp_servers` section of config.yaml).

Thin projections over Hermes' own importable MCP config helpers so Minions can
list, add, edit, remove, enable/disable, and test-connect MCP servers without a
running gateway.
"""

from __future__ import annotations

from typing import Any

from hermes_worker_utils import WorkerError, string_or_none


def _ensure() -> None:
    import hermes_worker
    hermes_worker._ensure_imports()


def _invalidate_config_cache() -> None:
    import hermes_worker
    hermes_worker._CONFIG_CACHE = None


def _str_dict(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}
    out: dict[str, str] = {}
    for key, val in value.items():
        key_str = str(key).strip()
        if key_str:
            out[key_str] = str(val)
    return out


def _str_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value]


def _project_server(name: str, cfg: Any) -> dict[str, Any]:
    cfg = cfg if isinstance(cfg, dict) else {}
    is_remote = bool(string_or_none(cfg.get("url")))
    tools = cfg.get("tools") if isinstance(cfg.get("tools"), dict) else {}
    include = tools.get("include") if isinstance(tools, dict) else None
    exclude = tools.get("exclude") if isinstance(tools, dict) else None
    return {
        "name": name,
        "transport": "remote" if is_remote else "stdio",
        "enabled": bool(cfg.get("enabled", True)),
        "command": string_or_none(cfg.get("command")),
        "args": _str_list(cfg.get("args")),
        "env": _str_dict(cfg.get("env")),
        "url": string_or_none(cfg.get("url")),
        "headers": _str_dict(cfg.get("headers")),
        "toolInclude": _str_list(include) if isinstance(include, list) else None,
        "toolExclude": _str_list(exclude) if isinstance(exclude, list) else None,
    }


def list_mcp_servers() -> dict[str, Any]:
    _ensure()
    from hermes_cli.mcp_config import _get_mcp_servers

    servers = _get_mcp_servers() or {}
    projected = [_project_server(name, cfg) for name, cfg in sorted(servers.items())]
    return {"servers": projected}


def _build_entry(request: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    name = string_or_none(request.get("name"))
    if not name:
        raise WorkerError("A server name is required.", code="bad_request")

    transport = string_or_none(request.get("transport")) or "stdio"
    enabled = request.get("enabled")
    entry: dict[str, Any] = {"enabled": True if enabled is None else bool(enabled)}

    if transport == "remote":
        url = string_or_none(request.get("url"))
        if not url:
            raise WorkerError("A URL is required for a remote server.", code="bad_request")
        entry["url"] = url
        headers = _str_dict(request.get("headers"))
        if headers:
            entry["headers"] = headers
    else:
        command = string_or_none(request.get("command"))
        if not command:
            raise WorkerError("A command is required for a stdio server.", code="bad_request")
        entry["command"] = command
        args = _str_list(request.get("args"))
        if args:
            entry["args"] = args
        env = _str_dict(request.get("env"))
        if env:
            entry["env"] = env

    return name, entry


def save_mcp_server(request: dict[str, Any]) -> dict[str, Any]:
    _ensure()
    from hermes_cli.mcp_config import _get_mcp_servers, _save_mcp_server
    from hermes_cli.mcp_security import validate_mcp_server_entry

    name, entry = _build_entry(request)

    # Preserve any existing tool allow/deny filter across an edit.
    existing = _get_mcp_servers().get(name)
    if isinstance(existing, dict) and isinstance(existing.get("tools"), dict):
        entry["tools"] = existing["tools"]

    warnings = validate_mcp_server_entry(name, entry) or []
    if warnings:
        return {"ok": False, "warnings": [str(w) for w in warnings], **list_mcp_servers()}

    saved = bool(_save_mcp_server(name, entry))
    _invalidate_config_cache()
    if not saved:
        return {"ok": False, "warnings": ["The server could not be saved."], **list_mcp_servers()}
    return {"ok": True, "warnings": [], **list_mcp_servers()}


def remove_mcp_server(request: dict[str, Any]) -> dict[str, Any]:
    _ensure()
    from hermes_cli.mcp_config import _remove_mcp_server

    name = string_or_none(request.get("name"))
    if not name:
        raise WorkerError("A server name is required.", code="bad_request")
    _remove_mcp_server(name)
    _invalidate_config_cache()
    return list_mcp_servers()


def set_mcp_server_enabled(request: dict[str, Any]) -> dict[str, Any]:
    _ensure()
    from hermes_cli.config import load_config, save_config

    name = string_or_none(request.get("name"))
    if not name:
        raise WorkerError("A server name is required.", code="bad_request")
    enabled = bool(request.get("enabled"))

    cfg = load_config()
    servers = cfg.get("mcp_servers")
    if not isinstance(servers, dict) or name not in servers:
        raise WorkerError("Unknown MCP server.", code="not_found")
    entry = servers[name]
    if not isinstance(entry, dict):
        entry = {}
        servers[name] = entry
    entry["enabled"] = enabled
    save_config(cfg)
    _invalidate_config_cache()
    return list_mcp_servers()


def probe_mcp_server(request: dict[str, Any]) -> dict[str, Any]:
    _ensure()
    from hermes_cli.mcp_config import _get_mcp_servers, _probe_single_server

    name = string_or_none(request.get("name"))
    if not name:
        raise WorkerError("A server name is required.", code="bad_request")
    cfg = (_get_mcp_servers() or {}).get(name)
    if not isinstance(cfg, dict):
        raise WorkerError("Unknown MCP server.", code="not_found")

    try:
        pairs = _probe_single_server(name, cfg, connect_timeout=20)
    except Exception as exc:
        raise WorkerError(f"Could not connect to {name}: {exc}", code="mcp_probe_failed") from exc

    tools: list[dict[str, str]] = []
    for item in pairs or []:
        try:
            tool_name, description = item
        except (TypeError, ValueError):
            tool_name, description = item, ""
        tools.append({"name": str(tool_name), "description": str(description or "")})
    return {"tools": tools}
