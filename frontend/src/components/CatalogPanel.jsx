import React, { useState, useEffect, useRef, useCallback } from "react";
import api from "../api/client";
import { cachedGet, invalidateCachedGet } from "../api/orgCache";
import { useLang } from "../i18n/LangContext";

function CarrierMethodEditor({ methods, onAdd, onRemove, inputCls }) {
  const [newName, setNewName] = useState("");
  const [newRef, setNewRef] = useState("");
  const add = () => {
    if (!newRef.trim()) return;
    onAdd({ name: newName.trim(), ref: newRef.trim() });
    setNewName(""); setNewRef("");
  };
  return (
    <div className="space-y-1">
      {methods.map((m, i) => (
        <div key={i} className="flex items-center gap-1 text-xs bg-white border rounded px-2 py-1">
          <span className="font-medium text-gray-700 truncate flex-1">{m.name || <span className="text-gray-400 italic">—</span>}</span>
          <span className="text-gray-300 mx-0.5">|</span>
          <span className="text-gray-400 truncate text-[10px] font-mono">{m.ref}</span>
          <button type="button" onClick={() => onRemove(i)} className="text-gray-300 hover:text-red-400 ml-1 shrink-0">✕</button>
        </div>
      ))}
      <div className="flex gap-1">
        <input className={inputCls + " flex-1"} placeholder="Name (display)" value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()} />
        <input className={inputCls + " flex-1"} placeholder="Ref (API)" value={newRef}
          onChange={(e) => setNewRef(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()} />
        <button type="button" onClick={add} disabled={!newRef.trim()}
          className="text-xs bg-gray-100 border rounded px-2 hover:bg-gray-200 disabled:opacity-40 shrink-0">
          + Add
        </button>
      </div>
    </div>
  );
}

function AttrEditor({ attrs, newName, newValue, onChangeName, onChangeValue, onAdd, onRemove, inputCls }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-gray-500">Attributes</p>
      {attrs.map((a, i) => (
        <div key={i} className="flex items-center gap-1 text-xs bg-white border rounded px-2 py-1">
          <span className="font-medium text-gray-600 truncate">{a.name}</span>
          <span className="text-gray-400 mx-0.5">:</span>
          <span className="text-gray-700 flex-1 truncate">{a.value}</span>
          <button type="button" onClick={() => onRemove(i)} className="text-gray-300 hover:text-red-400 ml-1">✕</button>
        </div>
      ))}
      <div className="flex gap-1">
        <input className={inputCls + " flex-1"} placeholder="Name" value={newName}
          onChange={(e) => onChangeName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onAdd()} />
        <input className={inputCls + " flex-1"} placeholder="Value" value={newValue}
          onChange={(e) => onChangeValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onAdd()} />
        <button type="button" onClick={onAdd} disabled={!newName.trim()}
          className="text-xs bg-gray-100 border rounded px-2 hover:bg-gray-200 disabled:opacity-40 shrink-0">
          + Add
        </button>
      </div>
    </div>
  );
}

function LogoEditor({ logo, onChange, inputCls }) {
  const fileRef = useRef(null);

  const readFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => onChange(e.target.result);
    reader.readAsDataURL(file);
  };

  const onPaste = useCallback((e) => {
    const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith("image/"));
    if (item) { e.preventDefault(); readFile(item.getAsFile()); }
  }, []); // eslint-disable-line

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-gray-500">eCom Logo</p>
      {logo ? (
        <div className="flex items-center gap-2">
          <img src={logo} alt="logo" className="h-10 w-auto max-w-[120px] object-contain border rounded bg-white p-0.5" />
          <button type="button" onClick={() => onChange("")}
            className="text-xs text-gray-400 hover:text-red-400">✕ Remove</button>
        </div>
      ) : (
        <div
          onPaste={onPaste}
          onClick={() => fileRef.current?.click()}
          className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded px-3 py-2 cursor-pointer hover:border-[#0070d2] hover:bg-blue-50 transition-colors text-xs text-gray-400"
        >
          <span>📎 Paste or click to upload logo</span>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => readFile(e.target.files?.[0])} />
        </div>
      )}
    </div>
  );
}

export default function CatalogPanel({ activeCatalogId, onSelectCatalog }) {
  const { t } = useLang();
  const [visible, setVisible] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [catalogs, setCatalogs] = useState([]);
  const [openCatalogId, setOpenCatalogId] = useState(null);
  const [products, setProducts] = useState([]);

  // Catalog create/edit
  const [editingCatalog, setEditingCatalog] = useState(null); // null | "new" | {id, name, description}
  const [catalogName, setCatalogName] = useState("");
  const [catalogDesc, setCatalogDesc] = useState("");
  const [catalogLogo, setCatalogLogo] = useState("");
  const [catalogLocationGroupId, setCatalogLocationGroupId] = useState("");
  const [catalogLocationGroupName, setCatalogLocationGroupName] = useState("");
  const [catalogLocationGroupExtRef, setCatalogLocationGroupExtRef] = useState("");
  const [catalogDeSetupName, setCatalogDeSetupName] = useState("");
  const [catalogDeCarrierName, setCatalogDeCarrierName] = useState("");
  const [catalogDeCarrierMethods, setCatalogDeCarrierMethods] = useState([]); // [{name, ref}]
  const [catalogWebstoreId, setCatalogWebstoreId] = useState("");
  const [catalogSalesChannelId, setCatalogSalesChannelId] = useState("");
  const [catalogPaymentGatewayId, setCatalogPaymentGatewayId] = useState("");
  const [catalogPickupDmId, setCatalogPickupDmId] = useState("");
  const [catalogPickupPrice, setCatalogPickupPrice] = useState("0");
  const [catalogPickupTaxRate, setCatalogPickupTaxRate] = useState("5");
  const [catalogTransferDmId, setCatalogTransferDmId] = useState("");
  const [catalogTransferPrice, setCatalogTransferPrice] = useState("0");
  const [catalogTransferTaxRate, setCatalogTransferTaxRate] = useState("5");
  const [catalogStandardDmId, setCatalogStandardDmId] = useState("");
  const [catalogStandardPrice, setCatalogStandardPrice] = useState("0");
  const [catalogStandardTaxRate, setCatalogStandardTaxRate] = useState("5");
  const [catalogDefaultTaxRate, setCatalogDefaultTaxRate] = useState("0");
  const [locationGroups, setLocationGroups] = useState([]);
  const [deSetupNames, setDeSetupNames] = useState([]);
  const [webstores, setWebstores] = useState([]);
  const [salesChannels, setSalesChannels] = useState([]);
  const [deliveryMethods, setDeliveryMethods] = useState([]);
  const [paymentGateways, setPaymentGateways] = useState([]);
  const [confirmDeleteCatalog, setConfirmDeleteCatalog] = useState(null);

  // Product create/edit
  const [editingProduct, setEditingProduct] = useState(null); // null | "new" | {id, name, sku, unit_price}
  const [productName, setProductName] = useState("");
  const [productSku, setProductSku] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productAttrs, setProductAttrs] = useState([]); // [{name, value}]
  const [newAttrName, setNewAttrName] = useState("");
  const [newAttrValue, setNewAttrValue] = useState("");
  const [productCategoryIds, setProductCategoryIds] = useState([]);
  const [productRequireTmsBooking, setProductRequireTmsBooking] = useState(false);
  const [confirmDeleteProduct, setConfirmDeleteProduct] = useState(null);

  // Category state
  const [categories, setCategories] = useState([]);
  const [editingCatId, setEditingCatId] = useState(null); // cat id being renamed, or "new" for top-level, or "new-sub-{id}"
  const [catEditName, setCatEditName] = useState("");
  const [confirmDeleteCat, setConfirmDeleteCat] = useState(null);

  const hideTimer = useRef(null);

  const fetchCatalogs = () =>
    cachedGet("/catalogs").then(setCatalogs).catch(() => {});

  useEffect(() => { fetchCatalogs(); }, []);

  useEffect(() => {
    cachedGet("/oci/location-groups").then(setLocationGroups).catch(() => {});
    cachedGet("/delivery-estimate/setup-names").then(setDeSetupNames).catch(() => {});
    cachedGet("/orders/webstores").then(setWebstores).catch(() => {});
    cachedGet("/orders/saleschannels").then(setSalesChannels).catch(() => {});
    cachedGet("/orders/delivery-methods").then(setDeliveryMethods).catch(() => {});
    cachedGet("/orders/payment-gateways").then(setPaymentGateways).catch(() => {});
  }, []);

  const fetchProducts = (catalogId) =>
    cachedGet(`/catalogs/${catalogId}/products`).then(setProducts).catch(() => {});

  const fetchCategories = (catalogId) =>
    api.get(`/catalogs/${catalogId}/categories`).then((r) => setCategories(r.data)).catch(() => {});

  useEffect(() => {
    if (openCatalogId) {
      fetchProducts(openCatalogId);
      fetchCategories(openCatalogId);
    } else {
      setProducts([]);
      setCategories([]);
    }
  }, [openCatalogId]);

  const showPanel = () => { clearTimeout(hideTimer.current); setVisible(true); };
  const scheduleHide = () => { if (pinned) return; hideTimer.current = setTimeout(() => setVisible(false), 300); };

  // ── Catalog actions ──────────────────────────────────────────────────────────

  const resetCatalogForm = () => {
    setCatalogName("");
    setCatalogDesc("");
    setCatalogLogo("");
    setCatalogLocationGroupId("");
    setCatalogLocationGroupName("");
    setCatalogLocationGroupExtRef("");
    setCatalogDeSetupName("");
    setCatalogDeCarrierName("");
    setCatalogDeCarrierMethods([]);
    setCatalogWebstoreId("");
    setCatalogSalesChannelId("");
    setCatalogPaymentGatewayId("");
    setCatalogPickupDmId("");
    setCatalogPickupPrice("0");
    setCatalogPickupTaxRate("5");
    setCatalogTransferDmId("");
    setCatalogTransferPrice("0");
    setCatalogTransferTaxRate("5");
    setCatalogStandardDmId("");
    setCatalogStandardPrice("0");
    setCatalogStandardTaxRate("5");
    setCatalogDefaultTaxRate("0");
  };

  const startNewCatalog = () => {
    setEditingCatalog("new");
    resetCatalogForm();
  };

  const startEditCatalog = (cat) => {
    setEditingCatalog(cat);
    setCatalogName(cat.name);
    setCatalogDesc(cat.description || "");
    setCatalogLogo(cat.logo || "");
    setCatalogLocationGroupId(cat.location_group_id || "");
    setCatalogLocationGroupName(cat.location_group_name || "");
    setCatalogLocationGroupExtRef(cat.location_group_ext_ref || "");
    setCatalogDeSetupName(cat.de_setup_name || "");
    setCatalogDeCarrierName(cat.de_carrier_name || "");
    setCatalogDeCarrierMethods(Array.isArray(cat.de_carrier_methods) ? cat.de_carrier_methods : []);
    setCatalogWebstoreId(cat.webstore_id || "");
    setCatalogSalesChannelId(cat.sales_channel_id || "");
    setCatalogPaymentGatewayId(cat.payment_gateway_id || "");
    setCatalogPickupDmId(cat.pickup_delivery_method_id || "");
    setCatalogPickupPrice(String(cat.pickup_shipping_unit_price ?? 0));
    setCatalogPickupTaxRate(String(cat.pickup_shipping_tax_rate ?? 5));
    setCatalogTransferDmId(cat.transfer_delivery_method_id || "");
    setCatalogTransferPrice(String(cat.transfer_shipping_unit_price ?? 0));
    setCatalogTransferTaxRate(String(cat.transfer_shipping_tax_rate ?? 5));
    setCatalogStandardDmId(cat.standard_delivery_method_id || "");
    setCatalogStandardPrice(String(cat.standard_shipping_unit_price ?? 0));
    setCatalogStandardTaxRate(String(cat.standard_shipping_tax_rate ?? 5));
    setCatalogDefaultTaxRate(String(cat.default_tax_rate ?? 0));
  };

  const handleLocationGroupChange = (lgId) => {
    const lg = locationGroups.find((g) => g.Id === lgId);
    setCatalogLocationGroupId(lgId);
    setCatalogLocationGroupName(lg ? lg.LocationGroupName : "");
    setCatalogLocationGroupExtRef(lg ? (lg.ExternalReference || "") : "");
  };

  const saveCatalog = async () => {
    if (!catalogName.trim()) return;
    const body = {
      name: catalogName.trim(),
      description: catalogDesc.trim(),
      logo: catalogLogo,
      location_group_id: catalogLocationGroupId,
      location_group_name: catalogLocationGroupName,
      location_group_ext_ref: catalogLocationGroupExtRef,
      de_setup_name: catalogDeSetupName,
      de_carrier_name: catalogDeCarrierName,
      de_carrier_methods: catalogDeCarrierMethods,
      webstore_id: catalogWebstoreId,
      sales_channel_id: catalogSalesChannelId,
      payment_gateway_id: catalogPaymentGatewayId,
      pickup_delivery_method_id: catalogPickupDmId,
      pickup_shipping_unit_price: parseFloat(catalogPickupPrice) || 0,
      pickup_shipping_tax_rate: parseFloat(catalogPickupTaxRate) || 5,
      transfer_delivery_method_id: catalogTransferDmId,
      transfer_shipping_unit_price: parseFloat(catalogTransferPrice) || 0,
      transfer_shipping_tax_rate: parseFloat(catalogTransferTaxRate) || 5,
      standard_delivery_method_id: catalogStandardDmId,
      standard_shipping_unit_price: parseFloat(catalogStandardPrice) || 0,
      standard_shipping_tax_rate: parseFloat(catalogStandardTaxRate) || 5,
      default_tax_rate: parseFloat(catalogDefaultTaxRate) || 0,
    };
    if (editingCatalog === "new") {
      await api.post("/catalogs", body);
    } else {
      await api.put(`/catalogs/${editingCatalog.id}`, body);
    }
    setEditingCatalog(null);
    invalidateCachedGet("/catalogs");
    fetchCatalogs();
    window.dispatchEvent(new CustomEvent("catalog-saved", { detail: { id: editingCatalog === "new" ? null : editingCatalog.id } }));
  };

  const deleteCatalog = async (id) => {
    if (activeCatalogId === id) onSelectCatalog(null, null);
    if (openCatalogId === id) setOpenCatalogId(null);
    await api.delete(`/catalogs/${id}`);
    setConfirmDeleteCatalog(null);
    invalidateCachedGet("/catalogs");
    fetchCatalogs();
  };

  const openCatalog = (id) => {
    setOpenCatalogId(openCatalogId === id ? null : id);
    setEditingProduct(null);
  };

  const selectCatalog = async (cat) => {
    const prods = await cachedGet(`/catalogs/${cat.id}/products`).catch(() => []);
    onSelectCatalog(cat.id, prods);
  };

  // ── Product actions ──────────────────────────────────────────────────────────

  const startNewProduct = () => {
    setEditingProduct("new");
    setProductName("");
    setProductSku("");
    setProductPrice("");
    setProductAttrs([]);
    setProductCategoryIds([]);
    setProductRequireTmsBooking(false);
    setNewAttrName("");
    setNewAttrValue("");
  };

  const startEditProduct = (p) => {
    setEditingProduct(p);
    setProductName(p.name);
    setProductSku(p.sku);
    setProductPrice(String(p.unit_price));
    setProductAttrs(p.attributes || []);
    setProductCategoryIds(p.category_ids || []);
    setProductRequireTmsBooking(p.require_tms_booking || false);
    setNewAttrName("");
    setNewAttrValue("");
  };

  const addAttr = () => {
    if (!newAttrName.trim()) return;
    setProductAttrs((prev) => [...prev, { name: newAttrName.trim(), value: newAttrValue.trim() }]);
    setNewAttrName("");
    setNewAttrValue("");
  };

  const removeAttr = (i) => setProductAttrs((prev) => prev.filter((_, idx) => idx !== i));

  const saveProduct = async () => {
    if (!productName.trim() || !productSku.trim()) return;
    const body = { name: productName.trim(), sku: productSku.trim(), unit_price: parseFloat(productPrice) || 0, attributes: productAttrs, category_ids: productCategoryIds, require_tms_booking: productRequireTmsBooking };
    if (editingProduct === "new") {
      await api.post(`/catalogs/${openCatalogId}/products`, body);
    } else {
      await api.put(`/catalogs/${openCatalogId}/products/${editingProduct.id}`, body);
    }
    setEditingProduct(null);
    invalidateCachedGet(`/catalogs/${openCatalogId}/products`);
    fetchProducts(openCatalogId);
    if (activeCatalogId === openCatalogId) {
      const prods = await cachedGet(`/catalogs/${openCatalogId}/products`).catch(() => []);
      const cat = catalogs.find((c) => c.id === openCatalogId);
      if (cat) onSelectCatalog(openCatalogId, prods);
    }
  };

  const deleteProduct = async (productId) => {
    await api.delete(`/catalogs/${openCatalogId}/products/${productId}`);
    setConfirmDeleteProduct(null);
    invalidateCachedGet(`/catalogs/${openCatalogId}/products`);
    fetchProducts(openCatalogId);
    if (activeCatalogId === openCatalogId) {
      const prods = await cachedGet(`/catalogs/${openCatalogId}/products`).catch(() => []);
      const cat = catalogs.find((c) => c.id === openCatalogId);
      if (cat) onSelectCatalog(openCatalogId, prods);
    }
  };

  // ── Category actions ─────────────────────────────────────────────────────────

  const saveTopLevelCategory = async () => {
    if (!catEditName.trim()) return;
    await api.post(`/catalogs/${openCatalogId}/categories`, { name: catEditName.trim() });
    setEditingCatId(null);
    setCatEditName("");
    fetchCategories(openCatalogId);
  };

  const saveRenameCategory = async (catId) => {
    if (!catEditName.trim()) return;
    await api.put(`/catalogs/${openCatalogId}/categories/${catId}`, { name: catEditName.trim() });
    setEditingCatId(null);
    setCatEditName("");
    fetchCategories(openCatalogId);
  };

  const saveSubcategory = async (parentId) => {
    if (!catEditName.trim()) return;
    await api.post(`/catalogs/${openCatalogId}/categories/${parentId}/subcategories`, { name: catEditName.trim() });
    setEditingCatId(null);
    setCatEditName("");
    fetchCategories(openCatalogId);
  };

  const deleteCategoryItem = async (catId) => {
    await api.delete(`/catalogs/${openCatalogId}/categories/${catId}`);
    setConfirmDeleteCat(null);
    fetchCategories(openCatalogId);
  };

  // Flatten categories into a list for checkboxes: [{id, name, level}]
  const flatCategories = [];
  const flattenCats = (cats, level = 0) => {
    for (const c of cats) {
      flatCategories.push({ id: c.id, name: c.name, level });
      if (c.children?.length) flattenCats(c.children, level + 1);
    }
  };
  flattenCats(categories);

  const toggleProductCategory = (catId) => {
    setProductCategoryIds((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
    );
  };

  const inputCls = "w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#00A1E0]";

  return (
    <>
      {/* Trigger strip — left side, below Use Case strip */}
      <div
        className="fixed z-40"
        style={{ top: "calc(50% + 70px)", left: 0, transform: "translateY(0)" }}
        onMouseEnter={showPanel}
        onMouseLeave={scheduleHide}
      >
        <div
          className={`bg-[#0070d2] text-white flex items-center justify-center cursor-pointer transition-all duration-200 rounded-r-lg shadow-lg ${visible ? "w-2" : "w-6"}`}
          style={{ height: "120px" }}
        >
          {!visible && (
            <span
              className="text-xs font-semibold tracking-widest select-none px-1"
              style={{ writingMode: "vertical-lr" }}
            >
              {t.catalogsTitle}
            </span>
          )}
        </div>
      </div>

      {/* Panel — slides from left */}
      <div
        className={`fixed top-0 left-0 h-full w-[512px] bg-white shadow-2xl border-r flex flex-col transition-transform duration-200 ${visible ? "translate-x-0 z-50" : "-translate-x-full z-30"}`}
        onMouseEnter={showPanel}
        onMouseLeave={scheduleHide}
      >
        {/* Header */}
        <div className="bg-[#0070d2] px-4 py-3 flex items-center justify-between shrink-0">
          <h2 className="text-white font-semibold text-sm">{t.catalogsPanelTitle}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPinned((p) => !p)}
              title={pinned ? "Unpin" : "Pin open"}
              className={`text-sm leading-none transition-colors ${pinned ? "text-white" : "text-white/50 hover:text-white"}`}
            >
              📌
            </button>
            <button
              onClick={() => { setPinned(false); setVisible(false); }}
              className="text-white/70 hover:text-white text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* New catalog form */}
        <div className="border-b p-3 shrink-0">
          {editingCatalog === "new" ? (
            <div className="space-y-2">
              <input
                autoFocus
                className={inputCls}
                placeholder={t.catalogName}
                value={catalogName}
                onChange={(e) => setCatalogName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveCatalog()}
              />
              <textarea
                className={inputCls + " resize-none"}
                placeholder={t.descriptionOptional}
                rows={2}
                value={catalogDesc}
                onChange={(e) => setCatalogDesc(e.target.value)}
              />
              <LogoEditor logo={catalogLogo} onChange={setCatalogLogo} inputCls={inputCls} />
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500">Location Group</p>
                <select className={inputCls} value={catalogLocationGroupId} onChange={(e) => handleLocationGroupChange(e.target.value)}>
                  <option value="">— none —</option>
                  {locationGroups.map((lg) => (
                    <option key={lg.Id} value={lg.Id}>{lg.LocationGroupName}{lg.ExternalReference ? ` (${lg.ExternalReference})` : ""}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500">DE Setup Name (BOPIS)</p>
                <select className={inputCls} value={catalogDeSetupName} onChange={(e) => setCatalogDeSetupName(e.target.value)}>
                  <option value="">— none —</option>
                  {deSetupNames.map((s) => (
                    <option key={s.Id} value={s.ExternalReference || s.Name}>{s.Name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500">DE Carrier Name <span className="text-gray-400 font-normal">(home delivery)</span></p>
                <input className={inputCls} placeholder="e.g. ups" value={catalogDeCarrierName} onChange={(e) => setCatalogDeCarrierName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium text-gray-500">DE Carrier Methods</p>
                <CarrierMethodEditor
                  methods={catalogDeCarrierMethods}
                  onAdd={(m) => setCatalogDeCarrierMethods((prev) => [...prev, m])}
                  onRemove={(i) => setCatalogDeCarrierMethods((prev) => prev.filter((_, idx) => idx !== i))}
                  inputCls={inputCls}
                />
              </div>
              <div className="border-t pt-2 mt-1 space-y-2">
                <p className="text-xs font-semibold text-gray-600">Checkout Defaults</p>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500">Webstore</p>
                  <select className={inputCls} value={catalogWebstoreId} onChange={(e) => setCatalogWebstoreId(e.target.value)}>
                    <option value="">— none —</option>
                    {webstores.map((w) => <option key={w.Id} value={w.Id}>{w.Name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500">Sales Channel</p>
                  <select className={inputCls} value={catalogSalesChannelId} onChange={(e) => setCatalogSalesChannelId(e.target.value)}>
                    <option value="">— none —</option>
                    {salesChannels.map((sc) => <option key={sc.Id} value={sc.Id}>{sc.SalesChannelName}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500">Payment Gateway</p>
                  <select className={inputCls} value={catalogPaymentGatewayId} onChange={(e) => setCatalogPaymentGatewayId(e.target.value)}>
                    <option value="">— none —</option>
                    {paymentGateways.map((pg) => <option key={pg.Id} value={pg.Id}>{pg.PaymentGatewayName || pg.Id}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500">Pickup Delivery Method</p>
                  <select className={inputCls} value={catalogPickupDmId} onChange={(e) => setCatalogPickupDmId(e.target.value)}>
                    <option value="">— none —</option>
                    {deliveryMethods.map((dm) => <option key={dm.Id} value={dm.Id}>{dm.Name}</option>)}
                  </select>
                  <div className="flex gap-1">
                    <input type="number" step="0.01" min="0" className={inputCls} placeholder="Price" value={catalogPickupPrice} onChange={(e) => setCatalogPickupPrice(e.target.value)} />
                    <input type="number" step="0.01" min="0" className={inputCls} placeholder="Tax %" value={catalogPickupTaxRate} onChange={(e) => setCatalogPickupTaxRate(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500">Transfer Delivery Method</p>
                  <select className={inputCls} value={catalogTransferDmId} onChange={(e) => setCatalogTransferDmId(e.target.value)}>
                    <option value="">— none —</option>
                    {deliveryMethods.map((dm) => <option key={dm.Id} value={dm.Id}>{dm.Name}</option>)}
                  </select>
                  <div className="flex gap-1">
                    <input type="number" step="0.01" min="0" className={inputCls} placeholder="Price" value={catalogTransferPrice} onChange={(e) => setCatalogTransferPrice(e.target.value)} />
                    <input type="number" step="0.01" min="0" className={inputCls} placeholder="Tax %" value={catalogTransferTaxRate} onChange={(e) => setCatalogTransferTaxRate(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500">Standard Delivery Method</p>
                  <select className={inputCls} value={catalogStandardDmId} onChange={(e) => setCatalogStandardDmId(e.target.value)}>
                    <option value="">— none —</option>
                    {deliveryMethods.map((dm) => <option key={dm.Id} value={dm.Id}>{dm.Name}</option>)}
                  </select>
                  <div className="flex gap-1">
                    <input type="number" step="0.01" min="0" className={inputCls} placeholder="Price" value={catalogStandardPrice} onChange={(e) => setCatalogStandardPrice(e.target.value)} />
                    <input type="number" step="0.01" min="0" className={inputCls} placeholder="Tax %" value={catalogStandardTaxRate} onChange={(e) => setCatalogStandardTaxRate(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-gray-500">Default Product Tax Rate (%)</p>
                  <input type="number" step="0.01" min="0" className={inputCls} placeholder="0" value={catalogDefaultTaxRate} onChange={(e) => setCatalogDefaultTaxRate(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={saveCatalog}
                  disabled={!catalogName.trim()}
                  className="flex-1 bg-[#0070d2] text-white text-sm rounded py-1.5 hover:bg-[#005fb2] disabled:opacity-40"
                >
                  {t.saveCatalog}
                </button>
                <button
                  onClick={() => setEditingCatalog(null)}
                  className="flex-1 border text-sm rounded py-1.5 hover:bg-gray-50"
                >
                  {t.cancel}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={startNewCatalog}
              className="w-full border border-dashed border-[#0070d2] text-[#0070d2] text-sm rounded py-2 hover:bg-blue-50"
            >
              {t.newCatalog}
            </button>
          )}
        </div>

        {/* Catalog list */}
        <div className="flex-1 overflow-y-auto">
          {catalogs.length === 0 ? (
            <p className="text-gray-400 text-sm text-center mt-8 px-4">{t.noCatalogs}</p>
          ) : (
            <ul className="divide-y">
              {catalogs.map((cat) => {
                const isActive = activeCatalogId === cat.id;
                const isOpen = openCatalogId === cat.id;

                return (
                  <li key={cat.id}>
                    {/* Catalog header row */}
                    {editingCatalog && editingCatalog !== "new" && editingCatalog.id === cat.id ? (
                      <div className="p-3 space-y-2 bg-blue-50">
                        <input
                          autoFocus
                          className={inputCls}
                          value={catalogName}
                          onChange={(e) => setCatalogName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && saveCatalog()}
                        />
                        <input
                          className={inputCls}
                          placeholder="Description"
                          value={catalogDesc}
                          onChange={(e) => setCatalogDesc(e.target.value)}
                        />
                        <LogoEditor logo={catalogLogo} onChange={setCatalogLogo} inputCls={inputCls} />
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-gray-500">Location Group</p>
                          <select className={inputCls} value={catalogLocationGroupId} onChange={(e) => handleLocationGroupChange(e.target.value)}>
                            <option value="">— none —</option>
                            {locationGroups.map((lg) => (
                              <option key={lg.Id} value={lg.Id}>{lg.LocationGroupName}{lg.ExternalReference ? ` (${lg.ExternalReference})` : ""}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-gray-500">DE Setup Name (BOPIS)</p>
                          <select className={inputCls} value={catalogDeSetupName} onChange={(e) => setCatalogDeSetupName(e.target.value)}>
                            <option value="">— none —</option>
                            {deSetupNames.map((s) => (
                              <option key={s.Id} value={s.ExternalReference || s.Name}>{s.Name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-gray-500">DE Carrier Name <span className="text-gray-400 font-normal">(home delivery)</span></p>
                          <input className={inputCls} placeholder="e.g. ups" value={catalogDeCarrierName} onChange={(e) => setCatalogDeCarrierName(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-gray-500">DE Carrier Methods</p>
                          <CarrierMethodEditor
                            methods={catalogDeCarrierMethods}
                            onAdd={(m) => setCatalogDeCarrierMethods((prev) => [...prev, m])}
                            onRemove={(i) => setCatalogDeCarrierMethods((prev) => prev.filter((_, idx) => idx !== i))}
                            inputCls={inputCls}
                          />
                        </div>
                        <div className="border-t pt-2 mt-1 space-y-2">
                          <p className="text-xs font-semibold text-gray-600">Checkout Defaults</p>
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-gray-500">Webstore</p>
                            <select className={inputCls} value={catalogWebstoreId} onChange={(e) => setCatalogWebstoreId(e.target.value)}>
                              <option value="">— none —</option>
                              {webstores.map((w) => <option key={w.Id} value={w.Id}>{w.Name}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-gray-500">Sales Channel</p>
                            <select className={inputCls} value={catalogSalesChannelId} onChange={(e) => setCatalogSalesChannelId(e.target.value)}>
                              <option value="">— none —</option>
                              {salesChannels.map((sc) => <option key={sc.Id} value={sc.Id}>{sc.SalesChannelName}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-gray-500">Payment Gateway</p>
                            <select className={inputCls} value={catalogPaymentGatewayId} onChange={(e) => setCatalogPaymentGatewayId(e.target.value)}>
                              <option value="">— none —</option>
                              {paymentGateways.map((pg) => <option key={pg.Id} value={pg.Id}>{pg.PaymentGatewayName || pg.Id}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-gray-500">Pickup Delivery Method</p>
                            <select className={inputCls} value={catalogPickupDmId} onChange={(e) => setCatalogPickupDmId(e.target.value)}>
                              <option value="">— none —</option>
                              {deliveryMethods.map((dm) => <option key={dm.Id} value={dm.Id}>{dm.Name}</option>)}
                            </select>
                            <div className="flex gap-1">
                              <input type="number" step="0.01" min="0" className={inputCls} placeholder="Price" value={catalogPickupPrice} onChange={(e) => setCatalogPickupPrice(e.target.value)} />
                              <input type="number" step="0.01" min="0" className={inputCls} placeholder="Tax %" value={catalogPickupTaxRate} onChange={(e) => setCatalogPickupTaxRate(e.target.value)} />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-gray-500">Transfer Delivery Method</p>
                            <select className={inputCls} value={catalogTransferDmId} onChange={(e) => setCatalogTransferDmId(e.target.value)}>
                              <option value="">— none —</option>
                              {deliveryMethods.map((dm) => <option key={dm.Id} value={dm.Id}>{dm.Name}</option>)}
                            </select>
                            <div className="flex gap-1">
                              <input type="number" step="0.01" min="0" className={inputCls} placeholder="Price" value={catalogTransferPrice} onChange={(e) => setCatalogTransferPrice(e.target.value)} />
                              <input type="number" step="0.01" min="0" className={inputCls} placeholder="Tax %" value={catalogTransferTaxRate} onChange={(e) => setCatalogTransferTaxRate(e.target.value)} />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-gray-500">Standard Delivery Method</p>
                            <select className={inputCls} value={catalogStandardDmId} onChange={(e) => setCatalogStandardDmId(e.target.value)}>
                              <option value="">— none —</option>
                              {deliveryMethods.map((dm) => <option key={dm.Id} value={dm.Id}>{dm.Name}</option>)}
                            </select>
                            <div className="flex gap-1">
                              <input type="number" step="0.01" min="0" className={inputCls} placeholder="Price" value={catalogStandardPrice} onChange={(e) => setCatalogStandardPrice(e.target.value)} />
                              <input type="number" step="0.01" min="0" className={inputCls} placeholder="Tax %" value={catalogStandardTaxRate} onChange={(e) => setCatalogStandardTaxRate(e.target.value)} />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-gray-500">Default Product Tax Rate (%)</p>
                            <input type="number" step="0.01" min="0" className={inputCls} placeholder="0" value={catalogDefaultTaxRate} onChange={(e) => setCatalogDefaultTaxRate(e.target.value)} />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={saveCatalog} disabled={!catalogName.trim()}
                            className="flex-1 bg-[#0070d2] text-white text-xs rounded py-1.5 disabled:opacity-40">
                            {t.saveCatalog}
                          </button>
                          <button onClick={() => setEditingCatalog(null)}
                            className="flex-1 border text-xs rounded py-1.5 hover:bg-gray-50">
                            {t.cancel}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={`p-3 group hover:bg-gray-50 ${isActive ? "bg-blue-50" : ""}`}>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openCatalog(cat.id)}
                            className="text-gray-400 text-xs w-4 shrink-0"
                          >
                            {isOpen ? "▼" : "▶"}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-gray-800 truncate">{cat.name}</p>
                            {cat.description && (
                              <p className="text-xs text-gray-400 truncate">{cat.description}</p>
                            )}
                            <p className="text-xs text-gray-300">{cat.product_count} product(s)</p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button
                              onClick={() => selectCatalog(cat)}
                              title={t.selectCatalog}
                              className={`text-xs px-2 py-1 rounded ${isActive ? "bg-[#0070d2] text-white" : "bg-gray-100 hover:bg-[#0070d2] hover:text-white text-gray-600"}`}
                            >
                              {isActive ? "✓" : t.selectCatalog}
                            </button>
                            <button
                              onClick={() => startEditCatalog(cat)}
                              className="text-xs text-gray-300 hover:text-[#0070d2] px-1 opacity-0 group-hover:opacity-100 transition-opacity"
                              title={t.editTitle}
                            >
                              ✎
                            </button>
                            {confirmDeleteCatalog === cat.id ? (
                              <>
                                <button onClick={() => deleteCatalog(cat.id)}
                                  className="text-xs bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600">✓</button>
                                <button onClick={() => setConfirmDeleteCatalog(null)}
                                  className="text-xs border px-2 py-1 rounded hover:bg-gray-100">✗</button>
                              </>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteCatalog(cat.id)}
                                className="text-xs text-gray-300 hover:text-red-400 px-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                title={t.deleteTitle}
                              >
                                🗑
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Product list (expanded) */}
                    {isOpen && (
                      <div className="bg-gray-50 border-t px-3 pb-3">
                        <ul className="divide-y divide-gray-100 mt-2">
                          {products.map((p) => (
                            <li key={p.id} className="py-2 group/product">
                              {editingProduct && editingProduct !== "new" && editingProduct.id === p.id ? (
                                <div className="space-y-1.5">
                                  <input className={inputCls} placeholder={t.productName} value={productName}
                                    onChange={(e) => setProductName(e.target.value)} autoFocus />
                                  <input className={inputCls} placeholder={t.productSku} value={productSku}
                                    onChange={(e) => setProductSku(e.target.value)} />
                                  <input type="number" step="0.01" className={inputCls} placeholder={t.productPrice}
                                    value={productPrice} onChange={(e) => setProductPrice(e.target.value)} />
                                  <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                                    <input type="checkbox" className="accent-[#0070d2]"
                                      checked={productRequireTmsBooking}
                                      onChange={(e) => setProductRequireTmsBooking(e.target.checked)} />
                                    Require TMS Booking
                                  </label>
                                  <AttrEditor attrs={productAttrs} newName={newAttrName} newValue={newAttrValue}
                                    onChangeName={setNewAttrName} onChangeValue={setNewAttrValue}
                                    onAdd={addAttr} onRemove={removeAttr} inputCls={inputCls} />
                                  {flatCategories.length > 0 && (
                                    <div className="space-y-1">
                                      <p className="text-xs font-medium text-gray-500">Categories</p>
                                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                                        {flatCategories.map((fc) => (
                                          <label key={fc.id} className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                                            <input type="checkbox" checked={productCategoryIds.includes(fc.id)}
                                              onChange={() => toggleProductCategory(fc.id)} />
                                            <span style={{ paddingLeft: `${fc.level * 10}px` }}>{fc.name}</span>
                                          </label>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  <div className="flex gap-2">
                                    <button onClick={saveProduct}
                                      disabled={!productName.trim() || !productSku.trim()}
                                      className="flex-1 bg-[#0070d2] text-white text-xs rounded py-1 disabled:opacity-40">
                                      {t.saveCatalog}
                                    </button>
                                    <button onClick={() => setEditingProduct(null)}
                                      className="flex-1 border text-xs rounded py-1 hover:bg-gray-50">
                                      {t.cancel}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-700 truncate">{p.name}</p>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      <p className="text-xs text-gray-400">SKU: {p.sku} — {p.unit_price.toFixed(2)}</p>
                                      {p.require_tms_booking && (
                                        <span className="text-[10px] bg-orange-50 text-orange-600 border border-orange-200 rounded px-1.5 py-0.5">TMS</span>
                                      )}
                                    </div>
                                    {p.category_ids?.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {p.category_ids.map((cid) => {
                                          const found = flatCategories.find((fc) => fc.id === cid);
                                          return found ? (
                                            <span key={cid} className="text-[10px] bg-blue-50 text-blue-500 rounded px-1.5 py-0.5">
                                              {found.name}
                                            </span>
                                          ) : null;
                                        })}
                                      </div>
                                    )}
                                    {p.attributes?.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {p.attributes.map((a, i) => (
                                          <span key={i} className="text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">
                                            {a.name}: {a.value}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex gap-1 shrink-0 opacity-0 group-hover/product:opacity-100 transition-opacity">
                                    <button onClick={() => startEditProduct(p)}
                                      className="text-xs text-gray-400 hover:text-[#0070d2] px-1" title={t.editTitle}>✎</button>
                                    {confirmDeleteProduct === p.id ? (
                                      <>
                                        <button onClick={() => deleteProduct(p.id)}
                                          className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded hover:bg-red-600">✓</button>
                                        <button onClick={() => setConfirmDeleteProduct(null)}
                                          className="text-xs border px-1.5 py-0.5 rounded hover:bg-gray-100">✗</button>
                                      </>
                                    ) : (
                                      <button onClick={() => setConfirmDeleteProduct(p.id)}
                                        className="text-xs text-gray-300 hover:text-red-400 px-1" title={t.deleteTitle}>🗑</button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>

                        {/* Add product form */}
                        {editingProduct === "new" ? (
                          <div className="mt-2 space-y-1.5">
                            <input className={inputCls} placeholder={t.productName} value={productName}
                              onChange={(e) => setProductName(e.target.value)} autoFocus />
                            <input className={inputCls} placeholder={t.productSku} value={productSku}
                              onChange={(e) => setProductSku(e.target.value)} />
                            <input type="number" step="0.01" className={inputCls} placeholder={t.productPrice}
                              value={productPrice} onChange={(e) => setProductPrice(e.target.value)} />
                            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                              <input type="checkbox" className="accent-[#0070d2]"
                                checked={productRequireTmsBooking}
                                onChange={(e) => setProductRequireTmsBooking(e.target.checked)} />
                              Require TMS Booking
                            </label>
                            <AttrEditor attrs={productAttrs} newName={newAttrName} newValue={newAttrValue}
                              onChangeName={setNewAttrName} onChangeValue={setNewAttrValue}
                              onAdd={addAttr} onRemove={removeAttr} inputCls={inputCls} />
                            {flatCategories.length > 0 && (
                              <div className="space-y-1">
                                <p className="text-xs font-medium text-gray-500">Categories</p>
                                <div className="flex flex-wrap gap-x-3 gap-y-1">
                                  {flatCategories.map((fc) => (
                                    <label key={fc.id} className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                                      <input type="checkbox" checked={productCategoryIds.includes(fc.id)}
                                        onChange={() => toggleProductCategory(fc.id)} />
                                      <span style={{ paddingLeft: `${fc.level * 10}px` }}>{fc.name}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="flex gap-2">
                              <button onClick={saveProduct}
                                disabled={!productName.trim() || !productSku.trim()}
                                className="flex-1 bg-[#0070d2] text-white text-xs rounded py-1.5 disabled:opacity-40">
                                {t.addProductBtn}
                              </button>
                              <button onClick={() => setEditingProduct(null)}
                                className="flex-1 border text-xs rounded py-1.5 hover:bg-gray-50">
                                {t.cancel}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={startNewProduct}
                            className="mt-2 w-full text-xs text-[#0070d2] border border-dashed border-[#0070d2] rounded py-1.5 hover:bg-blue-50">
                            {t.addProduct}
                          </button>
                        )}

                        {/* Categories section */}
                        <div className="mt-4 border-t pt-3">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Categories</p>
                            {editingCatId !== "new" && (
                              <button onClick={() => { setEditingCatId("new"); setCatEditName(""); }}
                                className="text-xs text-[#0070d2] hover:underline">+ Add</button>
                            )}
                          </div>
                          {editingCatId === "new" && (
                            <div className="flex gap-1 mb-2">
                              <input autoFocus className={inputCls + " flex-1"} placeholder="Category name"
                                value={catEditName} onChange={(e) => setCatEditName(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && saveTopLevelCategory()} />
                              <button onClick={saveTopLevelCategory} disabled={!catEditName.trim()}
                                className="text-xs bg-[#0070d2] text-white px-2 rounded disabled:opacity-40">✓</button>
                              <button onClick={() => setEditingCatId(null)}
                                className="text-xs border px-2 rounded hover:bg-gray-100">✗</button>
                            </div>
                          )}
                          {categories.length === 0 && editingCatId !== "new" && (
                            <p className="text-xs text-gray-400 italic">No categories yet.</p>
                          )}
                          <ul className="space-y-1">
                            {categories.map((cat) => (
                              <li key={cat.id}>
                                <div className="flex items-center gap-1 group/cat">
                                  {editingCatId === cat.id ? (
                                    <>
                                      <input autoFocus className="flex-1 border rounded px-1.5 py-0.5 text-xs"
                                        value={catEditName} onChange={(e) => setCatEditName(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && saveRenameCategory(cat.id)} />
                                      <button onClick={() => saveRenameCategory(cat.id)} disabled={!catEditName.trim()}
                                        className="text-xs bg-[#0070d2] text-white px-1.5 rounded disabled:opacity-40">✓</button>
                                      <button onClick={() => setEditingCatId(null)}
                                        className="text-xs border px-1.5 rounded hover:bg-gray-100">✗</button>
                                    </>
                                  ) : (
                                    <>
                                      <span className="text-xs font-medium text-gray-700 flex-1">{cat.name}</span>
                                      <button onClick={() => { setEditingCatId(`new-sub-${cat.id}`); setCatEditName(""); }}
                                        className="text-[10px] text-gray-400 hover:text-[#0070d2] opacity-0 group-hover/cat:opacity-100 px-1" title="Add subcategory">+sub</button>
                                      <button onClick={() => { setEditingCatId(cat.id); setCatEditName(cat.name); }}
                                        className="text-[10px] text-gray-400 hover:text-[#0070d2] opacity-0 group-hover/cat:opacity-100 px-1" title="Rename">✎</button>
                                      {confirmDeleteCat === cat.id ? (
                                        <>
                                          <button onClick={() => deleteCategoryItem(cat.id)}
                                            className="text-[10px] bg-red-500 text-white px-1.5 rounded">✓</button>
                                          <button onClick={() => setConfirmDeleteCat(null)}
                                            className="text-[10px] border px-1.5 rounded">✗</button>
                                        </>
                                      ) : (
                                        <button onClick={() => setConfirmDeleteCat(cat.id)}
                                          className="text-[10px] text-gray-300 hover:text-red-400 opacity-0 group-hover/cat:opacity-100 px-1">🗑</button>
                                      )}
                                    </>
                                  )}
                                </div>
                                {editingCatId === `new-sub-${cat.id}` && (
                                  <div className="flex gap-1 ml-4 mt-1">
                                    <input autoFocus className="flex-1 border rounded px-1.5 py-0.5 text-xs"
                                      placeholder="Subcategory name" value={catEditName}
                                      onChange={(e) => setCatEditName(e.target.value)}
                                      onKeyDown={(e) => e.key === "Enter" && saveSubcategory(cat.id)} />
                                    <button onClick={() => saveSubcategory(cat.id)} disabled={!catEditName.trim()}
                                      className="text-xs bg-[#0070d2] text-white px-1.5 rounded disabled:opacity-40">✓</button>
                                    <button onClick={() => setEditingCatId(null)}
                                      className="text-xs border px-1.5 rounded hover:bg-gray-100">✗</button>
                                  </div>
                                )}
                                {cat.children?.length > 0 && (
                                  <ul className="ml-4 mt-1 space-y-1">
                                    {cat.children.map((sub) => (
                                      <li key={sub.id} className="flex items-center gap-1 group/sub">
                                        {editingCatId === sub.id ? (
                                          <>
                                            <input autoFocus className="flex-1 border rounded px-1.5 py-0.5 text-xs"
                                              value={catEditName} onChange={(e) => setCatEditName(e.target.value)}
                                              onKeyDown={(e) => e.key === "Enter" && saveRenameCategory(sub.id)} />
                                            <button onClick={() => saveRenameCategory(sub.id)} disabled={!catEditName.trim()}
                                              className="text-xs bg-[#0070d2] text-white px-1.5 rounded disabled:opacity-40">✓</button>
                                            <button onClick={() => setEditingCatId(null)}
                                              className="text-xs border px-1.5 rounded hover:bg-gray-100">✗</button>
                                          </>
                                        ) : (
                                          <>
                                            <span className="text-xs text-gray-500 flex-1">↳ {sub.name}</span>
                                            <button onClick={() => { setEditingCatId(sub.id); setCatEditName(sub.name); }}
                                              className="text-[10px] text-gray-400 hover:text-[#0070d2] opacity-0 group-hover/sub:opacity-100 px-1">✎</button>
                                            {confirmDeleteCat === sub.id ? (
                                              <>
                                                <button onClick={() => deleteCategoryItem(sub.id)}
                                                  className="text-[10px] bg-red-500 text-white px-1.5 rounded">✓</button>
                                                <button onClick={() => setConfirmDeleteCat(null)}
                                                  className="text-[10px] border px-1.5 rounded">✗</button>
                                              </>
                                            ) : (
                                              <button onClick={() => setConfirmDeleteCat(sub.id)}
                                                className="text-[10px] text-gray-300 hover:text-red-400 opacity-0 group-hover/sub:opacity-100 px-1">🗑</button>
                                            )}
                                          </>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
