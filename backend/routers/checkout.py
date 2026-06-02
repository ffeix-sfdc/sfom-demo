from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from services.salesforce import sf_post, sf_get

router = APIRouter()

SF_API = "/services/data/v65.0"
CONNECT_API = "/services/data/v65.0/connect"


class CheckoutAddress(BaseModel):
    name: str = ""
    street: str = ""
    city: str = ""
    state: str = ""
    state_code: str = ""
    postal_code: str = ""
    country: str = ""
    country_code: str = ""
    phone: str = ""
    email: str = ""


class CheckoutItem(BaseModel):
    product2_id: str
    sku: str
    quantity: float
    unit_price: float


class CheckoutPayment(BaseModel):
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


class CheckoutGiftCardPayment(BaseModel):
    gift_card_number: str
    gift_card_pin: str = ""
    amount: float


class CheckoutRequest(BaseModel):
    webstore_id: str
    account_id: str
    currency_iso_code: str = "USD"
    ship_to_address: CheckoutAddress
    bill_to_address: Optional[CheckoutAddress] = None
    delivery_method_id: str = ""
    items: list[CheckoutItem]
    payment: Optional[CheckoutPayment] = None
    gift_card_payment: Optional[CheckoutGiftCardPayment] = None
    order_reference: str = ""


def _build_payments(body: "CheckoutRequest") -> list:
    payments = []
    if body.payment:
        p = body.payment
        payments.append({
            "paymentGatewayId": p.payment_gateway_id,
            "gatewayToken": p.gateway_token,
            "cardPaymentMethod": {
                "cardType": p.card_type,
                "cardHolderName": p.card_holder_name,
                "cardNumber": p.masked_card_number,
                "expiryYear": p.expiry_year,
                "expiryMonth": p.expiry_month,
                "cardCategory": p.card_category,
            },
            "amount": p.amount,
        })
    if body.gift_card_payment:
        gc = body.gift_card_payment
        entry = {
            "giftCardPaymentMethod": {
                "giftCardNumber": gc.gift_card_number,
            },
            "amount": gc.amount,
        }
        if gc.gift_card_pin:
            entry["giftCardPaymentMethod"]["giftCardPin"] = gc.gift_card_pin
        payments.append(entry)
    return payments


@router.post("")
async def create_checkout(body: CheckoutRequest):
    bill = body.bill_to_address or body.ship_to_address

    payload = {
        "webstoreId": body.webstore_id,
        "effectiveAccountId": body.account_id,
        "currencyIsoCode": body.currency_iso_code,
        "shipTo": {
            "name": body.ship_to_address.name,
            "address": {
                "street": body.ship_to_address.street,
                "city": body.ship_to_address.city,
                "state": body.ship_to_address.state_code,
                "postalCode": body.ship_to_address.postal_code,
                "country": body.ship_to_address.country_code,
            },
            "phone": body.ship_to_address.phone,
            "email": body.ship_to_address.email,
        },
        "billTo": {
            "name": bill.name,
            "address": {
                "street": bill.street,
                "city": bill.city,
                "state": bill.state_code,
                "postalCode": bill.postal_code,
                "country": bill.country_code,
            },
            "phone": bill.phone,
            "email": bill.email,
        },
        "cartItems": [
            {
                "productId": item.product2_id,
                "quantity": str(item.quantity),
                "type": "Product",
            }
            for item in body.items
        ],
        "payments": _build_payments(body),
    }
    if body.delivery_method_id:
        payload["deliveryMethodId"] = body.delivery_method_id
    if body.order_reference:
        payload["orderReferenceNumber"] = body.order_reference

    result = await sf_post(
        f"{CONNECT_API}/commerce/webstores/{body.webstore_id}/checkouts",
        payload,
    )
    return {"payload": payload, "result": result}


@router.get("/webstores")
async def get_webstores():
    soql = (
        "SELECT Id, Name, Type, ExternalReference, DefaultTaxLocaleType, CurrencyIsoCode "
        "FROM WebStore WHERE IsDeleted = false ORDER BY Name LIMIT 50"
    )
    result = await sf_get(f"{SF_API}/query", params={"q": soql})
    return result.get("records", [])


@router.get("/accounts/search")
async def search_accounts(q: str):
    safe_q = q.replace("'", "\\'")
    soql = (
        f"SELECT Id, Name, IsPersonAccount, FirstName, LastName, PersonEmail, Phone "
        f"FROM Account WHERE Name LIKE '%{safe_q}%' LIMIT 10"
    )
    result = await sf_get(f"{SF_API}/query", params={"q": soql})
    return result.get("records", [])


@router.get("/delivery-methods")
async def get_delivery_methods():
    soql = "SELECT Id, Name, Carrier, ClassOfService FROM OrderDeliveryMethod WHERE IsActive = true LIMIT 50"
    result = await sf_get(f"{SF_API}/query", params={"q": soql})
    return result.get("records", [])


@router.get("/payment-gateways")
async def get_payment_gateways():
    soql = "SELECT Id, PaymentGatewayName FROM PaymentGateway WHERE IsDeleted = false LIMIT 20"
    result = await sf_get(f"{SF_API}/query", params={"q": soql})
    return result.get("records", [])
