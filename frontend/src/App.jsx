import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import OrgSelector from "./components/OrgSelector";
import CreateOrderForm from "./components/CreateOrderForm";
import OciForm from "./components/OciForm";
import DeliveryEstimateForm from "./components/DeliveryEstimateForm";
import EcomForm from "./components/EcomForm";
import FulfillmentPanel from "./components/FulfillmentPanel";
import OrderResult from "./components/OrderResult";
import UseCasePanel from "./components/UseCasePanel";
import CatalogPanel from "./components/CatalogPanel";
import ConsolePanel, { useConsoleHeight } from "./components/ConsolePanel";
import PreviewPanel from "./components/PreviewPanel";
import AppConfigDrawer from "./components/AppConfigDrawer";
import HelpPanel from "./components/HelpPanel";
import { useLang } from "./i18n/LangContext";
import { addLog } from "./log/store";
import { setOrgAlias } from "./api/orgCache";

const TABS = [
  { id: "order", labelKey: "tabOrder" },
  { id: "oci", labelKey: "tabOci" },
  { id: "delivery", labelKey: "tabDelivery" },
  { id: "ecom", labelKey: "tabEcom" },
  { id: "fulfillment", labelKey: "tabFulfillment" },
];

export default function App() {
  const { t, lang, setLang } = useLang();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeOrg, setActiveOrg] = useState(null);
  const [activeTab, setActiveTab] = useState("order");
  const [orderResult, setOrderResult] = useState(null);

  // Per-tab form state for UseCasePanel
  const [currentForm, setCurrentForm] = useState(null);
  const [currentProducts, setCurrentProducts] = useState(null);
  const [currentAccount, setCurrentAccount] = useState(null);
  const [pendingRestore, setPendingRestore] = useState(null);

  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleHeight, setConsoleHeight] = useState(useConsoleHeight);
  const [configOpen, setConfigOpen] = useState(false);
  const [configPinned, setConfigPinned] = useState(() => localStorage.getItem("appConfigPinned") === "true");
  const [helpOpen, setHelpOpen] = useState(false);

  const handleTogglePin = () => {
    setConfigPinned((prev) => {
      const next = !prev;
      localStorage.setItem("appConfigPinned", String(next));
      return next;
    });
  };

  // Shared catalog state
  const [activeCatalogId, setActiveCatalogId] = useState(null);
  const [catalogProducts, setCatalogProducts] = useState([]);

  useEffect(() => { setOrgAlias(activeOrg?.alias ?? null); }, [activeOrg]);

  const handleOrderCreated = (result) => setOrderResult(result);
  const handleFormChange = (form, products, account) => {
    setCurrentForm(form);
    setCurrentProducts(products);
    setCurrentAccount(account);
  };
  const handleRestore = (form, products, account) => setPendingRestore({ form, products, account });
  const handleSelectCatalog = (id, products) => {
    setActiveCatalogId(id);
    setCatalogProducts(products || []);
  };

  // Clear result and preview when switching tabs
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setOrderResult(null);
    setCurrentForm(null);
    setCurrentProducts(null);
    setCurrentAccount(null);
    // Clear the preview panel so it doesn't show a stale payload from the previous tab
    addLog({ type: "preview", label: "", body: null });
  };

  useEffect(() => {
    if (searchParams.get("connected")) setSearchParams({});
  }, []);

  return (
    <div className={`min-h-screen transition-[padding] duration-200 ${configPinned ? "pr-[560px]" : ""}`}>
      {/* Header */}
      <header className="bg-[#00A1E0] shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-start">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-8 h-8 rounded overflow-hidden flex items-center justify-center">
              <img src="/omsAppLogo.png" alt="Logo" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-xl font-semibold text-white">{t.appTitle}</h1>
          </div>
          <OrgSelector onOrgChange={setActiveOrg} />
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="ml-2 text-sm border rounded px-1.5 py-1 bg-white text-gray-700"
            title={t.language}
          >
            <option value="en">🇺🇸 EN</option>
            <option value="fr">🇫🇷 FR</option>
            <option value="es">🇪🇸 ES</option>
          </select>
          <button
            onClick={() => { if (!configPinned) setConfigOpen((v) => !v); }}
            className={`ml-2 w-8 h-8 flex items-center justify-center rounded transition-colors text-white ${configPinned ? "bg-yellow-400/30 hover:bg-yellow-400/40" : "bg-white/20 hover:bg-white/30"}`}
            title={configPinned ? "App Config (pinned)" : "App Config"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>
          <button
            onClick={() => setHelpOpen(true)}
            className="ml-2 w-8 h-8 flex items-center justify-center rounded bg-white/20 hover:bg-white/30 transition-colors text-white font-bold text-sm"
            title="Help"
          >
            ?
          </button>
        </div>

        {/* Tab navigation */}
        {activeOrg && (
          <div className="max-w-6xl mx-auto px-6">
            <div className="flex gap-0">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`px-5 py-2 text-sm font-medium transition-colors border-b-2 ${
                    activeTab === tab.id
                      ? "border-white text-white"
                      : "border-transparent text-white/60 hover:text-white/90 hover:border-white/40"
                  }`}
                >
                  {t[tab.labelKey] || tab.id}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Main */}
      <main
        className="max-w-6xl mx-auto px-6 py-8 pl-10"
        style={{ paddingBottom: consoleOpen ? `${consoleHeight + 32}px` : undefined }}
      >
        {!activeOrg ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg">{t.connectPrompt}</p>
          </div>
        ) : activeTab === "fulfillment" ? (
          <FulfillmentPanel key={activeOrg.alias} />
        ) : (
          <div key={activeOrg.alias} className="max-w-2xl space-y-6">
            {activeTab === "order" && (
              <CreateOrderForm
                onOrderCreated={handleOrderCreated}
                onFormChange={handleFormChange}
                pendingRestore={pendingRestore}
                onRestoreDone={() => setPendingRestore(null)}
                activeCatalogId={activeCatalogId}
                onCatalogChange={handleSelectCatalog}
              />
            )}
            {activeTab === "oci" && (
              <OciForm
                onFormChange={handleFormChange}
                pendingRestore={pendingRestore}
                onRestoreDone={() => setPendingRestore(null)}
                activeCatalogId={activeCatalogId}
                onCatalogChange={handleSelectCatalog}
              />
            )}
            {activeTab === "delivery" && (
              <DeliveryEstimateForm
                onFormChange={handleFormChange}
                pendingRestore={pendingRestore}
                onRestoreDone={() => setPendingRestore(null)}
                activeCatalogId={activeCatalogId}
                onCatalogChange={handleSelectCatalog}
              />
            )}
            {activeTab === "ecom" && (
              <EcomForm />
            )}
          </div>
        )}

        {/* Order result — fixed floating panel */}
        {activeOrg && orderResult && (
          <div
            className="fixed z-20"
            style={{
              left: "calc(50% + 144px)",
              right: "max(24px, calc((100vw - 1152px) / 2 + 24px))",
              top: "50%",
              transform: "translateY(-50%)",
              maxHeight: `calc(100vh - ${consoleOpen ? consoleHeight + 32 : 80}px)`,
              overflowY: "auto",
              minWidth: "280px",
            }}
          >
            <OrderResult
              result={orderResult}
              activeOrg={activeOrg}
              onDismiss={() => setOrderResult(null)}
            />
          </div>
        )}
      </main>

      {/* Use Case side panel — tab-aware */}
      {(currentForm || activeTab === "ecom") && (
        <UseCasePanel
          currentForm={currentForm}
          currentProducts={currentProducts}
          currentAccount={currentAccount}
          currentTab={activeTab}
          onRestore={handleRestore}
        />
      )}

      {/* Catalog panel — shared across tabs that use products */}
      {activeOrg && (activeTab === "order" || activeTab === "oci" || activeTab === "delivery" || activeTab === "ecom") && (
        <CatalogPanel
          key={activeOrg?.alias}
          activeCatalogId={activeCatalogId}
          onSelectCatalog={handleSelectCatalog}
        />
      )}

      {/* Console panel */}
      <ConsolePanel onOpenChange={setConsoleOpen} onHeightChange={setConsoleHeight} />

      {/* Preview panel */}
      <PreviewPanel bottomOffset={consoleOpen ? consoleHeight : 0} />

      {/* App Config drawer */}
      <AppConfigDrawer
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        activeOrg={activeOrg}
        pinned={configPinned}
        onTogglePin={handleTogglePin}
      />

      {/* Help panel */}
      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
