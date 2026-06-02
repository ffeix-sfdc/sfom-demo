import React, { useState, useEffect } from "react";
import api from "../api/client";
import { cachedGet } from "../api/orgCache";
import { addLog } from "../log/store";
import { useLang } from "../i18n/LangContext";
import CountryStateSelector from "./CountryStateSelector";

const today = new Date().toISOString().split("T")[0];


const genActionRequestId = () => {
  const a = Math.random().toString(20).slice(2);
  const b = Math.random().toString(25).slice(2);
  const c = Date.now().toString(36);
  return `${a}-${b}-${c}`;
};

const emptyDeliveryGroup = () => ({
  order_delivery_method_id: "",
  location_group_id: "",
  location_group_ext_ref: "",
  reserved_at_location_id: "",
  location_ext_ref: "",
  shipping_name: "",
  shipping_email: "",
  shipping_phone: "",
  shipping_street: "",
  shipping_city: "",
  shipping_state: "",
  shipping_state_code: "",
  shipping_postal_code: "",
  shipping_country: "",
  shipping_country_code: "",
  shipping_unit_price: 0,
  shipping_gross_unit_price: 0,
  shipping_tax_amount: 0,
  shipping_tax_rate: 5,
});

const emptyProduct = () => ({
  catalog_product_id: "",
  product2_id: "",
  product_code: "",
  product_name: "",
  description: "",
  sku: "",
  quantity: 1,
  unit_price: 0,
  gross_unit_price: 0,
  list_price: 0,
  tax_amount: 0,
  tax_rate: 5,
  discount_amount: 0,
  discount_tax_amount: 0,
  delivery_group_index: 0,
  reserved_at_location_id: "",
  location_ext_ref: "",
  location_group_ext_ref: "",
  l1_category: "",
  l2_category: "",
  variation_color: "",
  variation_size: "",
});

export default function CreateOrderForm({ onOrderCreated, onFormChange, pendingRestore, onRestoreDone, activeCatalogId, onCatalogChange }) {
  const { t } = useLang();
  const [catalogs, setCatalogs] = useState([]);
  const [localCatalogId, setLocalCatalogId] = useState(null);
  const [localCatalogProducts, setLocalCatalogProducts] = useState([]);

  const [deliveryMethods, setDeliveryMethods] = useState([]);
  const [webstores, setWebstores] = useState([]);
  const [salesChannels, setSalesChannels] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [paymentGateways, setPaymentGateways] = useState([]);
  const [locations, setLocations] = useState([]);
  const [locationGroups, setLocationGroups] = useState([]);
  const [shippingProducts, setShippingProducts] = useState([]);
  const [promotions, setPromotions] = useState([]);

  const [accountSearch, setAccountSearch] = useState("");
  const [accountResults, setAccountResults] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [locationFilters, setLocationFilters] = useState([]);
  const [dgLocationFilters, setDgLocationFilters] = useState([""]);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const [form, setForm] = useState({
    order_reference: "OMD-00000000",
    oci_action_request_id: genActionRequestId(),
    catalog_id: null,
    ordered_date: today,
    currency_iso_code: "",
    tax_locale_type: "Net",

    // webstore
    webstore_id: "",

    // customer / billing
    first_name: "",
    last_name: "",
    billing_email: "",
    billing_phone: "",
    billing_street: "",
    billing_street2: "",
    billing_city: "",
    billing_state: "",
    billing_state_code: "",
    billing_postal_code: "",
    billing_country: "",
    billing_country_code: "",

    // payment
    payment_gateway_id: "",
    gateway_token: "undefined",
    card_type: "Visa",
    card_holder_name: "",
    masked_card_number: "************1111",
    expiry_year: "2030",
    expiry_month: "7",
    card_category: "CreditCard",
    processing_mode: "External",

    // promotion
    promotion_id: "",
    promotion_name: "",
    promotion_display_name: "",
    promotion_description: "",
    promotion_start_date: today,
    promotion_end_date: today,
  });

  const [deliveryGroups, setDeliveryGroups] = useState([emptyDeliveryGroup()]);
  const [products, setProducts] = useState([emptyProduct()]);
  const [useGiftCard, setUseGiftCard] = useState(false);
  const [giftCard, setGiftCard] = useState({ gift_card_number: "", gift_card_pin: "", amount: "" });

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

  const fetchNextRef = () =>
    api.get("/orders/next-reference").then((r) =>
      setForm((prev) => ({ ...prev, order_reference: r.data.reference }))
    );

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([
        fetchNextRef(),
        fetchCatalogs(),
        cachedGet("/orders/delivery-methods").then(setDeliveryMethods),
        cachedGet("/orders/webstores").then(setWebstores),
        cachedGet("/orders/saleschannels").then(setSalesChannels),
        cachedGet("/orders/payment-gateways").then(setPaymentGateways),
        cachedGet("/orders/locations").then(setLocations),
        cachedGet("/orders/location-groups").then(setLocationGroups),
        cachedGet("/orders/shipping-products").then(setShippingProducts),
        cachedGet("/orders/promotions").then(setPromotions),
        cachedGet("/orders/currencies").then((data) => {
          setCurrencies(data);
          if (data.length > 0) {
            const corporate = data.find((c) => c.IsCorporate) || data[0];
            setForm((prev) => ({ ...prev, currency_iso_code: corporate.IsoCode }));
          }
        }),
      ]);
      setLoading(false);
    };
    init();
  }, []);

  // Sync when CatalogPanel selects a catalog externally
  useEffect(() => {
    if (activeCatalogId && activeCatalogId !== localCatalogId) {
      cachedGet(`/catalogs/${activeCatalogId}/products`)
        .then((data) => { setLocalCatalogId(activeCatalogId); setLocalCatalogProducts(data); })
        .catch(() => {});
    }
  }, [activeCatalogId]);

  // Recalc all products when TaxLocaleType changes
  useEffect(() => {
    if (products.some((p) => p.unit_price)) {
      setProducts((prev) => prev.map((p) => applyCalc(p, form.tax_locale_type)));
    }
  }, [form.tax_locale_type]);

  // Mirror billing fields into ship delivery groups (no pickup location) when those fields are empty
  useEffect(() => {
    setDeliveryGroups((prev) =>
      prev.map((dg) => {
        if (dg.reserved_at_location_id || dg.location_ext_ref) return dg;
        return {
          ...dg,
          shipping_email: dg.shipping_email || form.billing_email,
          shipping_phone: dg.shipping_phone || form.billing_phone,
          shipping_street: dg.shipping_street || form.billing_street,
          shipping_city: dg.shipping_city || form.billing_city,
          shipping_state_code: dg.shipping_state_code || form.billing_state_code,
          shipping_postal_code: dg.shipping_postal_code || form.billing_postal_code,
          shipping_country_code: dg.shipping_country_code || form.billing_country_code,
          shipping_name: dg.shipping_name || `${form.first_name} ${form.last_name}`.trim(),
        };
      })
    );
  }, [form.billing_email, form.billing_phone, form.billing_street, form.billing_city,
      form.billing_state_code, form.billing_postal_code, form.billing_country_code,
      form.first_name, form.last_name]);

  // Notify parent of form/products changes (for use-case save)
  useEffect(() => {
    onFormChange?.({ ...form, _deliveryGroups: deliveryGroups, _useGiftCard: useGiftCard, _giftCard: giftCard }, products, selectedAccount);
  }, [form, deliveryGroups, products, selectedAccount, useGiftCard, giftCard]);

  // Live OMS payload preview — debounced call to /orders/preview
  useEffect(() => {
    if (!form.webstore_id) return;
    const ws = webstores.find((w) => w.Id === form.webstore_id);
    const sc = salesChannels.find((s) => s.Id === form.sales_channel_id) || salesChannels[0];

    const dgCalcLocal = deliveryGroups.map((dg) =>
      calcPriceFields(dg.shipping_unit_price, dg.shipping_tax_rate, form.tax_locale_type)
    );
    const pTotal  = products.reduce((s, p) => s + Number(p.quantity) * Number(p.unit_price), 0);
    const tTotal  = products.reduce((s, p) => s + Number(p.tax_amount), 0);
    const dTotal  = products.reduce((s, p) => s + Number(p.discount_amount), 0);
    const sTotal  = dgCalcLocal.reduce((s, c) => s + c.gross, 0);
    const gt      = pTotal + tTotal - dTotal + sTotal;

    const previewPayload = {
      order_reference: form.order_reference,
      oci_action_request_id: form.oci_action_request_id || undefined,
      currency_iso_code: form.currency_iso_code,
      tax_locale_type: form.tax_locale_type,
      ordered_date: form.ordered_date,
      account_id: selectedAccount?.Id || "",
      webstore_id: form.webstore_id,
      webstore_name: ws?.Name || "",
      webstore_external_reference: ws?.ExternalReference || "",
      webstore_type: ws?.Type || "B2CE",
      webstore_default_tax_locale_type: ws?.DefaultTaxLocaleType || "Net",
      webstore_currency_iso_code: ws?.CurrencyIsoCode || "",
      sales_channel_name: sc?.SalesChannelName || ws?.Name || "",
      sales_channel_description: sc?.Description || "",
      delivery_groups: deliveryGroups.map((dg, gi) => {
        const calc = dgCalcLocal[gi];
        return {
          order_delivery_method_id: dg.order_delivery_method_id || "preview",
          location_group_id: dg.location_group_id,
          location_group_ext_ref: dg.location_group_ext_ref,
          reserved_at_location_id: dg.reserved_at_location_id || "",
          location_ext_ref: dg.location_ext_ref || "",
          shipping_name: dg.shipping_name,
          shipping_email: dg.shipping_email,
          shipping_phone: dg.shipping_phone,
          shipping_street: dg.shipping_street,
          shipping_city: dg.shipping_city,
          shipping_state: dg.shipping_state,
          shipping_state_code: dg.shipping_state_code,
          shipping_postal_code: dg.shipping_postal_code,
          shipping_country: dg.shipping_country,
          shipping_country_code: dg.shipping_country_code,
          shipping_unit_price: calc.net,
          shipping_gross_unit_price: calc.gross,
          shipping_tax_amount: calc.tax,
          shipping_tax_rate: Number(dg.shipping_tax_rate),
          ...(dg.pickup_time ? { pickup_time: dg.pickup_time } : {}),
        };
      }),
      first_name: form.first_name,
      last_name: form.last_name,
      billing_email: form.billing_email,
      billing_phone: form.billing_phone,
      billing_street: form.billing_street,
      billing_street2: form.billing_street2,
      billing_city: form.billing_city,
      billing_state: form.billing_state,
      billing_state_code: form.billing_state_code,
      billing_postal_code: form.billing_postal_code,
      billing_country: form.billing_country,
      billing_country_code: form.billing_country_code,
      grand_total: gt,
      payment: {
        payment_gateway_id: form.payment_gateway_id || "preview",
        gateway_token: form.gateway_token || "undefined",
        card_type: form.card_type,
        card_holder_name: form.card_holder_name,
        masked_card_number: form.masked_card_number,
        expiry_year: form.expiry_year,
        expiry_month: form.expiry_month,
        card_category: form.card_category,
        processing_mode: form.processing_mode,
        amount: creditAmount,
      },
      ...(useGiftCard && giftCard.gift_card_number ? {
        gift_card_payment: {
          gift_card_number: giftCard.gift_card_number,
          gift_card_pin: giftCard.gift_card_pin,
          amount: gcAmount,
        },
      } : {}),
      promotion: form.promotion_name
        ? {
            name: form.promotion_name,
            display_name: form.promotion_display_name || form.promotion_name,
            description: form.promotion_description,
            start_date: form.promotion_start_date,
            end_date: form.promotion_end_date,
            is_active: true,
          }
        : null,
      products: products.map((p) => ({
        product2_id: p.product2_id || "preview",
        product_code: p.product_code,
        product_name: p.product_name,
        description: p.description,
        sku: p.sku || "preview",
        quantity: Number(p.quantity),
        unit_price: Number(p.unit_price),
        gross_unit_price: Number(p.gross_unit_price) || Number(p.unit_price),
        list_price: Number(p.list_price) || Number(p.unit_price),
        tax_amount: Number(p.tax_amount),
        tax_rate: Number(p.tax_rate),
        discount_amount: Number(p.discount_amount),
        discount_tax_amount: Number(p.discount_tax_amount),
        delivery_group_index: Number(p.delivery_group_index) || 0,
        reserved_at_location_id: p.reserved_at_location_id || "",
        location_group_ext_ref: p.location_group_ext_ref || "",
        location_ext_ref: p.location_ext_ref || "",
        l1_category: p.l1_category,
        l2_category: p.l2_category,
        variation_color: p.variation_color,
        variation_size: p.variation_size,
      })),
    };

    const timer = setTimeout(() => {
      api.post("/orders/preview", previewPayload)
        .then((res) => {
          if (res.data.oms_payload) {
            addLog({ type: "preview", label: "OMS Payload Preview", body: res.data.oms_payload });
          }
        })
        .catch(() => {});
    }, 600);
    return () => clearTimeout(timer);
  }, [form, deliveryGroups, products, selectedAccount, useGiftCard, giftCard]);

  // Restore a saved use-case snapshot
  useEffect(() => {
    if (!pendingRestore) return;
    const { form: savedForm, products: savedProducts, account: savedAccount } = pendingRestore;
    const savedDgs = savedForm?._deliveryGroups;
    setForm({
      ...savedForm,
      oci_action_request_id: genActionRequestId(),
      ordered_date: new Date().toISOString().split("T")[0],
    });
    fetchNextRef();
    if (savedDgs && savedDgs.length > 0) {
      setDeliveryGroups(savedDgs);
      setDgLocationFilters(savedDgs.map((dg) =>
        dg.reserved_at_location_id && dg.shipping_name ? dg.shipping_name : ""
      ));
    }
    setProducts(savedProducts);
    setLocationFilters(savedProducts.map(() => ""));
    if (savedAccount) {
      setSelectedAccount(savedAccount);
      setAccountSearch(savedAccount.Name || "");
    }
    // Restore gift card state (reset to default if not in snapshot)
    setUseGiftCard(savedForm?._useGiftCard ?? false);
    setGiftCard(savedForm?._giftCard ?? { gift_card_number: "", gift_card_pin: "", amount: "" });

    // Restore catalog
    const savedCatalogId = savedForm?.catalog_id;
    if (savedCatalogId) {
      setLocalCatalogId(savedCatalogId);
      cachedGet(`/catalogs/${savedCatalogId}/products`)
        .then(setLocalCatalogProducts)
        .catch(() => setLocalCatalogProducts([]));
    }
    onRestoreDone?.();
  }, [pendingRestore]);

  // Auto-fill payment gateway when only one exists
  useEffect(() => {
    if (paymentGateways.length === 1 && !form.payment_gateway_id) {
      setForm((prev) => ({ ...prev, payment_gateway_id: paymentGateways[0].Id }));
    }
  }, [paymentGateways]);

  // When webstores load, derive currency/tax locale/sales channel if webstore_id is already set
  // (e.g. from a pendingRestore that fired before webstores were fetched)
  useEffect(() => {
    if (!webstores.length) return;
    setForm((prev) => {
      if (!prev.webstore_id) return prev;
      const ws = webstores.find((w) => w.Id === prev.webstore_id);
      if (!ws) return prev;
      const matchSc = salesChannels.find((sc) =>
        sc.SalesChannelName?.toLowerCase() === ws.Name?.toLowerCase()
      );
      return {
        ...prev,
        ...(ws.CurrencyIsoCode ? { currency_iso_code: ws.CurrencyIsoCode } : {}),
        ...(ws.DefaultTaxLocaleType ? { tax_locale_type: ws.DefaultTaxLocaleType } : {}),
        ...(matchSc ? { sales_channel_id: matchSc.Id } : {}),
      };
    });
  }, [webstores]);

  const searchAccounts = async () => {
    if (!accountSearch.trim()) return;
    const res = await api.get(`/orders/accounts/search?q=${encodeURIComponent(accountSearch)}`);
    setAccountResults(res.data);
  };

  const selectAccount = (acc) => {
    setSelectedAccount(acc);
    setAccountResults([]);
    setAccountSearch(acc.Name);
    setForm((prev) => ({
      ...prev,
      first_name: acc.FirstName || "",
      last_name: acc.LastName || acc.Name || "",
      billing_email: acc.PersonEmail || "",
      billing_phone: acc.Phone || "",
      billing_street: acc.BillingStreet || "",
      billing_street2: "",
      billing_city: acc.BillingCity || "",
      billing_state: acc.BillingState || "",
      billing_state_code: acc.BillingStateCode || "",
      billing_postal_code: acc.BillingPostalCode || "",
      billing_country: acc.BillingCountry || "",
      billing_country_code: acc.BillingCountryCode || "",
      card_holder_name: acc.Name || "",
    }));
    // Pre-fill ship delivery groups (no pickup location) if fields not yet filled
    setDeliveryGroups((prev) =>
      prev.map((dg) => {
        if (dg.reserved_at_location_id || dg.location_ext_ref) return dg;
        return {
          ...dg,
          shipping_name: dg.shipping_name || acc.Name || "",
          shipping_email: dg.shipping_email || acc.PersonEmail || "",
          shipping_phone: dg.shipping_phone || acc.Phone || "",
          shipping_street: dg.shipping_street || acc.BillingStreet || "",
          shipping_city: dg.shipping_city || acc.BillingCity || "",
          shipping_state: dg.shipping_state || acc.BillingState || "",
          shipping_state_code: dg.shipping_state_code || acc.BillingStateCode || "",
          shipping_postal_code: dg.shipping_postal_code || acc.BillingPostalCode || "",
          shipping_country: dg.shipping_country || acc.BillingCountry || "",
          shipping_country_code: dg.shipping_country_code || acc.BillingCountryCode || "",
        };
      })
    );
    // Also pre-fill ship delivery groups from billing fields when typed manually (handled in effect below)
  };

  const selectPromotion = (promoId) => {
    const promo = promotions.find((p) => p.Id === promoId);
    if (promo) {
      setForm((prev) => ({
        ...prev,
        promotion_id: promo.Id,
        promotion_name: promo.Name,
        promotion_display_name: promo.DisplayName || promo.Name,
        promotion_description: promo.Description || "",
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        promotion_id: "",
        promotion_name: "",
        promotion_display_name: "",
        promotion_description: "",
      }));
    }
  };

  const selectWebstore = (wsId) => {
    const ws = webstores.find((w) => w.Id === wsId);
    if (ws) {
      const matchSc = salesChannels.find((sc) =>
        sc.SalesChannelName?.toLowerCase() === ws.Name?.toLowerCase()
      );
      setForm((prev) => ({
        ...prev,
        webstore_id: ws.Id,
        ...(ws.CurrencyIsoCode ? { currency_iso_code: ws.CurrencyIsoCode } : {}),
        ...(ws.DefaultTaxLocaleType ? { tax_locale_type: ws.DefaultTaxLocaleType } : {}),
        ...(matchSc ? { sales_channel_id: matchSc.Id } : {}),
      }));
    }
  };

  // Compute tax-related fields from unit price + rate + TaxLocaleType
  // Net  : price is pre-tax  → tax = price * rate/100, gross = price + tax
  // Gross: price is incl-tax → tax = price * rate/(100+rate), net  = price - tax, gross = price
  const calcPriceFields = (unitPrice, taxRate, taxLocaleType) => {
    const p = Number(unitPrice) || 0;
    const r = Number(taxRate) || 0;
    let tax, gross, net;
    if (taxLocaleType === "Gross") {
      tax   = round2(p * r / (100 + r));
      net   = round2(p - tax);
      gross = p;
    } else {
      tax   = round2(p * r / 100);
      net   = p;
      gross = round2(p + tax);
    }
    return { net, tax, gross };
  };

  const round2 = (v) => Math.round(v * 100) / 100;

  const applyCalc = (p, taxLocaleType) => {
    const { net, tax, gross } = calcPriceFields(p.unit_price, p.tax_rate, taxLocaleType);
    return {
      ...p,
      unit_price: net,
      list_price: net,
      tax_amount: round2(tax * Number(p.quantity || 1)),
      gross_unit_price: gross,
    };
  };

  const updateProduct = (index, field, value) => {
    const updated = [...products];
    updated[index] = { ...updated[index], [field]: value };
    if (field === "catalog_product_id") {
      const cp = localCatalogProducts.find((p) => String(p.id) === String(value));
      if (cp) {
        updated[index].catalog_product_id = cp.id;
        updated[index].product2_id = cp.sku;
        updated[index].product_name = cp.name;
        updated[index].product_code = cp.sku;
        updated[index].sku = cp.sku;
        updated[index].description = cp.name;
        updated[index].unit_price = cp.unit_price;
        updated[index].list_price = cp.unit_price;
      }
    }
    if (["unit_price", "tax_rate", "quantity", "catalog_product_id"].includes(field)) {
      updated[index] = applyCalc(updated[index], form.tax_locale_type);
    }
    if (field === "reserved_at_location_id") {
      const loc = locations.find((l) => l.Id === value);
      updated[index].location_ext_ref = loc?.ExternalReference || "";
    }
    setProducts(updated);
  };

  const addProduct = () => {
    setProducts([...products, emptyProduct()]);
    setLocationFilters([...locationFilters, ""]);
  };
  const removeProduct = (i) => {
    setProducts(products.filter((_, idx) => idx !== i));
    setLocationFilters(locationFilters.filter((_, idx) => idx !== i));
  };

  // Derive calculated fields for each delivery group
  const dgCalc = deliveryGroups.map((dg) =>
    calcPriceFields(dg.shipping_unit_price, dg.shipping_tax_rate, form.tax_locale_type)
  );

  const productTotal  = products.reduce((sum, p) => sum + Number(p.quantity) * Number(p.unit_price), 0);
  const taxTotal      = products.reduce((sum, p) => sum + Number(p.tax_amount), 0);
  const discountTotal = products.reduce((sum, p) => sum + Number(p.discount_amount), 0);
  const shippingTotal = dgCalc.reduce((sum, c) => sum + c.gross, 0);
  const grandTotal    = productTotal + taxTotal - discountTotal + shippingTotal;
  const gcAmount      = useGiftCard ? Math.min(Number(giftCard.amount) || 0, grandTotal) : 0;
  const creditAmount  = grandTotal - gcAmount;

  const selectedWebstore = webstores.find((w) => w.Id === form.webstore_id);
  const selectedSalesChannel = salesChannels.find((sc) => sc.Id === form.sales_channel_id);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!localCatalogId) return setError(t.selectCatalogError);
    if (!form.webstore_id) return setError(t.selectWebstoreError);
    if (deliveryGroups.some((dg) => !dg.order_delivery_method_id))
      return setError(t.selectDeliveryMethodError);
    if (!form.payment_gateway_id) return setError(t.selectPaymentGatewayError);
    if (products.some((p) => !p.product2_id))
      return setError(t.selectProductError);
    const missingSku = products.findIndex((p) => !p.sku);
    if (missingSku !== -1)
      return setError(t.missingSkuError(missingSku));

    setSubmitting(true);
    setError(null);
    try {
      const ws = selectedWebstore;
      const sc = selectedSalesChannel || salesChannels[0];

      const payload = {
        order_reference: form.order_reference,
        oci_action_request_id: form.oci_action_request_id || undefined,
        currency_iso_code: form.currency_iso_code,
        tax_locale_type: form.tax_locale_type,
        ordered_date: form.ordered_date,

        account_id: selectedAccount?.Id || "",

        webstore_id: form.webstore_id,
        webstore_name: ws?.Name || "",
        webstore_external_reference: ws?.ExternalReference || "",
        webstore_type: ws?.Type || "B2CE",
        webstore_default_tax_locale_type: ws?.DefaultTaxLocaleType || "Net",
        webstore_currency_iso_code: ws?.CurrencyIsoCode || "",

        sales_channel_name: sc?.SalesChannelName || ws?.Name || "",
        sales_channel_description: sc?.Description || "",

        delivery_groups: deliveryGroups.map((dg, gi) => {
          const calc = dgCalc[gi];
          return {
            order_delivery_method_id: dg.order_delivery_method_id,
            location_group_id: dg.location_group_id,
            location_group_ext_ref: dg.location_group_ext_ref,
            reserved_at_location_id: dg.reserved_at_location_id || "",
            location_ext_ref: dg.location_ext_ref || "",
            shipping_name: dg.shipping_name,
            shipping_email: dg.shipping_email,
            shipping_phone: dg.shipping_phone,
            shipping_street: dg.shipping_street,
            shipping_city: dg.shipping_city,
            shipping_state: dg.shipping_state,
            shipping_state_code: dg.shipping_state_code,
            shipping_postal_code: dg.shipping_postal_code,
            shipping_country: dg.shipping_country,
            shipping_country_code: dg.shipping_country_code,
            shipping_unit_price: calc.net,
            shipping_gross_unit_price: calc.gross,
            shipping_tax_amount: calc.tax,
            shipping_tax_rate: Number(dg.shipping_tax_rate),
            ...(dg.pickup_time ? { pickup_time: dg.pickup_time } : {}),
          };
        }),

        first_name: form.first_name,
        last_name: form.last_name,
        billing_email: form.billing_email,
        billing_phone: form.billing_phone,
        billing_street: form.billing_street,
        billing_street2: form.billing_street2,
        billing_city: form.billing_city,
        billing_state: form.billing_state,
        billing_state_code: form.billing_state_code,
        billing_postal_code: form.billing_postal_code,
        billing_country: form.billing_country,
        billing_country_code: form.billing_country_code,

        grand_total: grandTotal,

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
          amount: creditAmount,
        },
        ...(useGiftCard && giftCard.gift_card_number ? {
          gift_card_payment: {
            gift_card_number: giftCard.gift_card_number,
            gift_card_pin: giftCard.gift_card_pin,
            amount: gcAmount,
          },
        } : {}),

        promotion: form.promotion_name
          ? {
              name: form.promotion_name,
              display_name: form.promotion_display_name || form.promotion_name,
              description: form.promotion_description,
              start_date: form.promotion_start_date,
              end_date: form.promotion_end_date,
              is_active: true,
            }
          : null,

        products: products.map((p) => ({
          product2_id: p.product2_id,
          product_code: p.product_code,
          product_name: p.product_name,
          description: p.description,
          sku: p.sku,
          quantity: Number(p.quantity),
          unit_price: Number(p.unit_price),
          gross_unit_price: Number(p.gross_unit_price) || Number(p.unit_price),
          list_price: Number(p.list_price) || Number(p.unit_price),
          tax_amount: Number(p.tax_amount),
          tax_rate: Number(p.tax_rate),
          discount_amount: Number(p.discount_amount),
          discount_tax_amount: Number(p.discount_tax_amount),
          delivery_group_index: Number(p.delivery_group_index) || 0,
          reserved_at_location_id: p.reserved_at_location_id || "",
          location_group_ext_ref: p.location_group_ext_ref || "",
          location_ext_ref: p.location_ext_ref || "",
          l1_category: p.l1_category,
          l2_category: p.l2_category,
          variation_color: p.variation_color,
          variation_size: p.variation_size,
        })),

      };

      const res = await api.post("/orders", payload);
      const data = res.data;
      onOrderCreated(data);

      // Update preview with the actual OMS payload sent
      if (data.oms_payload) {
        addLog({ type: "preview", label: "OMS Payload", body: data.oms_payload });
      }
      // Log OCI request + response as separate console entries
      if (data.oci_payload) {
        addLog({
          type: "request",
          method: "POST",
          url: "/commerce/oci/reservation/actions/reservations",
          body: data.oci_payload,
        });
      }
      if (data.oci_result) {
        addLog({
          type: data.oci_result.error ? "error" : "response",
          method: "POST",
          url: "/commerce/oci/reservation/actions/reservations",
          status: data.oci_result.error ? 400 : 200,
          body: data.oci_result,
        });
      }

      fetchNextRef();
      setForm((prev) => ({ ...prev, oci_action_request_id: genActionRequestId() }));
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : JSON.stringify(detail, null, 2)
      );
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-4 text-gray-400">
        <svg className="animate-spin h-10 w-10 text-[#00A1E0]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/*<h2 className="text-lg font-semibold text-gray-800">{t.createOrderTitle}</h2>*/}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded px-4 py-2 text-sm whitespace-pre-wrap">
          {typeof error === "object" ? JSON.stringify(error, null, 2) : error}
        </div>
      )}

      {/* ── Order identity ───────────────────────────────── */}
      <div className={sectionCls}>
        <p className="text-sm font-semibold text-gray-700">{t.orderSection}</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>{t.reference}</label>
            <input className={inputCls} {...f("order_reference")} />
          </div>
          <div>
            <label className={labelCls}>{t.orderedDate}</label>
            <input type="date" className={inputCls} {...f("ordered_date")} />
          </div>
          <div>
            <label className={labelCls}>{t.webstore}</label>
            <select className={inputCls} value={form.webstore_id}
              onChange={(e) => selectWebstore(e.target.value)}>
              <option value="">{t.selectPlaceholder}</option>
              {webstores.map((ws) => (
                <option key={ws.Id} value={ws.Id}>{ws.Name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t.salesChannel}</label>
            <select className={inputCls} value={form.sales_channel_id || ""}
              onChange={(e) => setForm({ ...form, sales_channel_id: e.target.value })}>
              <option value="">{t.salesChannelAuto}</option>
              {salesChannels.map((sc) => (
                <option key={sc.Id} value={sc.Id}>{sc.SalesChannelName}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Details — collapsed by default */}
        <div className="mt-2 border-t pt-2">
          <button
            type="button"
            onClick={() => setDetailsOpen((o) => !o)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
          >
            <span>{detailsOpen ? "▼" : "▶"}</span>
            <span>{t.details}</span>
          </button>
          {detailsOpen && (
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t.currency}</label>
                <div className={`${inputCls} bg-gray-50 text-gray-500`}>
                  {form.currency_iso_code || <span className="text-gray-300">—</span>}
                </div>
              </div>
              <div>
                <label className={labelCls}>{t.taxLocaleType}</label>
                <div className={`${inputCls} bg-gray-50 text-gray-500`}>
                  {form.tax_locale_type || <span className="text-gray-300">—</span>}
                </div>
              </div>
              <div className="col-span-2">
                <label className={labelCls}>{t.ociActionRequestId}</label>
                <div className={`${inputCls} bg-gray-50 text-gray-500 truncate font-mono text-xs`}>
                  {form.oci_action_request_id || <span className="text-gray-300">—</span>}
                </div>
              </div>
              <div className="col-span-2">
                <label className={labelCls}>{t.webstoreExternalRef}</label>
                <div className={`${inputCls} bg-gray-50 text-gray-500 font-mono text-xs`}>
                  {selectedWebstore?.ExternalReference || <span className="text-gray-300">—</span>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Customer / Account ──────────────────────────── */}
      <div className={sectionCls}>
        <p className="text-sm font-semibold text-gray-700">{t.customerSection}</p>

        {/* Salesforce account lookup */}
        <div>
          <label className={labelCls}>{t.sfAccountOptional}</label>
          {selectedAccount ? (
            <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded px-3 py-2">
              <div>
                <span className="text-green-700 font-medium text-sm">✓ {selectedAccount.Name}</span>
                {selectedAccount.IsPersonAccount && (
                  <span className="ml-2 text-[#00A1E0] text-xs">{t.personBadge}</span>
                )}
                {selectedAccount.PersonEmail && (
                  <span className="ml-2 text-gray-400 text-xs">{selectedAccount.PersonEmail}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => { setSelectedAccount(null); setAccountSearch(""); setAccountResults([]); }}
                className="text-xs text-gray-400 hover:text-red-500 ml-3"
              >
                {t.change}
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  className={`${inputCls} flex-1`}
                  placeholder={t.searchByName}
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), searchAccounts())}
                />
                <button type="button" onClick={searchAccounts} className="bg-gray-100 border rounded px-3 py-1.5 text-sm hover:bg-gray-200">
                  {t.search}
                </button>
              </div>
              {accountResults.length > 0 && (
                <div className="border rounded shadow-sm bg-white mt-1">
                  {accountResults.map((acc) => (
                    <button type="button" key={acc.Id} onClick={() => selectAccount(acc)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-0">
                      <span className="font-medium">{acc.Name}</span>
                      {acc.PersonEmail && <span className="ml-2 text-gray-400 text-xs">{acc.PersonEmail}</span>}
                      {acc.IsPersonAccount && <span className="ml-2 text-[#00A1E0] text-xs">{t.personBadge}</span>}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Customer fields — always editable */}
        <div className="grid grid-cols-2 gap-3 mt-1">
          <div>
            <label className={labelCls}>{t.firstName}</label>
            <input className={inputCls} {...f("first_name")} />
          </div>
          <div>
            <label className={labelCls}>{t.lastName}</label>
            <input className={inputCls} {...f("last_name")} />
          </div>
          <div>
            <label className={labelCls}>{t.email}</label>
            <input type="email" className={inputCls} {...f("billing_email")} />
          </div>
          <div>
            <label className={labelCls}>{t.phone}</label>
            <input className={inputCls} {...f("billing_phone")} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>{t.address1}</label>
            <input className={inputCls} {...f("billing_street")} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>{t.address2}</label>
            <input className={inputCls} {...f("billing_street2")} />
          </div>
          <div>
            <label className={labelCls}>{t.city}</label>
            <input className={inputCls} {...f("billing_city")} />
          </div>
          <div>
            <label className={labelCls}>{t.zipCode}</label>
            <input className={inputCls} {...f("billing_postal_code")} />
          </div>
        </div>
        <CountryStateSelector
          countryCode={form.billing_country_code}
          stateCode={form.billing_state_code}
          onCountryChange={(code, label) => setForm((prev) => ({ ...prev, billing_country_code: code, billing_country: label }))}
          onStateChange={(code, label) => setForm((prev) => ({ ...prev, billing_state_code: code, billing_state: label }))}
          labelCountry={t.country}
          labelState={t.state}
          labelCls={labelCls}
        />
      </div>


{/* ── Delivery Groups ──────────────────────────────── */}
      {deliveryGroups.map((dg, gi) => {
        const calc = dgCalc[gi];
        const fDg = (field) => ({
          value: dg[field],
          onChange: (e) => {
            const updated = [...deliveryGroups];
            updated[gi] = { ...updated[gi], [field]: e.target.value };
            setDeliveryGroups(updated);
          },
        });
        return (
          <div key={gi} className={sectionCls}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">
                {t.deliveryGroupSection(gi + 1, deliveryGroups.length)}
              </p>
              {deliveryGroups.length > 1 && (
                <button type="button"
                  onClick={() => {
                    setDeliveryGroups(deliveryGroups.filter((_, idx) => idx !== gi));
                    setDgLocationFilters(dgLocationFilters.filter((_, idx) => idx !== gi));
                    setProducts(products.map((p) => ({
                      ...p,
                      delivery_group_index: p.delivery_group_index === gi
                        ? 0
                        : p.delivery_group_index > gi
                        ? p.delivery_group_index - 1
                        : p.delivery_group_index,
                    })));
                  }}
                  className="text-xs text-red-400 hover:text-red-600">{t.removeDeliveryGroup}</button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Delivery method */}
              <div className="col-span-2">
                <label className={labelCls}>{t.deliveryMethod}</label>
                <select className={inputCls} {...fDg("order_delivery_method_id")}>
                  <option value="">{t.selectPlaceholder}</option>
                  {deliveryMethods.map((dm) => (
                    <option key={dm.Id} value={dm.Id}>{dm.Name}</option>
                  ))}
                </select>
              </div>

              {/* OCI location */}
              <div className="col-span-2">
                <label className={labelCls}>{t.locationGroupOci}</label>
                <select className={inputCls} value={dg.location_group_id}
                  onChange={(e) => {
                    const lg = locationGroups.find((l) => l.Id === e.target.value);
                    const updated = [...deliveryGroups];
                    updated[gi] = { ...updated[gi], location_group_id: lg?.Id || "", location_group_ext_ref: lg?.ExternalReference || "" };
                    setDeliveryGroups(updated);
                  }}>
                  <option value="">{t.selectPlaceholder}</option>
                  {locationGroups.map((lg) => (
                    <option key={lg.Id} value={lg.Id}>{lg.LocationGroupName}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className={labelCls}>{t.reservedAtLocation} <span className="text-gray-400 font-normal">{t.reservedAtLocationHint}</span></label>
                {dg.reserved_at_location_id ? (
                  <div className="flex items-center gap-2 border rounded px-2 py-1.5 bg-blue-50 border-blue-200">
                    <span className="text-sm text-blue-800 flex-1 truncate font-medium">{dg.shipping_name}</span>
                    <button type="button"
                      onClick={() => {
                        const updated = [...deliveryGroups];
                        updated[gi] = { ...updated[gi], reserved_at_location_id: "", location_ext_ref: "", shipping_name: "" };
                        setDeliveryGroups(updated);
                        const f = [...dgLocationFilters]; f[gi] = "";
                        setDgLocationFilters(f);
                      }}
                      className="text-blue-400 hover:text-red-500 text-sm leading-none shrink-0">×</button>
                  </div>
                ) : (
                  <>
                    <input className={inputCls} placeholder={t.typeToFilter}
                      value={dgLocationFilters[gi] ?? ""}
                      onChange={(e) => {
                        const f = [...dgLocationFilters]; f[gi] = e.target.value;
                        setDgLocationFilters(f);
                      }} />
                    {(dgLocationFilters[gi] ?? "").length > 0 && (
                      <div className="border rounded mt-0.5 shadow-sm bg-white max-h-36 overflow-y-auto">
                        {locations.filter((l) => l.Name.toLowerCase().includes((dgLocationFilters[gi] ?? "").toLowerCase())).map((l) => (
                          <button type="button" key={l.Id}
                            onClick={() => {
                              const va = l.VisitorAddress;
                              const updated = [...deliveryGroups];
                              updated[gi] = {
                                ...updated[gi],
                                reserved_at_location_id: l.Id,
                                location_ext_ref: l.ExternalReference || "",
                                shipping_name: l.Name,
                                ...(va ? {
                                  shipping_street: va.Street || "",
                                  shipping_city: va.City || "",
                                  shipping_state_code: va.StateCode || "",
                                  shipping_postal_code: va.PostalCode || "",
                                  shipping_country_code: va.CountryCode || "",
                                } : {}),
                              };
                              setDeliveryGroups(updated);
                              const f = [...dgLocationFilters]; f[gi] = "";
                              setDgLocationFilters(f);
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 border-b last:border-0">
                            {l.Name}{l.LocationType ? ` (${l.LocationType})` : ""}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Shipping address */}
              <div>
                <label className={labelCls}>{t.deliverToName}</label>
                <input className={inputCls} {...fDg("shipping_name")} />
              </div>
              <div>
                <label className={labelCls}>{t.emailOptional}</label>
                <input className={inputCls} type="email" {...fDg("shipping_email")} />
              </div>
              <div>
                <label className={labelCls}>{t.phone}</label>
                <input className={inputCls} {...fDg("shipping_phone")} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>{t.street}</label>
                <input className={inputCls} {...fDg("shipping_street")} />
              </div>
              <div>
                <label className={labelCls}>{t.city}</label>
                <input className={inputCls} {...fDg("shipping_city")} />
              </div>
              <div>
                <label className={labelCls}>{t.postalCode}</label>
                <input className={inputCls} {...fDg("shipping_postal_code")} />
              </div>
            </div>
            <CountryStateSelector
              countryCode={dg.shipping_country_code}
              stateCode={dg.shipping_state_code}
              onCountryChange={(code, label) => {
                const updated = [...deliveryGroups];
                updated[gi] = { ...updated[gi], shipping_country_code: code, shipping_country: label };
                setDeliveryGroups(updated);
              }}
              onStateChange={(code, label) => {
                const updated = [...deliveryGroups];
                updated[gi] = { ...updated[gi], shipping_state_code: code, shipping_state: label };
                setDeliveryGroups(updated);
              }}
              labelCountry={t.countryCode}
              labelState={t.stateCode}
              labelCls={labelCls}
            />
            <div className="grid grid-cols-2 gap-3">

              {/* Shipping charge */}
              <div>
                <label className={labelCls}>{t.shippingUnitPrice(form.tax_locale_type)}</label>
                <input type="number" step="0.01" min="0" className={inputCls} {...fDg("shipping_unit_price")} />
              </div>
              <div>
                <label className={labelCls}>{t.shippingTaxRate}</label>
                <input type="number" step="0.01" min="0" className={inputCls} {...fDg("shipping_tax_rate")} />
              </div>
              <div>
                <label className={labelCls}>{t.shippingTax} <span className="text-gray-400 font-normal">{t.calculated}</span></label>
                <div className={`${inputCls} bg-gray-50 text-gray-600`}>{calc.tax.toFixed(2)}</div>
              </div>
              <div>
                <label className={labelCls}>{t.shippingGross} <span className="text-gray-400 font-normal">{t.calculated}</span></label>
                <div className={`${inputCls} bg-gray-50 text-gray-600`}>{calc.gross.toFixed(2)}</div>
              </div>
            </div>
          </div>
        );
      })}

      <button type="button"
        onClick={() => {
          setDeliveryGroups([...deliveryGroups, emptyDeliveryGroup()]);
          setDgLocationFilters([...dgLocationFilters, ""]);
        }}
        className="text-sm text-[#00A1E0] hover:underline">
        {t.addDeliveryGroup}
      </button>

      {/* ── Payment ─────────────────────────────────────── */}
      <div className={sectionCls}>
        <p className="text-sm font-semibold text-gray-700">{t.paymentSection}</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>{t.paymentGateway}</label>
            <select className={inputCls} {...f("payment_gateway_id")}>
              <option value="">{t.selectPlaceholder}</option>
              {paymentGateways.map((pg) => (
                <option key={pg.Id} value={pg.Id}>{pg.PaymentGatewayName || pg.Id}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t.cardType}</label>
            <select className={inputCls} {...f("card_type")}>
              {["Visa","MasterCard","AmericanExpress","Discover"].map((ct) => (
                <option key={ct} value={ct}>{ct}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t.cardCategory}</label>
            <select className={inputCls} {...f("card_category")}>
              <option value="CreditCard">{t.creditCard}</option>
              <option value="DebitCard">{t.debitCard}</option>
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
            <input className={inputCls} placeholder="7" {...f("expiry_month")} />
          </div>
          <div>
            <label className={labelCls}>{t.expiryYear}</label>
            <input className={inputCls} placeholder="2030" {...f("expiry_year")} />
          </div>
          <div>
            <label className={labelCls}>{t.processingMode}</label>
            <select className={inputCls} {...f("processing_mode")}>
              <option value="External">External</option>
              <option value="Salesforce">Salesforce</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>{t.gatewayToken}</label>
            <input className={inputCls} {...f("gateway_token")} />
          </div>
        </div>
      </div>

      {/* ── Gift Card ───────────────────────────────────── */}
      <div className={sectionCls}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">{t.giftCardSection}</p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={useGiftCard}
              onChange={(e) => setUseGiftCard(e.target.checked)}
              className="rounded" />
            <span className="text-xs text-gray-500">{useGiftCard ? "Enabled" : "Disabled"}</span>
          </label>
        </div>
        {useGiftCard && (
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div className="col-span-2">
              <label className={labelCls}>{t.giftCardNumber}</label>
              <input className={inputCls} value={giftCard.gift_card_number}
                onChange={(e) => setGiftCard((g) => ({ ...g, gift_card_number: e.target.value }))}
                placeholder="GC-XXXXXXXX" />
            </div>
            <div>
              <label className={labelCls}>{t.giftCardPin}</label>
              <input className={inputCls} value={giftCard.gift_card_pin}
                onChange={(e) => setGiftCard((g) => ({ ...g, gift_card_pin: e.target.value }))}
                placeholder="—" />
            </div>
            <div>
              <label className={labelCls}>{t.giftCardAmount}</label>
              <input type="number" step="0.01" min="0" max={grandTotal} className={inputCls}
                value={giftCard.amount}
                onChange={(e) => setGiftCard((g) => ({ ...g, amount: e.target.value }))}
                placeholder="0.00" />
            </div>
            {gcAmount > 0 && (
              <div className="col-span-2 bg-blue-50 border border-blue-100 rounded px-3 py-2 text-xs text-blue-700 space-y-0.5">
                <div className="flex justify-between"><span>{t.giftCardAmount}</span><span>{form.currency_iso_code} {gcAmount.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>{t.creditCardAmount}</span><span>{form.currency_iso_code} {creditAmount.toFixed(2)}</span></div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Promotion ───────────────────────────────────── */}
      <div className={sectionCls}>
        <p className="text-sm font-semibold text-gray-700">{t.promotionSection}</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>Promotion</label>
            <select className={inputCls} value={form.promotion_id}
              onChange={(e) => selectPromotion(e.target.value)}>
              <option value="">{t.promotionNone}</option>
              {promotions.map((p) => (
                <option key={p.Id} value={p.Id}>{p.DisplayName || p.Name}</option>
              ))}
            </select>
          </div>
          {form.promotion_name && (
            <>
              <div>
                <label className={labelCls}>{t.startDate}</label>
                <input type="date" className={inputCls} {...f("promotion_start_date")} />
              </div>
              <div>
                <label className={labelCls}>{t.endDate}</label>
                <input type="date" className={inputCls} {...f("promotion_end_date")} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Products ─────────────────────────────────────── */}
      <div className={sectionCls}>
        <p className="text-sm font-semibold text-gray-700">{t.productsSection}</p>

        {/* Catalog selector */}
        <div>
          <label className={labelCls}>{t.catalogLabel}</label>
          <select
            className={inputCls}
            value={localCatalogId || ""}
            onChange={(e) => selectCatalog(e.target.value)}
            onFocus={fetchCatalogs}
          >
            <option value="">{t.selectCatalogOption}</option>
            {catalogs.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}{cat.description ? ` — ${cat.description}` : ""} ({cat.product_count})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-4">
          {products.map((product, i) => (
            <div key={i} className={`bg-gray-50 rounded p-3 space-y-2 border ${product.product2_id && !product.sku ? "border-amber-400" : ""}`}>
              <div className="flex gap-2 min-w-0">
                <select
                  className="flex-1 min-w-0 border rounded px-2 py-1.5 text-sm"
                  value={product.catalog_product_id || ""}
                  onChange={(e) => updateProduct(i, "catalog_product_id", e.target.value)}
                  disabled={!localCatalogId}
                >
                  <option value="">{localCatalogId ? t.selectProductOption : t.selectCatalogFirst}</option>
                  {localCatalogProducts.map((cp) => (
                    <option key={cp.id} value={cp.id}>
                      {cp.name} ({cp.sku}) — {cp.unit_price.toFixed(2)}
                    </option>
                  ))}
                </select>
                {products.length > 1 && (
                  <button type="button" onClick={() => removeProduct(i)} className="text-red-400 hover:text-red-600 text-sm px-2">✕</button>
                )}
              </div>

              {product.product2_id && !product.sku && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  {t.noSkuWarning}
                </p>
              )}

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-gray-500">{t.qty}</label>
                  <input type="number" min="1" className={inputCls} value={product.quantity}
                    onChange={(e) => updateProduct(i, "quantity", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">{t.unitPrice(form.tax_locale_type)}</label>
                  <input type="number" step="0.01" className={inputCls} value={product.unit_price}
                    onChange={(e) => updateProduct(i, "unit_price", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">{t.taxRate}</label>
                  <input type="number" step="0.01" min="0" className={inputCls} value={product.tax_rate}
                    onChange={(e) => updateProduct(i, "tax_rate", e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 flex gap-1">{t.tax} <span className="text-gray-400">{t.calculated}</span></label>
                  <div className={`${inputCls} bg-gray-50 text-gray-600`}>{Number(product.tax_amount).toFixed(2)}</div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 flex gap-1">{t.grossUnitPrice} <span className="text-gray-400">{t.calculated}</span></label>
                  <div className={`${inputCls} bg-gray-50 text-gray-600`}>{Number(product.gross_unit_price).toFixed(2)}</div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">{t.discount}</label>
                  <input type="number" step="0.01" min="0" className={inputCls} value={product.discount_amount}
                    onChange={(e) => updateProduct(i, "discount_amount", e.target.value)} />
                </div>
                {form.promotion_name && (
                  <div>
                    <label className="text-xs text-gray-500">{t.discountTax}</label>
                    <input type="number" step="0.01" min="0" className={inputCls} value={product.discount_tax_amount}
                      onChange={(e) => updateProduct(i, "discount_tax_amount", e.target.value)} />
                  </div>
                )}
              </div>

              {/* Delivery Group assignment */}
              {deliveryGroups.length > 1 && (
                <div>
                  <label className="text-xs text-gray-500">{t.selectGroup}</label>
                  <select className={inputCls} value={product.delivery_group_index}
                    onChange={(e) => updateProduct(i, "delivery_group_index", Number(e.target.value))}>
                    {deliveryGroups.map((dg, gi) => {
                      const dm = deliveryMethods.find((d) => d.Id === dg.order_delivery_method_id);
                      return (
                        <option key={gi} value={gi}>
                          Group {gi + 1}{dm ? ` — ${dm.Name}` : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* Optional metadata */}
              <details className="text-xs">
                <summary className="cursor-pointer text-gray-400 hover:text-gray-600">{t.metadataLabel}</summary>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div>
                    <label className="text-xs text-gray-500">{t.l1Category}</label>
                    <input className={inputCls} value={product.l1_category}
                      onChange={(e) => updateProduct(i, "l1_category", e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">{t.l2Category}</label>
                    <input className={inputCls} value={product.l2_category}
                      onChange={(e) => updateProduct(i, "l2_category", e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">{t.color}</label>
                    <input className={inputCls} value={product.variation_color}
                      onChange={(e) => updateProduct(i, "variation_color", e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">{t.size}</label>
                    <input className={inputCls} value={product.variation_size}
                      onChange={(e) => updateProduct(i, "variation_size", e.target.value)} />
                  </div>
                </div>
              </details>
            </div>
          ))}
        </div>

        <button type="button" onClick={addProduct} className="text-sm text-[#00A1E0] hover:underline">
          {t.addProductLine}
        </button>
      </div>

      {/* ── Totals + Submit ──────────────────────────────── */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-1 text-sm">
        <div className="flex justify-between"><span className="text-gray-500">{t.productsTotal}</span><span>{form.currency_iso_code} {productTotal.toFixed(2)}</span></div>
        <div className="flex justify-between"><span className="text-gray-500">{t.taxTotal}</span><span>{form.currency_iso_code} {taxTotal.toFixed(2)}</span></div>
        {discountTotal > 0 && (
          <div className="flex justify-between text-green-600"><span>{t.discountTotal}</span><span>-{form.currency_iso_code} {discountTotal.toFixed(2)}</span></div>
        )}
        <div className="flex justify-between"><span className="text-gray-500">{t.shippingTotal}</span><span>{form.currency_iso_code} {shippingTotal.toFixed(2)}</span></div>
        <div className="flex justify-between font-semibold text-base border-t pt-1 mt-1">
          <span>{t.grandTotal}</span><span>{form.currency_iso_code} {grandTotal.toFixed(2)}</span>
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-[#00A1E0] text-white px-6 py-2.5 rounded font-medium hover:bg-[#0086b3] transition disabled:opacity-50"
      >
        {submitting ? t.creating : t.createOrder}
      </button>
    </form>
  );
}
