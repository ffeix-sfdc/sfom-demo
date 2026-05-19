from fastapi import APIRouter, Query
from typing import Optional
from pydantic import BaseModel
from services.salesforce import sf_get, sf_patch

router = APIRouter()
SF_API = "/services/data/v65.0"

PICKUP_RT = "Store_Pickup_RecordType"
SHIP_RT   = "Ship_From_Store"
EXCLUDED_STATUS = ("CLOSED", "CANCELLED", "REJECTED")


@router.get("/locations")
async def list_locations():
    soql = (
        "SELECT Id, Name, ExternalReference, LocationType "
        "FROM Location WHERE IsInventoryLocation = true "
        "ORDER BY Name"
    )
    result = await sf_get(f"{SF_API}/query", params={"q": soql})
    return result.get("records", [])


@router.get("/orders")
async def list_fulfillment_orders(location_id: str = Query(...)):
    excluded = ", ".join(f"'{s}'" for s in EXCLUDED_STATUS)
    soql = (
        "SELECT Id, FulfillmentOrderNumber, Status, StatusCategory, "
        "RecordType.DeveloperName, TotalAmount, "
        "(SELECT Id FROM FulfillmentOrderLineItems WHERE TypeCode = 'Product'), "
        "OrderSummaryId, OrderSummary.OrderNumber, "
        "AccountId, Account.Name, "
        "FulfilledToName, CreatedDate "
        f"FROM FulfillmentOrder "
        f"WHERE FulfilledFromLocationId = '{location_id}' "
        f"AND StatusCategory NOT IN ({excluded}) "
        f"AND RecordType.DeveloperName IN ('{PICKUP_RT}', '{SHIP_RT}') "
        "ORDER BY FulfillmentOrderNumber DESC"
    )
    result = await sf_get(f"{SF_API}/query", params={"q": soql})
    records = result.get("records", [])

    pickup, ship = [], []
    for r in records:
        rt = (r.get("RecordType") or {}).get("DeveloperName", "")
        entry = {
            "id": r["Id"],
            "number": r["FulfillmentOrderNumber"],
            "status": r["Status"],
            "status_category": r["StatusCategory"],
            "record_type": rt,
            "total": r.get("TotalAmount"),
            "product_count": len((r.get("FulfillmentOrderLineItems") or {}).get("records", [])),
            "order_summary_id": r.get("OrderSummaryId"),
            "order_number": (r.get("OrderSummary") or {}).get("OrderNumber"),
            "account_name": (r.get("Account") or {}).get("Name"),
            "fulfilled_to": r.get("FulfilledToName"),
            "created_date": r.get("CreatedDate"),
        }
        if rt == PICKUP_RT:
            pickup.append(entry)
        elif rt == SHIP_RT:
            ship.append(entry)

    return {"pickup": pickup, "ship": ship}


class StatusBody(BaseModel):
    status: str


@router.patch("/orders/{fo_id}/status")
async def update_fo_status(fo_id: str, body: StatusBody):
    await sf_patch(
        f"{SF_API}/sobjects/FulfillmentOrder/{fo_id}",
        {"Status": body.status},
    )
    return {"ok": True}


@router.get("/orders/{fo_id}/lines")
async def get_fo_lines(fo_id: str):
    soql = (
        "SELECT Id, FulfillmentOrderLineItemNumber, Description, "
        "Quantity, UnitPrice, TotalLineAmount, Type, "
        "Product2Id, Product2.Name, Product2.StockKeepingUnit "
        f"FROM FulfillmentOrderLineItem WHERE FulfillmentOrderId = '{fo_id}' "
        "AND TypeCode = 'Product' "
        "ORDER BY FulfillmentOrderLineItemNumber"
    )
    result = await sf_get(f"{SF_API}/query", params={"q": soql})
    lines = []
    for r in result.get("records", []):
        lines.append({
            "id": r["Id"],
            "number": r["FulfillmentOrderLineItemNumber"],
            "description": r.get("Description"),
            "quantity": r.get("Quantity"),
            "unit_price": r.get("UnitPrice"),
            "total": r.get("TotalLineAmount"),
            "product_name": (r.get("Product2") or {}).get("Name"),
            "sku": (r.get("Product2") or {}).get("StockKeepingUnit"),
        })
    return lines
