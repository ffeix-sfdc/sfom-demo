import json
from pathlib import Path
from typing import Optional

STATE_FILE = Path(__file__).parent.parent / "app_state.json"


def _load() -> dict:
    if not STATE_FILE.exists():
        return {"active_alias": None}
    return json.loads(STATE_FILE.read_text())


def _save(data: dict):
    STATE_FILE.write_text(json.dumps(data, indent=2))


def get_active_alias() -> Optional[str]:
    return _load().get("active_alias")


def set_active_alias(alias: str):
    data = _load()
    data["active_alias"] = alias
    _save(data)


def peek_order_sequence() -> int:
    """Return the next sequence number without consuming it."""
    return _load().get("order_seq", 0) + 1


def next_order_sequence() -> int:
    """Consume and return the next sequence number (call only on successful order)."""
    data = _load()
    seq = data.get("order_seq", 0) + 1
    data["order_seq"] = seq
    _save(data)
    return seq
