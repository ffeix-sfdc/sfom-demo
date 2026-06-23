import json
import time
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List

router = APIRouter()

CATALOG_DIR = Path(__file__).parent.parent / "catalogs"
CATALOG_DIR.mkdir(exist_ok=True)


def _catalog_path(catalog_id: int) -> Path:
    return CATALOG_DIR / f"{catalog_id}.json"


_CATALOG_DEFAULTS = {
    "description": "",
    "logo": "",
    "location_group_id": "",
    "location_group_name": "",
    "location_group_ext_ref": "",
    "de_setup_name": "",
    "de_carrier_name": "",
    "de_carrier_methods": [],
    "de_default_country": "",
    "de_default_postal_code": "",
    "webstore_id": "",
    "sales_channel_id": "",
    "payment_gateway_id": "",
    "gift_card_payment_gateway_id": "",
    "pickup_delivery_method_id": "",
    "pickup_shipping_unit_price": 0,
    "pickup_shipping_tax_rate": 5,
    "pickup_point_delivery_method_id": "",
    "pickup_point_shipping_unit_price": 0,
    "pickup_point_shipping_tax_rate": 20,
    "transfer_delivery_method_id": "",
    "transfer_shipping_unit_price": 0,
    "transfer_shipping_tax_rate": 5,
    "standard_delivery_method_id": "",
    "standard_shipping_unit_price": 0,
    "standard_shipping_tax_rate": 5,
    "default_tax_rate": 0,
}

def _load_catalog(catalog_id: int) -> dict:
    path = _catalog_path(catalog_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Catalog not found")
    data = json.loads(path.read_text(encoding="utf-8"))
    return {**_CATALOG_DEFAULTS, **data}


def _save_catalog(catalog: dict):
    path = _catalog_path(catalog["id"])
    path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")


def _list_catalogs() -> list:
    catalogs = []
    for f in sorted(CATALOG_DIR.glob("*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            # Return summary without full product list for listing
            catalogs.append({
                "id": data["id"],
                "name": data["name"],
                "description": data.get("description", ""),
                "logo": data.get("logo", ""),
                "location_group_id": data.get("location_group_id", ""),
                "location_group_name": data.get("location_group_name", ""),
                "location_group_ext_ref": data.get("location_group_ext_ref", ""),
                "de_setup_name": data.get("de_setup_name", ""),
                "de_carrier_name": data.get("de_carrier_name", ""),
                "de_carrier_methods": data.get("de_carrier_methods", []),
                "de_default_country": data.get("de_default_country", ""),
                "de_default_postal_code": data.get("de_default_postal_code", ""),
                "webstore_id": data.get("webstore_id", ""),
                "sales_channel_id": data.get("sales_channel_id", ""),
                "pickup_delivery_method_id": data.get("pickup_delivery_method_id", ""),
                "pickup_shipping_unit_price": data.get("pickup_shipping_unit_price", 0),
                "pickup_shipping_tax_rate": data.get("pickup_shipping_tax_rate", 5),
                "pickup_point_delivery_method_id": data.get("pickup_point_delivery_method_id", ""),
                "pickup_point_shipping_unit_price": data.get("pickup_point_shipping_unit_price", 0),
                "pickup_point_shipping_tax_rate": data.get("pickup_point_shipping_tax_rate", 20),
                "transfer_delivery_method_id": data.get("transfer_delivery_method_id", ""),
                "transfer_shipping_unit_price": data.get("transfer_shipping_unit_price", 0),
                "transfer_shipping_tax_rate": data.get("transfer_shipping_tax_rate", 5),
                "standard_delivery_method_id": data.get("standard_delivery_method_id", ""),
                "standard_shipping_unit_price": data.get("standard_shipping_unit_price", 0),
                "standard_shipping_tax_rate": data.get("standard_shipping_tax_rate", 5),
                "default_tax_rate": data.get("default_tax_rate", 0),
                "payment_gateway_id": data.get("payment_gateway_id", ""),
                "gift_card_payment_gateway_id": data.get("gift_card_payment_gateway_id", ""),
                "product_count": len(data.get("products", [])),
            })
        except Exception:
            pass
    return catalogs


class CatalogIn(BaseModel):
    name: str
    description: Optional[str] = ""
    logo: Optional[str] = None
    location_group_id: Optional[str] = ""
    location_group_name: Optional[str] = ""
    location_group_ext_ref: Optional[str] = ""
    de_setup_name: Optional[str] = ""
    de_carrier_name: Optional[str] = ""
    de_carrier_methods: Optional[List[dict]] = []
    de_default_country: Optional[str] = ""
    de_default_postal_code: Optional[str] = ""
    # checkout defaults
    webstore_id: Optional[str] = ""
    sales_channel_id: Optional[str] = ""
    pickup_delivery_method_id: Optional[str] = ""
    pickup_shipping_unit_price: Optional[float] = 0
    pickup_shipping_tax_rate: Optional[float] = 5
    pickup_point_delivery_method_id: Optional[str] = ""
    pickup_point_shipping_unit_price: Optional[float] = 0
    pickup_point_shipping_tax_rate: Optional[float] = 20
    transfer_delivery_method_id: Optional[str] = ""
    transfer_shipping_unit_price: Optional[float] = 0
    transfer_shipping_tax_rate: Optional[float] = 5
    standard_delivery_method_id: Optional[str] = ""
    standard_shipping_unit_price: Optional[float] = 0
    standard_shipping_tax_rate: Optional[float] = 5
    default_tax_rate: Optional[float] = 0
    payment_gateway_id: Optional[str] = ""
    gift_card_payment_gateway_id: Optional[str] = ""


class AttributeIn(BaseModel):
    name: str
    value: str

class ProductIn(BaseModel):
    name: str
    sku: str
    unit_price: float
    attributes: list[AttributeIn] = []
    category_ids: list[int] = []
    require_tms_booking: bool = False

class CategoryIn(BaseModel):
    name: str


def _find_category(categories: list, cat_id: int):
    """Return (parent_list, index) for a category found by id (recursive)."""
    for i, cat in enumerate(categories):
        if cat["id"] == cat_id:
            return categories, i
        if cat.get("children"):
            result = _find_category(cat["children"], cat_id)
            if result is not None:
                return result
    return None


# ── Catalog CRUD ──────────────────────────────────────────────────────────────

@router.get("")
def list_catalogs():
    return _list_catalogs()


@router.post("")
def create_catalog(body: CatalogIn):
    catalog_id = int(time.time() * 1000)
    catalog = {
        "id": catalog_id,
        "name": body.name,
        "description": body.description or "",
        "logo": body.logo or "",
        "location_group_id": body.location_group_id or "",
        "location_group_name": body.location_group_name or "",
        "location_group_ext_ref": body.location_group_ext_ref or "",
        "de_setup_name": body.de_setup_name or "",
        "de_carrier_name": body.de_carrier_name or "",
        "de_carrier_methods": body.de_carrier_methods or [],
        "de_default_country": body.de_default_country or "",
        "de_default_postal_code": body.de_default_postal_code or "",
        "webstore_id": body.webstore_id or "",
        "sales_channel_id": body.sales_channel_id or "",
        "pickup_delivery_method_id": body.pickup_delivery_method_id or "",
        "pickup_shipping_unit_price": body.pickup_shipping_unit_price or 0,
        "pickup_shipping_tax_rate": body.pickup_shipping_tax_rate or 5,
        "pickup_point_delivery_method_id": body.pickup_point_delivery_method_id or "",
        "pickup_point_shipping_unit_price": body.pickup_point_shipping_unit_price or 0,
        "pickup_point_shipping_tax_rate": body.pickup_point_shipping_tax_rate or 20,
        "transfer_delivery_method_id": body.transfer_delivery_method_id or "",
        "transfer_shipping_unit_price": body.transfer_shipping_unit_price or 0,
        "transfer_shipping_tax_rate": body.transfer_shipping_tax_rate or 5,
        "standard_delivery_method_id": body.standard_delivery_method_id or "",
        "standard_shipping_unit_price": body.standard_shipping_unit_price or 0,
        "standard_shipping_tax_rate": body.standard_shipping_tax_rate or 5,
        "default_tax_rate": body.default_tax_rate or 0,
        "payment_gateway_id": body.payment_gateway_id or "",
        "gift_card_payment_gateway_id": body.gift_card_payment_gateway_id or "",
        "products": [],
    }
    _save_catalog(catalog)
    return {**catalog, "product_count": 0}


@router.get("/{catalog_id}")
def get_catalog(catalog_id: int):
    return _load_catalog(catalog_id)


@router.put("/{catalog_id}")
def update_catalog(catalog_id: int, body: CatalogIn):
    catalog = _load_catalog(catalog_id)
    catalog["name"] = body.name
    catalog["description"] = body.description or ""
    if body.logo is not None:
        catalog["logo"] = body.logo
    catalog["location_group_id"] = body.location_group_id or ""
    catalog["location_group_name"] = body.location_group_name or ""
    catalog["location_group_ext_ref"] = body.location_group_ext_ref or ""
    catalog["de_setup_name"] = body.de_setup_name or ""
    catalog["de_carrier_name"] = body.de_carrier_name or ""
    catalog["de_carrier_methods"] = body.de_carrier_methods or []
    catalog["de_default_country"] = body.de_default_country or ""
    catalog["de_default_postal_code"] = body.de_default_postal_code or ""
    catalog["webstore_id"] = body.webstore_id or ""
    catalog["sales_channel_id"] = body.sales_channel_id or ""
    catalog["pickup_delivery_method_id"] = body.pickup_delivery_method_id or ""
    catalog["pickup_shipping_unit_price"] = body.pickup_shipping_unit_price or 0
    catalog["pickup_shipping_tax_rate"] = body.pickup_shipping_tax_rate or 5
    catalog["pickup_point_delivery_method_id"] = body.pickup_point_delivery_method_id or ""
    catalog["pickup_point_shipping_unit_price"] = body.pickup_point_shipping_unit_price or 0
    catalog["pickup_point_shipping_tax_rate"] = body.pickup_point_shipping_tax_rate or 20
    catalog["transfer_delivery_method_id"] = body.transfer_delivery_method_id or ""
    catalog["transfer_shipping_unit_price"] = body.transfer_shipping_unit_price or 0
    catalog["transfer_shipping_tax_rate"] = body.transfer_shipping_tax_rate or 5
    catalog["standard_delivery_method_id"] = body.standard_delivery_method_id or ""
    catalog["standard_shipping_unit_price"] = body.standard_shipping_unit_price or 0
    catalog["standard_shipping_tax_rate"] = body.standard_shipping_tax_rate or 5
    catalog["default_tax_rate"] = body.default_tax_rate or 0
    catalog["payment_gateway_id"] = body.payment_gateway_id or ""
    catalog["gift_card_payment_gateway_id"] = body.gift_card_payment_gateway_id or ""
    _save_catalog(catalog)
    return catalog


@router.delete("/{catalog_id}")
def delete_catalog(catalog_id: int):
    path = _catalog_path(catalog_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Catalog not found")
    path.unlink()
    return {"ok": True}


# ── Product CRUD ──────────────────────────────────────────────────────────────

@router.get("/{catalog_id}/products")
def list_products(catalog_id: int):
    catalog = _load_catalog(catalog_id)
    return catalog.get("products", [])


@router.post("/{catalog_id}/products")
def add_product(catalog_id: int, body: ProductIn):
    catalog = _load_catalog(catalog_id)
    product = {
        "id": int(time.time() * 1000),
        "name": body.name,
        "sku": body.sku,
        "unit_price": body.unit_price,
        "attributes": [{"name": a.name, "value": a.value} for a in body.attributes],
        "category_ids": body.category_ids,
        "require_tms_booking": body.require_tms_booking,
    }
    catalog.setdefault("products", []).append(product)
    _save_catalog(catalog)
    return product


@router.put("/{catalog_id}/products/{product_id}")
def update_product(catalog_id: int, product_id: int, body: ProductIn):
    catalog = _load_catalog(catalog_id)
    products = catalog.get("products", [])
    idx = next((i for i, p in enumerate(products) if p["id"] == product_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Product not found")
    products[idx] = {
        "id": product_id,
        "name": body.name,
        "sku": body.sku,
        "unit_price": body.unit_price,
        "attributes": [{"name": a.name, "value": a.value} for a in body.attributes],
        "category_ids": body.category_ids,
        "require_tms_booking": body.require_tms_booking,
    }
    catalog["products"] = products
    _save_catalog(catalog)
    return products[idx]


@router.delete("/{catalog_id}/products/{product_id}")
def delete_product(catalog_id: int, product_id: int):
    catalog = _load_catalog(catalog_id)
    products = catalog.get("products", [])
    new_products = [p for p in products if p["id"] != product_id]
    if len(new_products) == len(products):
        raise HTTPException(status_code=404, detail="Product not found")
    catalog["products"] = new_products
    _save_catalog(catalog)
    return {"ok": True}


# ── Category CRUD ─────────────────────────────────────────────────────────────

@router.get("/{catalog_id}/categories")
def list_categories(catalog_id: int):
    catalog = _load_catalog(catalog_id)
    return catalog.get("categories", [])


@router.post("/{catalog_id}/categories")
def add_category(catalog_id: int, body: CategoryIn):
    catalog = _load_catalog(catalog_id)
    categories = catalog.setdefault("categories", [])
    new_cat = {"id": int(time.time() * 1000), "name": body.name.strip(), "children": []}
    categories.append(new_cat)
    _save_catalog(catalog)
    return new_cat


@router.put("/{catalog_id}/categories/{cat_id}")
def rename_category(catalog_id: int, cat_id: int, body: CategoryIn):
    catalog = _load_catalog(catalog_id)
    categories = catalog.setdefault("categories", [])
    result = _find_category(categories, cat_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Category not found")
    parent_list, idx = result
    parent_list[idx]["name"] = body.name.strip()
    _save_catalog(catalog)
    return parent_list[idx]


@router.delete("/{catalog_id}/categories/{cat_id}")
def delete_category(catalog_id: int, cat_id: int):
    catalog = _load_catalog(catalog_id)
    categories = catalog.setdefault("categories", [])
    result = _find_category(categories, cat_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Category not found")
    parent_list, idx = result
    parent_list.pop(idx)
    _save_catalog(catalog)
    return {"ok": True}


@router.post("/{catalog_id}/categories/{cat_id}/subcategories")
def add_subcategory(catalog_id: int, cat_id: int, body: CategoryIn):
    catalog = _load_catalog(catalog_id)
    categories = catalog.setdefault("categories", [])
    result = _find_category(categories, cat_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Category not found")
    parent_list, idx = result
    new_sub = {"id": int(time.time() * 1000), "name": body.name.strip(), "children": []}
    parent_list[idx].setdefault("children", []).append(new_sub)
    _save_catalog(catalog)
    return new_sub
