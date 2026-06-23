import json
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

_DATA_FILE = Path(__file__).parent.parent / "pickup_points.json"


def _load() -> list:
    if not _DATA_FILE.exists():
        return []
    return json.loads(_DATA_FILE.read_text(encoding="utf-8"))


def _save(points: list):
    _DATA_FILE.write_text(json.dumps(points, ensure_ascii=False, indent=2), encoding="utf-8")


class PickupPointHours(BaseModel):
    open: str
    close: str


class PickupPointWeekHours(BaseModel):
    monday: Optional[PickupPointHours] = None
    tuesday: Optional[PickupPointHours] = None
    wednesday: Optional[PickupPointHours] = None
    thursday: Optional[PickupPointHours] = None
    friday: Optional[PickupPointHours] = None
    saturday: Optional[PickupPointHours] = None
    sunday: Optional[PickupPointHours] = None


class PickupPointCoords(BaseModel):
    lat: float
    lng: float


class PickupPointBody(BaseModel):
    carrier: str = "mondial-relay"
    name: str
    address: str
    city: str
    postal_code: str
    country: str = "FR"
    coordinates: Optional[PickupPointCoords] = None
    distance_km: Optional[float] = None
    hours: Optional[PickupPointWeekHours] = None


# ── Search (simulated) ────────────────────────────────────────────────────────

@router.get("")
def search_pickup_points(
    postal_code: str = Query(...),
    country: str = Query("FR"),
    max_results: int = Query(10, le=20),
):
    """Return pickup points matching postal_code + country, sorted by distance."""
    points = _load()
    results = [
        p for p in points
        if p.get("postal_code") == postal_code
        and p.get("country", "FR").upper() == country.upper()
    ]
    results.sort(key=lambda p: p.get("distance_km") or 999)
    return results[:max_results]


# ── Admin CRUD ────────────────────────────────────────────────────────────────

@router.get("/all")
def list_all_pickup_points():
    return _load()


@router.post("")
def create_pickup_point(body: PickupPointBody):
    points = _load()
    # Generate a deterministic-looking id
    slug = body.postal_code + "-" + str(len([p for p in points if p.get("postal_code") == body.postal_code]) + 1).zfill(3)
    new_point = {
        "id": f"PP-{slug}",
        **body.model_dump(exclude_none=False),
        "hours": body.hours.model_dump() if body.hours else {},
        "coordinates": body.coordinates.model_dump() if body.coordinates else None,
    }
    points.append(new_point)
    _save(points)
    return new_point


@router.put("/{point_id}")
def update_pickup_point(point_id: str, body: PickupPointBody):
    points = _load()
    idx = next((i for i, p in enumerate(points) if p["id"] == point_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Pickup point not found")
    points[idx] = {
        "id": point_id,
        **body.model_dump(exclude_none=False),
        "hours": body.hours.model_dump() if body.hours else {},
        "coordinates": body.coordinates.model_dump() if body.coordinates else None,
    }
    _save(points)
    return points[idx]


@router.delete("/{point_id}")
def delete_pickup_point(point_id: str):
    points = _load()
    before = len(points)
    points = [p for p in points if p["id"] != point_id]
    if len(points) == before:
        raise HTTPException(status_code=404, detail="Pickup point not found")
    _save(points)
    return {"ok": True}
