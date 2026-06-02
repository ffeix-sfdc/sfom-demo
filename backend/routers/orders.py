import uuid
import json
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator
from typing import Optional
from services.salesforce import sf_post, sf_get
from services.org_store import next_order_sequence, peek_order_sequence, get_active_alias
from services.sf_cache import cached_sf_get

router = APIRouter()

SF_API = "/services/data/v65.0"
CONNECT_API = "/services/data/v65.0/connect"


# ── Sequence ─────────────────────────────────────────────────────────────────

@router.get("/next-reference")
def get_next_reference():
    seq = peek_order_sequence()
    return {"reference": f"OMD-{seq:08d}", "seq": seq}


# ── Lookup endpoints ──────────────────────────────────────────────────────────

@router.get("/accounts/search")
async def search_accounts(q: str):
    safe_q = q.replace("'", "\\'")
    soql = (
        f"SELECT Id, Name, IsPersonAccount, RecordTypeId, FirstName, LastName, PersonEmail, "
        f"BillingStreet, BillingCity, BillingState, BillingPostalCode, BillingCountry, "
        f"BillingCountryCode, BillingStateCode, Phone "
        f"FROM Account WHERE Name LIKE '%{safe_q}%' LIMIT 10"
    )
    result = await sf_get(f"{SF_API}/query", params={"q": soql})
    return result.get("records", [])


@router.get("/webstores")
async def get_webstores():
    alias = get_active_alias()
    soql = (
        "SELECT Id, Name, Type, ExternalReference, DefaultTaxLocaleType, CurrencyIsoCode "
        "FROM WebStore WHERE IsDeleted = false ORDER BY Name LIMIT 50"
    )
    result = await cached_sf_get(alias, "webstores", sf_get, f"{SF_API}/query", params={"q": soql})
    return result.get("records", [])


@router.get("/saleschannels")
async def get_saleschannels():
    alias = get_active_alias()
    soql = "SELECT Id, SalesChannelName, Description FROM SalesChannel ORDER BY SalesChannelName LIMIT 50"
    result = await cached_sf_get(alias, "saleschannels", sf_get, f"{SF_API}/query", params={"q": soql})
    return result.get("records", [])


@router.get("/currencies")
async def get_currencies():
    alias = get_active_alias()
    soql = "SELECT IsoCode, ConversionRate, IsCorporate FROM CurrencyType WHERE IsActive = true ORDER BY IsoCode"
    result = await cached_sf_get(alias, "currencies", sf_get, f"{SF_API}/query", params={"q": soql})
    return result.get("records", [])


@router.get("/pricebooks")
async def get_pricebooks():
    alias = get_active_alias()
    soql = "SELECT Id, Name, IsStandard FROM Pricebook2 WHERE IsActive = true LIMIT 20"
    result = await cached_sf_get(alias, "pricebooks", sf_get, f"{SF_API}/query", params={"q": soql})
    return result.get("records", [])


@router.get("/pricebooks/{pricebook_id}/entries")
async def get_pricebook_entries(pricebook_id: str):
    alias = get_active_alias()
    soql = (
        f"SELECT Id, Product2Id, Product2.Name, Product2.ProductCode, "
        f"Product2.StockKeepingUnit, Product2.Description, UnitPrice "
        f"FROM PricebookEntry WHERE Pricebook2Id = '{pricebook_id}' AND IsActive = true LIMIT 200"
    )
    result = await cached_sf_get(alias, f"pricebook-entries:{pricebook_id}", sf_get, f"{SF_API}/query", params={"q": soql})
    return result.get("records", [])


@router.get("/delivery-methods")
async def get_delivery_methods():
    alias = get_active_alias()
    soql = "SELECT Id, Name, Carrier, ClassOfService FROM OrderDeliveryMethod WHERE IsActive = true LIMIT 50"
    result = await cached_sf_get(alias, "delivery-methods", sf_get, f"{SF_API}/query", params={"q": soql})
    return result.get("records", [])


@router.get("/payment-gateways")
async def get_payment_gateways():
    alias = get_active_alias()
    soql = "SELECT Id, PaymentGatewayName, ExternalReference FROM PaymentGateway WHERE IsDeleted = false LIMIT 20"
    result = await cached_sf_get(alias, "payment-gateways", sf_get, f"{SF_API}/query", params={"q": soql})
    return result.get("records", [])


@router.get("/locations")
async def get_locations():
    alias = get_active_alias()
    soql = (
        "SELECT Id, Name, ExternalReference, LocationType, "
        "VisitorAddressId, VisitorAddress.Street, VisitorAddress.City, "
        "VisitorAddress.StateCode, VisitorAddress.PostalCode, VisitorAddress.CountryCode "
        "FROM Location WHERE IsInventoryLocation = true AND ShouldSyncWithOci = true AND IsDeleted = false ORDER BY Name"
    )
    result = await cached_sf_get(alias, "locations", sf_get, f"{SF_API}/query", params={"q": soql})
    return result.get("records", [])


@router.get("/location-groups")
async def get_location_groups():
    alias = get_active_alias()
    soql = (
        "SELECT Id, LocationGroupName, ExternalReference "
        "FROM LocationGroup WHERE ShouldSyncWithOci = true AND IsDeleted = false ORDER BY LocationGroupName LIMIT 50"
    )
    result = await cached_sf_get(alias, "location-groups", sf_get, f"{SF_API}/query", params={"q": soql})
    return result.get("records", [])


@router.get("/shipping-products")
async def get_shipping_products():
    alias = get_active_alias()
    soql = "SELECT Id, Name, ProductCode FROM Product2 WHERE Type = 'Service' AND IsActive = true LIMIT 50"
    result = await cached_sf_get(alias, "shipping-products", sf_get, f"{SF_API}/query", params={"q": soql})
    return result.get("records", [])


@router.get("/promotions")
async def get_promotions():
    alias = get_active_alias()
    soql = (
        "SELECT Id, Name, DisplayName, Description, IsCommercePromotion, IsActive "
        "FROM Promotion WHERE IsActive = true ORDER BY Name LIMIT 50"
    )
    result = await cached_sf_get(alias, "promotions", sf_get, f"{SF_API}/query", params={"q": soql})
    return result.get("records", [])


@router.get("/countries")
async def get_countries():
    alias = get_active_alias()
    result = await cached_sf_get(
        alias, "countries", sf_get,
        "/services/data/v65.0/ui-api/object-info/Account/picklist-values/012000000000000AAA/BillingCountryCode",
    )
    values = result.get("values", [])
    return [{"code": v["value"], "label": v["label"]} for v in values if v.get("value")]


@router.get("/states")
async def get_states(country: str = ""):
    alias = get_active_alias()
    result = await cached_sf_get(
        alias, "states", sf_get,
        "/services/data/v65.0/ui-api/object-info/Account/picklist-values/012000000000000AAA/BillingStateCode",
    )
    controller_values = result.get("controllerValues", {})
    values = result.get("values", [])
    if not country or country not in controller_values:
        return [{"code": v["value"], "label": v["label"]} for v in values if v.get("value")]
    idx = controller_values[country]
    filtered = [v for v in values if idx in (v.get("validFor") or [])]
    return [{"code": v["value"], "label": v["label"]} for v in filtered if v.get("value")]


# ── Request models ─────────────────────────────────────────────────────────────

class ProductLine(BaseModel):
    product2_id: str
    product_code: str = ""
    product_name: str = ""

    @field_validator("product2_id", "product_code", "product_name", mode="before")
    @classmethod
    def coerce_to_str(cls, v):
        return str(v) if v is not None else ""
    description: str = ""
    sku: str
    quantity: float
    unit_price: float
    gross_unit_price: float
    list_price: float
    tax_amount: float = 0.0
    tax_rate: float = 5.0
    discount_amount: float = 0.0
    discount_tax_amount: float = 0.0
    reserved_at_location_id: str = ""
    # OCI fields — use location_group_ext_ref by default; if reserved_at_location_id
    # is set, use location_ext_ref instead (locationIdentifier)
    location_group_ext_ref: str = ""   # ExternalReference of LocationGroup
    location_ext_ref: str = ""         # ExternalReference of Location (when reserved_at_location_id set)
    delivery_group_index: int = 0   # index into delivery_groups list
    l1_category: str = ""
    l2_category: str = ""
    variation_color: str = ""
    variation_size: str = ""


class DeliveryGroup(BaseModel):
    order_delivery_method_id: str
    # OCI location for this group
    location_group_id: str = ""
    location_group_ext_ref: str = ""
    reserved_at_location_id: str = ""   # specific location (overrides group)
    location_ext_ref: str = ""           # ExternalReference of specific location
    # Shipping address
    shipping_name: str = ""
    shipping_email: str = ""
    shipping_phone: str = ""
    shipping_street: str = ""
    shipping_city: str = ""
    shipping_state: str = ""
    shipping_state_code: str = ""
    shipping_postal_code: str = ""
    shipping_country: str = ""
    shipping_country_code: str = ""
    # Shipping charge (always present, even if 0)
    shipping_unit_price: float = 0
    shipping_gross_unit_price: float = 0
    shipping_tax_amount: float = 0
    shipping_tax_rate: float = 0
    # Pickup slot ISO timestamp (BOPIS only)
    pickup_time: Optional[str] = None
    # TMS booking for home delivery (shipping_method_ref + window ISO)
    tms_booking_date: Optional[str] = None   # YYYY-MM-DD
    tms_booking_window_start: Optional[str] = None  # HH:MM
    tms_booking_window_end: Optional[str] = None    # HH:MM
    tms_shipping_method_ref: Optional[str] = None
    tms_shipping_method_name: Optional[str] = None


class CardPayment(BaseModel):
    payment_gateway_id: str
    gateway_token: str = "undefined"
    card_type: str = "Visa"
    card_holder_name: str = ""
    masked_card_number: str = "************1111"
    expiry_year: str = "2030"
    expiry_month: str = "7"
    card_category: str = "CreditCard"
    processing_mode: str = "External"
    amount: float


class GiftCardPayment(BaseModel):
    gift_card_number: str
    gift_card_pin: str = ""
    amount: float


class PromotionInput(BaseModel):
    name: str
    display_name: str
    description: str = ""
    start_date: str           # YYYY-MM-DD
    end_date: str             # YYYY-MM-DD
    is_active: bool = True


class CreateOrderRequest(BaseModel):
    # order identity
    order_reference: str
    oci_action_request_id: str = ""
    currency_iso_code: str = "USD"
    tax_locale_type: str = "Net"
    ordered_date: str          # YYYY-MM-DD

    # account (full record for upsert; optional for preview)
    account_id: str = ""

    # webstore (full record for upsert)
    webstore_id: str
    webstore_name: str
    webstore_external_reference: str
    webstore_type: str = "B2CE"
    webstore_default_tax_locale_type: str = "Net"
    webstore_currency_iso_code: str = ""

    # sales channel
    sales_channel_name: str
    sales_channel_description: str = ""

    # delivery groups (at least one required)
    delivery_groups: list[DeliveryGroup]

    # customer identity
    first_name: str = ""
    last_name: str = ""

    # billing address
    billing_street: str = ""
    billing_street2: str = ""
    billing_city: str = ""
    billing_state: str = ""
    billing_state_code: str = ""
    billing_postal_code: str = ""
    billing_country: str = ""
    billing_country_code: str = ""
    billing_email: str = ""
    billing_phone: str = ""

    # totals
    grand_total: float

    # payment
    payment: CardPayment
    gift_card_payment: Optional[GiftCardPayment] = None

    # promotion (optional)
    promotion: Optional[PromotionInput] = None

    # products (each references a delivery_group_index)
    products: list[ProductLine]


# ── Payload builder (shared by create and preview) ────────────────────────────

def _build_order_payload(body: CreateOrderRequest, acc_result: dict, now_utc: str, oci_id: str = "") -> dict:
    date_only = body.ordered_date

    dg0 = body.delivery_groups[0]
    bill_street = body.billing_street or dg0.shipping_street
    bill_city = body.billing_city or dg0.shipping_city
    bill_state = body.billing_state or dg0.shipping_state
    bill_state_code = body.billing_state_code or dg0.shipping_state_code
    bill_postal = body.billing_postal_code or dg0.shipping_postal_code
    bill_country = body.billing_country or dg0.shipping_country
    bill_country_code = body.billing_country_code or dg0.shipping_country_code
    bill_email = body.billing_email or dg0.shipping_email
    bill_phone = body.billing_phone or dg0.shipping_phone

    purchase_support: list[dict] = []

    # Account — fields sent are the matching fields for PersonAccount deduplication rules.
    # RecordTypeId ensures a new record is created as PersonAccount (not Business Account).
    # Values come from the form (billing fields) so the payload reflects the current order's data.
    first_name = body.first_name or acc_result.get("FirstName", "")
    last_name  = body.last_name  or acc_result.get("LastName", "") or acc_result.get("Name", "")
    full_street = "\n".join(filter(None, [bill_street, body.billing_street2]))

    acc_node: dict = {
        "attributes": {"type": "Account"},
        "IsPersonAccount": True,
        **({"Id": body.account_id} if body.account_id else {}),
        "FirstName": first_name,
        "LastName": last_name,
        "PersonEmail": bill_email or acc_result.get("PersonEmail", ""),
        "Phone": bill_phone or acc_result.get("Phone", ""),
        "BillingStreet": full_street or acc_result.get("BillingStreet", ""),
        "BillingCity": bill_city or acc_result.get("BillingCity", ""),
        "BillingPostalCode": bill_postal or acc_result.get("BillingPostalCode", ""),
        "BillingCountryCode": bill_country_code or acc_result.get("BillingCountryCode") or None,
        "BillingStateCode": bill_state_code or acc_result.get("BillingStateCode") or None,
        "Name": f"{first_name} {last_name}".strip() or acc_result.get("Name", ""),
    }
    # Remove None values to avoid overwriting existing data with nulls
    acc_node = {k: v for k, v in acc_node.items() if v is not None}
    purchase_support.append({
        "referenceId": "Account",
        "attributes": acc_node,
    })

    # WebStore
    purchase_support.append({
        "referenceId": "WebStore",
        "attributes": {
            "attributes": {"type": "WebStore"},
            "Name": body.webstore_name,
            "Type": body.webstore_type,
            "ExternalReference": body.webstore_external_reference,
            "DefaultTaxLocaleType": body.webstore_default_tax_locale_type,
            "CurrencyIsoCode": body.webstore_currency_iso_code or body.currency_iso_code,
        },
    })

    # SalesChannel
    purchase_support.append({
        "referenceId": "SalesChannel",
        "attributes": {
            "attributes": {"type": "SalesChannel"},
            "Description": body.sales_channel_description or body.sales_channel_name,
            "SalesChannelName": body.sales_channel_name,
        },
    })

    # Promotion (optional)
    has_promotion = body.promotion is not None
    if has_promotion:
        promo = body.promotion
        purchase_support.append({
            "referenceId": "Promotion_0",
            "attributes": {
                "attributes": {"type": "Promotion"},
                "Name": promo.name,
                "DisplayName": promo.display_name,
                "Description": promo.description,
                "StartDate": promo.start_date,
                "IsCommercePromotion": True,
                "IsActive": promo.is_active,
                "StartDateTime": promo.start_date,
                "EndDateTime": promo.end_date,
            },
        })

    # Products
    for i, p in enumerate(body.products):
        purchase_support.append({
            "referenceId": f"Product2_{i}",
            "attributes": {
                "attributes": {"type": "Product2"},
                "Description": p.description or p.product_name,
                "ProductCode": p.product_code,
                "IsActive": True,
                "StockKeepingUnit": p.sku,
                "Name": p.product_name,
            },
        })

    # ── purchase_details ──────────────────────────────────────────────────────

    purchase_details: list[dict] = []

    # Build OrderMetadata__c from pickup delivery groups that have a slot time
    pickup_slots = []
    tms_bookings = []
    for gi, dg in enumerate(body.delivery_groups):
        if dg.pickup_time and dg.location_ext_ref:
            pickup_slots.append({
                "deliveryGroupIndex": gi,
                "locationExtRef": dg.location_ext_ref,
                "pickupTime": dg.pickup_time,
                **({"locationName": dg.shipping_name} if dg.shipping_name else {}),
            })
        if dg.tms_booking_date and dg.tms_booking_window_start:
            tms_bookings.append({
                "deliveryGroupIndex": gi,
                "deliveryDate": dg.tms_booking_date,
                "windowStart": dg.tms_booking_window_start,
                **({"windowEnd": dg.tms_booking_window_end} if dg.tms_booking_window_end else {}),
                **({"shippingMethodRef": dg.tms_shipping_method_ref} if dg.tms_shipping_method_ref else {}),
                **({"shippingMethodName": dg.tms_shipping_method_name} if dg.tms_shipping_method_name else {}),
            })
    meta_obj: dict = {}
    if pickup_slots:
        meta_obj["pickupSlots"] = pickup_slots
    if tms_bookings:
        meta_obj["tmsBookings"] = tms_bookings
    order_metadata = json.dumps(meta_obj, ensure_ascii=False) if meta_obj else None

    os_attrs: dict = {
        "attributes": {"type": "OrderSummary"},
        "OrderNumber": body.order_reference,
        "OrderLifeCycleType": "Managed",
        "BillingEmailAddress": bill_email,
        "BillingPhoneNumber": bill_phone,
        "BillingStreet": full_street,
        "BillingCity": bill_city,
        "BillingPostalCode": bill_postal,
        "OrderedDate": now_utc,
        "GrandTotalAmount": body.grand_total,
        "Description": f"{first_name} {last_name}".strip() or acc_result.get("Name", ""),
        "ExternalReferenceIdentifier": f"{body.webstore_external_reference}@{body.order_reference}",
        "TaxLocaleType": body.tax_locale_type,
        "AccountId": "@{Account.id}",
        "SalesChannelId": "@{SalesChannel.id}",
        "SalesStoreId": "@{WebStore.id}",
        "CurrencyIsoCode": body.currency_iso_code,
        "EffectiveDate": date_only,
        "OriginalOrderName": f"{first_name} {last_name}".strip() or acc_result.get("Name", ""),
        "BillingCountryCode": bill_country_code or None,
        "BillingStateCode": bill_state_code or None,
    }
    if order_metadata:
        os_attrs["OrderMetadata__c"] = order_metadata

    # OrderSummary
    purchase_details.append({
        "referenceId": "OrderSummary",
        "attributes": os_attrs,
    })

    # OrderSummaryAdditionalInfo
    if not oci_id:
        oci_id = body.oci_action_request_id or str(uuid.uuid4())
    purchase_details.append({
        "referenceId": "OrderSummaryAdditionalInfo",
        "attributes": {
            "attributes": {"type": "OrderSummaryAdditionalInfo"},
            "Name": body.order_reference,
            "InventoryReservationIdentifier": oci_id,
            "InventoryReservationExtRef": oci_id,
            "CurrencyIsoCode": body.currency_iso_code,
            "OrderSummaryId": "@{OrderSummary.id}",
        },
    })

    # OrderPaymentSummary
    purchase_details.append({
        "referenceId": "OrderPaymentSummary_0",
        "attributes": {
            "attributes": {"type": "OrderPaymentSummary"},
            "OrderSummaryId": "@{OrderSummary.id}",
            "CurrencyIsoCode": body.currency_iso_code,
        },
    })

    # CardPaymentMethod
    pmt = body.payment
    purchase_details.append({
        "referenceId": "CardPaymentMethod_0",
        "attributes": {
            "attributes": {"type": "CardPaymentMethod"},
            "GatewayToken": pmt.gateway_token,
            "PaymentGatewayId": pmt.payment_gateway_id,
            "Status": "Active",
            "PaymentMethodStreet": bill_street,
            "PaymentMethodCity": bill_city,
            "PaymentMethodPostalCode": bill_postal,
            "CardType": pmt.card_type,
            "InputCardNumber": pmt.masked_card_number,
            "CardHolderName": pmt.card_holder_name or f"{first_name} {last_name}".strip() or acc_result.get("Name", ""),
            "ExpiryYear": pmt.expiry_year,
            "ExpiryMonth": pmt.expiry_month,
            "CardCategory": pmt.card_category,
            "ProcessingMode": pmt.processing_mode,
            "AccountId": "@{Account.id}",
            "PaymentMethodCountryCode": bill_country_code or None,
            "PaymentMethodStateCode": bill_state_code or None,
        },
    })

    # PaymentAuthorization
    purchase_details.append({
        "referenceId": "PaymentAuthorization_0",
        "attributes": {
            "attributes": {"type": "PaymentAuthorization"},
            "PaymentGatewayId": pmt.payment_gateway_id,
            "Amount": pmt.amount,
            "ProcessingMode": pmt.processing_mode,
            "Status": "Processed",
            "GatewayRefNumber": body.order_reference,
            "CurrencyIsoCode": body.currency_iso_code,
            "OrderPaymentSummaryId": "@{OrderPaymentSummary_0.id}",
            "AccountId": "@{Account.id}",
            "PaymentMethodId": "@{CardPaymentMethod_0.id}",
        },
    })

    # PaymentGatewayLog
    purchase_details.append({
        "referenceId": "PaymentGatewayLog_0",
        "attributes": {
            "attributes": {"type": "PaymentGatewayLog"},
            "PaymentGatewayId": pmt.payment_gateway_id,
            "InteractionStatus": "Success",
            "InteractionType": "Authorization",
            "ReferencedEntityId": "@{PaymentAuthorization_0.id}",
        },
    })

    # Gift card payment (optional, partial)
    # GiftCardPaymentMethod is not supported in Order Summary Graph API —
    # AlternativePaymentMethod with Type=GiftCard is the correct sObject.
    if body.gift_card_payment:
        gc = body.gift_card_payment
        purchase_details.append({
            "referenceId": "OrderPaymentSummary_GC",
            "attributes": {
                "attributes": {"type": "OrderPaymentSummary"},
                "OrderSummaryId": "@{OrderSummary.id}",
                "CurrencyIsoCode": body.currency_iso_code,
                "Type": "GiftCard",
            },
        })
        gc_method_attrs: dict = {
            "attributes": {"type": "AlternativePaymentMethod"},
            "Type": "GiftCard",
            "NickName": gc.gift_card_number,
            "Status": "Active",
            "ProcessingMode": "External",
            "AccountId": "@{Account.id}",
        }
        purchase_details.append({
            "referenceId": "GiftCardPaymentMethod_0",
            "attributes": gc_method_attrs,
        })
        purchase_details.append({
            "referenceId": "PaymentAuthorization_GC",
            "attributes": {
                "attributes": {"type": "PaymentAuthorization"},
                "Amount": gc.amount,
                "ProcessingMode": "External",
                "Status": "Processed",
                "GatewayRefNumber": body.order_reference,
                "CurrencyIsoCode": body.currency_iso_code,
                "OrderPaymentSummaryId": "@{OrderPaymentSummary_GC.id}",
                "AccountId": "@{Account.id}",
                "PaymentMethodId": "@{GiftCardPaymentMethod_0.id}",
            },
        })

    # Generic Delivery Charge product (shared across all groups)
    purchase_support.append({
        "referenceId": "Product2_GDC",
        "attributes": {
            "attributes": {"type": "Product2"},
            "Description": "Generic Delivery Charge",
            "ProductCode": "GDC",
            "IsActive": True,
            "StockKeepingUnit": "GDC",
            "Name": "Delivery Charge",
        },
    })

    # OrderDeliveryGroupSummary — one per delivery group
    for gi, dg in enumerate(body.delivery_groups):
        odgs_ref = f"OrderDeliveryGroupSummary_{gi}"
        purchase_details.append({
            "referenceId": odgs_ref,
            "attributes": {
                "attributes": {"type": "OrderDeliveryGroupSummary"},
                "EmailAddress": dg.shipping_email,
                "DeliverToCity": dg.shipping_city,
                "DeliverToName": dg.shipping_name or f"{first_name} {last_name}".strip() or acc_result.get("Name", ""),
                "DeliverToPostalCode": dg.shipping_postal_code,
                "DeliverToStreet": dg.shipping_street,
                "PhoneNumber": dg.shipping_phone,
                "OrderDeliveryMethodId": dg.order_delivery_method_id,
                "GrandTotalAmount": round(dg.shipping_gross_unit_price, 2),
                "OrderSummaryId": "@{OrderSummary.id}",
                "DeliverToCountryCode": dg.shipping_country_code or None,
                "DeliverToStateCode": dg.shipping_state_code or None,
            },
        })

    # OrderAdjustmentGroupSummary (only if promotion)
    if has_promotion:
        purchase_details.append({
            "referenceId": "OrderAdjustmentGroupSummary_0",
            "attributes": {
                "attributes": {"type": "OrderAdjustmentGroupSummary"},
                "Name": body.promotion.name,
                "Description": body.promotion.name,
                "Type": "Header",
                "OrderSummaryId": "@{OrderSummary.id}",
                "AdjustmentCauseId": "@{Promotion_0.id}",
            },
        })

    # OrderItemSummary for each product
    for i, p in enumerate(body.products):
        gi = min(p.delivery_group_index, len(body.delivery_groups) - 1)
        dg = body.delivery_groups[gi]
        odgs_ref = f"OrderDeliveryGroupSummary_{gi}"
        ois_ref = f"OrderItemSummary_{i}"
        item_attrs: dict = {
            "attributes": {"type": "OrderItemSummary"},
            "Description": p.description or p.product_name,
            "Type": "Order Product",
            "Quantity": p.quantity,
            "TotalLineAmount": round(p.quantity * p.unit_price, 2),
            "LineNumber": i + 1,
            "UnitPrice": p.unit_price,
            "GrossUnitPrice": p.gross_unit_price,
            "ListPrice": p.list_price,
            "OrderSummaryId": "@{OrderSummary.id}",
            "OrderDeliveryGroupSummaryId": f"@{{{odgs_ref}.id}}",
            "Product2Id": f"@{{Product2_{i}.id}}",
        }
        reserved_location_id = p.reserved_at_location_id or dg.reserved_at_location_id or dg.location_group_id
        if reserved_location_id:
            item_attrs["ReservedAtLocationId"] = reserved_location_id
        if p.l1_category:
            item_attrs["somL1Category__c"] = p.l1_category
        if p.l2_category:
            item_attrs["somL2Category__c"] = p.l2_category
        if p.variation_color:
            item_attrs["somVariationColor__c"] = p.variation_color
        if p.variation_size:
            item_attrs["somVariationSize__c"] = p.variation_size
        purchase_details.append({"referenceId": ois_ref, "attributes": item_attrs})

    # Delivery Charge OIS — one per delivery group (always present, even if 0)
    for gi, dg in enumerate(body.delivery_groups):
        odgs_ref = f"OrderDeliveryGroupSummary_{gi}"
        dc_ref = f"OrderItemSummary_DC_{gi}"
        purchase_details.append({
            "referenceId": dc_ref,
            "attributes": {
                "attributes": {"type": "OrderItemSummary"},
                "Description": "Delivery Charge",
                "Product2Id": "@{Product2_GDC.id}",
                "Type": "Delivery Charge",
                "Quantity": 1,
                "TotalLineAmount": round(dg.shipping_unit_price, 2),
                "LineNumber": 1000 + gi,
                "UnitPrice": round(dg.shipping_unit_price, 2),
                "GrossUnitPrice": round(dg.shipping_gross_unit_price, 2),
                "ListPrice": round(dg.shipping_unit_price, 2),
                "OrderSummaryId": "@{OrderSummary.id}",
                "OrderDeliveryGroupSummaryId": f"@{{{odgs_ref}.id}}",
            },
        })

    # Product taxes
    for i, p in enumerate(body.products):
        if p.tax_amount:
            purchase_details.append({
                "referenceId": f"OrderItemTaxLineItemSummary_{i}",
                "attributes": {
                    "attributes": {"type": "OrderItemTaxLineItemSummary"},
                    "Name": f"{p.product_code} - Tax",
                    "Type": "Estimated",
                    "Amount": p.tax_amount,
                    "Rate": p.tax_rate,
                    "TaxEffectiveDate": now_utc,
                    "OrderSummaryId": "@{OrderSummary.id}",
                    "OrderItemSummaryId": f"@{{OrderItemSummary_{i}.id}}",
                },
            })

    # Delivery charge taxes
    for gi, dg in enumerate(body.delivery_groups):
        if dg.shipping_tax_amount:
            dc_ref = f"OrderItemSummary_DC_{gi}"
            purchase_details.append({
                "referenceId": f"OrderItemTaxLineItemSummary_DC_{gi}",
                "attributes": {
                    "attributes": {"type": "OrderItemTaxLineItemSummary"},
                    "Name": f"DeliveryCharge_{gi} - Tax",
                    "Type": "Estimated",
                    "Amount": dg.shipping_tax_amount,
                    "Rate": dg.shipping_tax_rate,
                    "TaxEffectiveDate": now_utc,
                    "OrderSummaryId": "@{OrderSummary.id}",
                    "OrderItemSummaryId": f"@{{{dc_ref}.id}}",
                },
            })

    # Discounts + discount taxes (only if promotion)
    if has_promotion:
        for i, p in enumerate(body.products):
            if p.discount_amount:
                adj_ref = f"OrderItemAdjustmentLineSummary_{i + 1}"
                purchase_details.append({
                    "referenceId": adj_ref,
                    "attributes": {
                        "attributes": {"type": "OrderItemAdjustmentLineSummary"},
                        "Amount": -abs(p.discount_amount),
                        "Name": f"{p.product_code} - {body.promotion.display_name}",
                        "AdjustmentCauseId": "@{Promotion_0.id}",
                        "OrderSummaryId": "@{OrderSummary.id}",
                        "OrderItemSummaryId": f"@{{OrderItemSummary_{i}.id}}",
                        "OrderAdjustmentGroupSummaryId": "@{OrderAdjustmentGroupSummary_0.id}",
                    },
                })
                if p.discount_tax_amount:
                    purchase_details.append({
                        "referenceId": f"OrderItemAdjustmentLineSummaryTax_{i + 1}",
                        "attributes": {
                            "attributes": {"type": "OrderItemTaxLineItemSummary"},
                            "Name": f"{p.product_code} - Adjustment Tax",
                            "Type": "Estimated",
                            "Amount": -abs(p.discount_tax_amount),
                            "Rate": p.tax_rate,
                            "TaxEffectiveDate": now_utc,
                            "OrderSummaryId": "@{OrderSummary.id}",
                            "OrderItemSummaryId": f"@{{OrderItemSummary_{i}.id}}",
                            "OrderItemAdjustmentLineSummaryId": f"@{{{adj_ref}.id}}",
                        },
                    })

    return {
        "orderSummaryGraphs": [
            {
                "orderSummaryGraphId": f"nto@{body.order_reference}",
                "purchaseSupportDetails": purchase_support,
                "purchaseDetails": purchase_details,
            }
        ]
    }


# ── Order creation ─────────────────────────────────────────────────────────────

@router.post("/preview")
async def preview_order(body: CreateOrderRequest):
    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    acc_result = {}
    if body.account_id:
        acc_result = await sf_get(f"{SF_API}/sobjects/Account/{body.account_id}")
    payload = _build_order_payload(body, acc_result, now_utc)
    return {"oms_payload": payload}


@router.post("")
async def create_order(body: CreateOrderRequest):
    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    oci_id = body.oci_action_request_id or str(uuid.uuid4())

    acc_result = await sf_get(f"{SF_API}/sobjects/Account/{body.account_id}") if body.account_id else {}
    payload = _build_order_payload(body, acc_result, now_utc, oci_id)

    print(">>> OMS payload:", json.dumps(payload, indent=2))
    try:
        result = await sf_post(f"{SF_API}/commerce/order-summaries", payload)
    except ValueError as e:
        err = e.args[0]
        print(">>> OMS error:", json.dumps(err, indent=2) if isinstance(err, (dict, list)) else err)
        raise HTTPException(status_code=400, detail=err)
    except Exception as e:
        print(">>> OMS exception:", str(e))
        raise HTTPException(status_code=400, detail=str(e))

    print(">>> OMS result:", json.dumps(result, indent=2))
    next_order_sequence()

    ref_results = {}
    for graph in result.get("orderSummaryGraphsResults", []):
        for ref in graph.get("referenceIdResults", []):
            ref_results[ref.get("referenceId")] = ref.get("id")

    # ── OCI reservation ───────────────────────────────────────────────────────
    oci_reservations = []
    for p in body.products:
        gi = min(p.delivery_group_index, len(body.delivery_groups) - 1)
        dg = body.delivery_groups[gi]
        loc_ext = p.location_ext_ref or dg.location_ext_ref
        loc_id = p.reserved_at_location_id or dg.reserved_at_location_id
        if loc_id and loc_ext:
            oci_reservations.append({
                "locationIdentifier": loc_ext,
                "quantity": p.quantity,
                "stockKeepingUnit": p.sku,
            })
        else:
            lg = p.location_group_ext_ref or dg.location_group_ext_ref
            if lg:
                oci_reservations.append({
                    "locationGroupIdentifier": lg,
                    "quantity": p.quantity,
                    "stockKeepingUnit": p.sku,
                })

    oci_result = None
    oci_payload = None
    if oci_reservations:
        oci_payload = {
            "actionRequestId": oci_id,
            "createRecords": oci_reservations,
        }
        print(">>> OCI payload:", json.dumps(oci_payload, indent=2))
        try:
            oci_result = await sf_post(
                f"{SF_API}/commerce/oci/reservation/actions/reservations",
                oci_payload,
            )
            print(">>> OCI result:", json.dumps(oci_result, indent=2))
        except ValueError as e:
            err = e.args[0]
            print(">>> OCI error (non-blocking):", json.dumps(err, indent=2) if isinstance(err, (dict, list)) else err)
            oci_result = {"error": err}
        except Exception as e:
            print(">>> OCI exception (non-blocking):", str(e))
            oci_result = {"error": str(e)}

    return {
        "order_summary_id": ref_results.get("OrderSummary"),
        "order_id": ref_results.get("Order"),
        "oci_action_request_id": oci_id,
        "oci_result": oci_result,
        "oms_payload": payload,
        "oci_payload": oci_payload if oci_reservations else None,
        "raw": result,
    }


@router.get("/search")
async def search_order_summaries(q: str):
    safe_q = q.replace("'", "\\'")
    soql = (
        f"SELECT Id, OrderNumber, BillingName, BillingEmailAddress, Status, TotalAmount "
        f"FROM OrderSummary "
        f"WHERE OrderNumber LIKE '%{safe_q}%' "
        f"ORDER BY CreatedDate DESC LIMIT 20"
    )
    result = await sf_get(f"{SF_API}/query", params={"q": soql})
    return result.get("records", [])


@router.get("/{order_summary_id}")
async def get_order_summary(order_summary_id: str):
    return await sf_get(f"{SF_API}/sobjects/OrderSummary/{order_summary_id}")
