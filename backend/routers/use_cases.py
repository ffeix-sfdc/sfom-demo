import json
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
import time

router = APIRouter()

STORE = Path(__file__).parent.parent / "use_cases.json"


def _load() -> list:
    if not STORE.exists():
        return []
    try:
        return json.loads(STORE.read_text(encoding="utf-8"))
    except Exception:
        return []


def _save(data: list):
    STORE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


class UseCaseIn(BaseModel):
    name: str
    description: Optional[str] = ""
    tab: Optional[str] = "order"
    form: dict
    products: list
    account: Optional[dict] = None


@router.get("")
def list_use_cases():
    return _load()


@router.post("")
def create_use_case(body: UseCaseIn):
    data = _load()
    entry = {
        "id": int(time.time() * 1000),
        "name": body.name,
        "description": body.description or "",
        "tab": body.tab or "order",
        "savedAt": __import__("datetime").datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "form": body.form,
        "products": body.products,
        "account": body.account,
    }
    data.insert(0, entry)
    _save(data)
    return entry


@router.put("/{uc_id}")
def update_use_case(uc_id: int, body: UseCaseIn):
    data = _load()
    idx = next((i for i, uc in enumerate(data) if uc.get("id") == uc_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Not found")
    data[idx] = {
        **data[idx],
        "name": body.name,
        "description": body.description or "",
        "tab": body.tab or data[idx].get("tab", "order"),
        "savedAt": __import__("datetime").datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "form": body.form,
        "products": body.products,
        "account": body.account,
    }
    _save(data)
    return data[idx]


@router.delete("/{uc_id}")
def delete_use_case(uc_id: int):
    data = _load()
    new_data = [uc for uc in data if uc.get("id") != uc_id]
    if len(new_data) == len(data):
        raise HTTPException(status_code=404, detail="Not found")
    _save(new_data)
    return {"ok": True}


@router.get("/export")
def export_use_cases():
    data = _load()
    return JSONResponse(
        content=data,
        headers={"Content-Disposition": "attachment; filename=use_cases.json"},
    )


@router.post("/import")
async def import_use_cases(request: __import__("fastapi").Request):
    try:
        incoming = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(incoming, list):
        raise HTTPException(status_code=400, detail="Expected a JSON array")
    existing = _load()
    existing_ids = {uc.get("id") for uc in existing}
    added = 0
    for uc in incoming:
        if not isinstance(uc, dict) or "name" not in uc:
            continue
        if uc.get("id") not in existing_ids:
            existing.insert(0, uc)
            added += 1
    _save(existing)
    return {"imported": added, "total": len(existing)}
