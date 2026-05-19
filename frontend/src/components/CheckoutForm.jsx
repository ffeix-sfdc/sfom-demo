import React, { useState, useEffect } from "react";
import api from "../api/client";
import { cachedGet } from "../api/orgCache";
import { addLog } from "../log/store";
import { useLang } from "../i18n/LangContext";
import CountryStateSelector from "./CountryStateSelector";

const emptyProduct = () => ({
  catalog_product_id: "",
  product2_id: "",
  sku: "",
  product_name: "",
  quantity: 1,
  unit_price: 0,
});

export default function CheckoutForm({ onFormChange, pendingRestore, onRestoreDone, activeCatalogId, onCatalogChange }) {
  const { t } = useLang();
  const [webstores, setWebstores] = useState([]);
  const [deliveryMethods, setDeliveryMethods] = useState([]);
  const [paymentGateways, setPaymentGateways] = useState([]);
  const [catalogs, setCatalogs] = useState([]);
  const [localCatalogId, setLocalCatalogId] = useState(null);
  const [localCatalogProducts, setLocalCatalogProducts] = useState([]);

  const [accountSearch, setAccountSearch] = useState("");
  const [accountResults, setAccountResults] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);

  const [form, setForm] = useState({
    webstore_id: "",
    currency_iso_code: "USD",
    delivery_method_id: "",
    payment_gateway_id: "",
    gateway_token: "undefined",
    card_type: "Visa",
    card_holder_name: "",
    masked_card_number: "************1111",
    expiry_year: "2030",
    expiry_month: "7",
    card_category: "CreditCard",
    processing_mode: "External",
    order_reference: "",
    // ship-to
    ship_name: "",
    ship_email: "",
    ship_phone: "",
    ship_street: "",
    ship_city: "",
    ship_state_code: "",
    ship_postal_code: "",
    ship_country_code: "",
  });

  const [products, setProducts] = useState([emptyProduct()]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const fetchCatalogs = () =>
    cachedGet("/catalogs").then(setCatalogs).catch(() => {});

  const selectCatalog = async (id) => {
    const numId = id ? Number(id) : null;
    setLocalCatalogId(numId);
    setForm((prev) => ({ ...prev, catalog_id: numId }));
    if (numId) {
      const data = await cachedGet(`/catalogs/${numId}/products`).catch(() => []);
      setLocalCatalogProducts(data);
      onCatalogChange?.(numId, data);
    } else {
      setLocalCatalogProducts([]);
      onCatalogChange?.(null, []);
    }
  };

  useEffect(() => {
    Promise.all([
      cachedGet("/checkout/webstores").then(setWebstores).catch(() => {}),
      cachedGet("/checkout/delivery-methods").then(setDeliveryMethods).catch(() => {}),
      cachedGet("/checkout/payment-gateways").then(setPaymentGateways).catch(() => {}),
      fetchCatalogs(),
    ]);
  }, []);

  useEffect(() => {
    if (activeCatalogId && activeCatalogId !== localCatalogId) {
      cachedGet(`/catalogs/${activeCatalogId}/products`)
        .then((data) => { setLocalCatalogId(activeCatalogId); setLocalCatalogProducts(data); })
        .catch(() => {});
    }
  }, [activeCatalogId]);

  useEffect(() => {
    if (paymentGateways.length === 1 && !form.payment_gateway_id) {
      setForm((prev) => ({ ...prev, payment_gateway_id: paymentGateways[0].Id }));
    }
  }, [paymentGateways]);

  useEffect(() => {
    onFormChange?.({ ...form, _products: products }, products, selectedAccount);
    // Live preview payload
    const ws = webstores.find((w) => w.Id === form.webstore_id);
    const gt = products.reduce((s, p) => s + Number(p.quantity) * Number(p.unit_price), 0);
    const preview = {
      webstoreId: form.webstore_id,
      webstoreName: ws?.Name,
      effectiveAccountId: selectedAccount?.Id || "",
      currencyIsoCode: form.currency_iso_code,
      shipTo: {
        name: form.ship_name,
        address: { street: form.ship_street, city: form.ship_city, state: form.ship_state_code, postalCode: form.ship_postal_code, country: form.ship_country_code },
        phone: form.ship_phone,
        email: form.ship_email,
      },
      cartItems: products.map((p) => ({ productId: p.product2_id, quantity: String(p.quantity), type: "Product" })),
      payment: { paymentGatewayId: form.payment_gateway_id, cardType: form.card_type, amount: gt },
      ...(form.delivery_method_id ? { deliveryMethodId: form.delivery_method_id } : {}),
    };
    addLog({ type: "preview", label: "Checkout Payload", body: preview });
  }, [form, products, selectedAccount]);

  useEffect(() => {
    if (!pendingRestore) return;
    const { form: savedForm, products: savedProducts, account: savedAccount } = pendingRestore;
    if (savedForm) {
      const { _products, ...rest } = savedForm;
      setForm(rest);
    }
    if (savedProducts?.length) setProducts(savedProducts);
    if (savedAccount) { setSelectedAccount(savedAccount); setAccountSearch(savedAccount.Name || ""); }
    onRestoreDone?.();
  }, [pendingRestore]);

  const searchAccounts = async () => {
    if (!accountSearch.trim()) return;
    const res = await api.get(`/checkout/accounts/search?q=${encodeURIComponent(accountSearch)}`);
    setAccountResults(res.data);
  };

  const selectAccount = (acc) => {
    setSelectedAccount(acc);
    setAccountResults([]);
    setAccountSearch(acc.Name);
    setForm((prev) => ({
      ...prev,
      ship_name: acc.Name || "",
      ship_email: acc.PersonEmail || "",
      ship_phone: acc.Phone || "",
      card_holder_name: acc.Name || "",
    }));
  };

  const updateProduct = (i, field, value) => {
    const updated = [...products];
    updated[i] = { ...updated[i], [field]: value };
    if (field === "catalog_product_id") {
      const cp = localCatalogProducts.find((p) => String(p.id) === String(value));
      if (cp) {
        updated[i].product2_id = cp.sku;
        updated[i].product_name = cp.name;
        updated[i].sku = cp.sku;
        updated[i].unit_price = cp.unit_price;
      }
    }
    setProducts(updated);
  };

  const grandTotal = products.reduce((s, p) => s + Number(p.quantity) * Number(p.unit_price), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAccount) return setError("Select an account.");
    if (!form.webstore_id) return setError("Select a WebStore.");
    if (!form.payment_gateway_id) return setError("Select a payment gateway.");
    if (products.some((p) => !p.product2_id)) return setError("Select all products.");

    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const payload = {
        webstore_id: form.webstore_id,
        account_id: selectedAccount.Id,
        currency_iso_code: form.currency_iso_code,
        delivery_method_id: form.delivery_method_id,
        order_reference: form.order_reference,
        ship_to_address: {
          name: form.ship_name,
          street: form.ship_street,
          city: form.ship_city,
          state: form.ship_state_code,
          state_code: form.ship_state_code,
          postal_code: form.ship_postal_code,
          country: form.ship_country_code,
          country_code: form.ship_country_code,
          phone: form.ship_phone,
          email: form.ship_email,
        },
        items: products.map((p) => ({
          product2_id: p.product2_id,
          sku: p.sku,
          quantity: Number(p.quantity),
          unit_price: Number(p.unit_price),
        })),
        payment: {
          payment_gateway_id: form.payment_gateway_id,
          gateway_token: form.gateway_token || "undefined",
          card_type: form.card_type,
          card_holder_name: form.card_holder_name,
          masked_card_number: form.masked_card_number,
          expiry_year: form.expiry_year,
          expiry_month: form.expiry_month,
          card_category: form.card_category,
          processing_mode: form.processing_mode,
          amount: grandTotal,
        },
      };
      const res = await api.post("/checkout", payload);
      setResult(res.data.result);
      addLog({ type: "preview", label: "Checkout Payload", body: res.data.payload });
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === "string" ? detail : JSON.stringify(detail, null, 2));
    } finally {
      setSubmitting(false);
    }
  };

  const f = (field) => ({
    value: form[field],
    onChange: (e) => setForm({ ...form, [field]: e.target.value }),
  });

  const inputCls = "w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#00A1E0]";
  const labelCls = "block text-xs font-medium text-gray-600 mb-0.5";
  const sectionCls = "border rounded-lg p-4 space-y-3";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <h2 className="text-lg font-semibold text-gray-800">Checkout</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded px-4 py-2 text-sm whitespace-pre-wrap">
          {error}
        </div>
      )}

      {result && (
        <div className="bg-green-50 border border-green-200 text-green-800 rounded p-4 text-sm">
          <p className="font-medium mb-2">✓ Checkout created</p>
          <pre className="text-xs whitespace-pre-wrap overflow-x-auto">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}

      {/* Order info */}
      <div className={sectionCls}>
        <p className="text-sm font-semibold text-gray-700">Order</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>WebStore *</label>
            <select className={inputCls} {...f("webstore_id")}>
              <option value="">— select —</option>
              {webstores.map((ws) => (
                <option key={ws.Id} value={ws.Id}>{ws.Name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Order Reference</label>
            <input className={inputCls} {...f("order_reference")} placeholder="optional" />
          </div>
        </div>
      </div>

      {/* Account */}
      <div className={sectionCls}>
        <p className="text-sm font-semibold text-gray-700">{t.customerSection}</p>
        <div>
          <label className={labelCls}>{t.sfAccountOptional}</label>
          {selectedAccount ? (
            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded px-3 py-2">
              <span className="text-green-700 font-medium text-sm">✓ {selectedAccount.Name}</span>
              <button type="button"
                onClick={() => { setSelectedAccount(null); setAccountSearch(""); setAccountResults([]); }}
                className="text-xs text-gray-400 hover:text-red-500 ml-3">{t.change}</button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <input className={`${inputCls} flex-1`} placeholder={t.searchByName}
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), searchAccounts())} />
                <button type="button" onClick={searchAccounts}
                  className="bg-gray-100 border rounded px-3 py-1.5 text-sm hover:bg-gray-200">{t.search}</button>
              </div>
              {accountResults.length > 0 && (
                <div className="border rounded shadow-sm bg-white mt-1">
                  {accountResults.map((acc) => (
                    <button type="button" key={acc.Id} onClick={() => selectAccount(acc)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-0">
                      <span className="font-medium">{acc.Name}</span>
                      {acc.PersonEmail && <span className="ml-2 text-gray-400 text-xs">{acc.PersonEmail}</span>}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Ship-to */}
      <div className={sectionCls}>
        <p className="text-sm font-semibold text-gray-700">Ship-to</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>Name</label>
            <input className={inputCls} {...f("ship_name")} />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input type="email" className={inputCls} {...f("ship_email")} />
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input className={inputCls} {...f("ship_phone")} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Street</label>
            <input className={inputCls} {...f("ship_street")} />
          </div>
          <div>
            <label className={labelCls}>City</label>
            <input className={inputCls} {...f("ship_city")} />
          </div>
          <div>
            <label className={labelCls}>Postal Code</label>
            <input className={inputCls} {...f("ship_postal_code")} />
          </div>
        </div>
        <CountryStateSelector
          countryCode={form.ship_country_code}
          stateCode={form.ship_state_code}
          onCountryChange={(code, label) => setForm((prev) => ({ ...prev, ship_country_code: code }))}
          onStateChange={(code, label) => setForm((prev) => ({ ...prev, ship_state_code: code }))}
          labelCountry="Country Code"
          labelState="State Code"
          labelCls={labelCls}
        />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Delivery Method</label>
            <select className={inputCls} {...f("delivery_method_id")}>
              <option value="">— optional —</option>
              {deliveryMethods.map((dm) => (
                <option key={dm.Id} value={dm.Id}>{dm.Name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Payment */}
      <div className={sectionCls}>
        <p className="text-sm font-semibold text-gray-700">{t.paymentSection}</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>{t.paymentGateway} *</label>
            <select className={inputCls} {...f("payment_gateway_id")}>
              <option value="">— select —</option>
              {paymentGateways.map((pg) => (
                <option key={pg.Id} value={pg.Id}>{pg.PaymentGatewayName || pg.Id}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t.cardType}</label>
            <select className={inputCls} {...f("card_type")}>
              {["Visa", "MasterCard", "AmericanExpress", "Discover"].map((ct) => (
                <option key={ct} value={ct}>{ct}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t.cardHolderName}</label>
            <input className={inputCls} {...f("card_holder_name")} />
          </div>
          <div>
            <label className={labelCls}>{t.maskedCardNumber}</label>
            <input className={inputCls} {...f("masked_card_number")} />
          </div>
          <div>
            <label className={labelCls}>{t.expiryMonth}</label>
            <input className={inputCls} {...f("expiry_month")} />
          </div>
          <div>
            <label className={labelCls}>{t.expiryYear}</label>
            <input className={inputCls} {...f("expiry_year")} />
          </div>
        </div>
      </div>

      {/* Products */}
      <div className={sectionCls}>
        <p className="text-sm font-semibold text-gray-700">{t.productsSection}</p>
        <div>
          <label className={labelCls}>{t.catalogLabel}</label>
          <select className={inputCls} value={localCatalogId || ""}
            onChange={(e) => selectCatalog(e.target.value)} onFocus={fetchCatalogs}>
            <option value="">{t.selectCatalogOption}</option>
            {catalogs.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}{cat.description ? ` — ${cat.description}` : ""} ({cat.product_count})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-3">
          {products.map((product, i) => (
            <div key={i} className="bg-gray-50 rounded p-3 space-y-2 border">
              <div className="flex gap-2 min-w-0">
                <select className="flex-1 min-w-0 border rounded px-2 py-1.5 text-sm"
                  value={product.catalog_product_id || ""}
                  onChange={(e) => updateProduct(i, "catalog_product_id", e.target.value)}
                  disabled={!localCatalogId}>
                  <option value="">{localCatalogId ? t.selectProductOption : t.selectCatalogFirst}</option>
                  {localCatalogProducts.map((cp) => (
                    <option key={cp.id} value={cp.id}>
                      {cp.name} ({cp.sku}) — {cp.unit_price.toFixed(2)}
                    </option>
                  ))}
                </select>
                {products.length > 1 && (
                  <button type="button"
                    onClick={() => setProducts(products.filter((_, idx) => idx !== i))}
                    className="text-red-400 hover:text-red-600 text-sm px-2">✕</button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500">{t.qty}</label>
                  <input type="number" min="1" className={inputCls} value={product.quantity}
                    onChange={(e) => updateProduct(i, "quantity", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Unit Price</label>
                  <input type="number" step="0.01" className={inputCls} value={product.unit_price}
                    onChange={(e) => updateProduct(i, "unit_price", e.target.value)} />
                </div>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setProducts([...products, emptyProduct()])}
          className="text-sm text-[#00A1E0] hover:underline">{t.addProductLine}</button>
      </div>

      {/* Total */}
      <div className="bg-gray-50 rounded-lg p-4 text-sm">
        <div className="flex justify-between font-semibold text-base">
          <span>{t.grandTotal}</span>
          <span>{form.currency_iso_code} {grandTotal.toFixed(2)}</span>
        </div>
      </div>

      <button type="submit" disabled={submitting}
        className="w-full bg-[#00A1E0] text-white px-6 py-2.5 rounded font-medium hover:bg-[#0086b3] transition disabled:opacity-50">
        {submitting ? "Submitting…" : "Create Checkout"}
      </button>
    </form>
  );
}
