import React, { useState } from "react";

// ── Placeholder image component ───────────────────────────────────────────────
function HelpImg({ src, alt, caption }) {
  const [loaded, setLoaded] = useState(false);
  const [missing, setMissing] = useState(false);

  if (missing || !src) {
    return (
      <div className="my-3 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center py-8 text-gray-400 text-xs gap-1">
        <span className="text-2xl">📷</span>
        <span>{caption || alt || "Screenshot coming soon"}</span>
      </div>
    );
  }

  return (
    <figure className="my-3">
      {!loaded && (
        <div className="rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center py-8 text-gray-400 text-xs">
          📷 {caption || alt}
        </div>
      )}
      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        onError={() => setMissing(true)}
        className={`rounded-lg border border-gray-200 shadow-sm w-full ${loaded ? "" : "hidden"}`}
      />
      {loaded && caption && (
        <figcaption className="text-[10px] text-gray-400 text-center mt-1">{caption}</figcaption>
      )}
    </figure>
  );
}

// ── Section helpers ───────────────────────────────────────────────────────────
function H2({ children }) {
  return <h2 className="text-base font-bold text-gray-800 mt-6 mb-2 flex items-center gap-2">{children}</h2>;
}
function H3({ children }) {
  return <h3 className="text-sm font-semibold text-gray-700 mt-4 mb-1.5">{children}</h3>;
}
function P({ children }) {
  return <p className="text-xs text-gray-600 leading-relaxed mb-2">{children}</p>;
}
function Note({ children }) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded px-3 py-2 text-xs text-blue-800 my-2 leading-relaxed">
      💡 {children}
    </div>
  );
}
function Warn({ children }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 text-xs text-amber-800 my-2 leading-relaxed">
      ⚠️ {children}
    </div>
  );
}
function Steps({ items }) {
  return (
    <ol className="list-none space-y-1.5 my-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-xs text-gray-600">
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#00A1E0] text-white text-[10px] flex items-center justify-center font-bold">{i + 1}</span>
          <span className="leading-relaxed pt-0.5">{item}</span>
        </li>
      ))}
    </ol>
  );
}
function Code({ children }) {
  return <code className="bg-gray-100 text-gray-700 rounded px-1.5 py-0.5 text-[11px] font-mono">{children}</code>;
}

// ── SECTIONS ──────────────────────────────────────────────────────────────────

const SECTIONS = [
  {
    id: "getting-started",
    label: "Getting Started",
    icon: "🚀",
    content: () => (
      <>
        <H2>🚀 Getting Started</H2>
        <P>SFOM Demo connects directly to your Salesforce org via the SF CLI. No Connected App or OAuth setup required.</P>

        <H3>1. Connect a Salesforce org</H3>
        <P>Open a terminal and run:</P>
        <div className="bg-gray-900 text-green-400 rounded px-3 py-2 font-mono text-xs my-2">
          sf org login web --alias my-org
        </div>
        <P>Your browser opens the SF login page. Authenticate, then return to the app — your org appears in the top-left dropdown.</P>
        <HelpImg src="/help/01-org-selector.png" alt="Org selector" caption="Org selector dropdown with + Add Org button" />

        <H3>2. Select the active org</H3>
        <P>Click the org dropdown at the top left and select the org you want to work with. All API calls go to the selected org.</P>

        <H3>3. Create a Catalog</H3>
        <P>Click the <strong>Catalog</strong> button in the header to open the catalog panel. A catalog groups your products, SKUs, and org references (Location Group, Delivery Methods, etc.) used by all forms.</P>
        <HelpImg src="/help/02-catalog-panel.png" alt="Catalog panel" caption="Catalog panel — create a catalog with products and org references" />
        <Note>You need at least one catalog with products to use the Order, OCI, Delivery Estimate, and eCommerce tabs.</Note>

        <H3>4. (Optional) Configure Delivery Estimate</H3>
        <P>Click the ⚙️ gear icon in the header → <strong>Delivery Estimate</strong> tab. Enter your CDS credentials:</P>
        <Steps items={[
          "Client ID and Client Secret from your CDS connected app",
          "Scope (e.g. SALESFORCE_COMMERCE_API:xxxx sfcc.inventory.availability)",
          "Org Short Code and Region (e.g. us-east-2)",
        ]} />
        <HelpImg src="/help/03-cds-config.png" alt="CDS config" caption="Delivery Estimate credentials in App Config drawer" />

        <H3>5. (Optional) Deploy custom objects</H3>
        <P>TMS and Slot Manager features require custom SF objects. Go to the <strong>Deploy</strong> tab in App Config to push metadata and assign the permission set to your user.</P>
        <HelpImg src="/help/04-deploy.png" alt="Deploy panel" caption="Deploy custom objects and assign permission set" />
      </>
    ),
  },
  {
    id: "order",
    label: "Create Order",
    icon: "📦",
    content: () => (
      <>
        <H2>📦 Create Order Summary</H2>
        <P>Build and submit a complete Salesforce Order Summary via the Order Graph API in a single call.</P>
        <HelpImg src="/help/05-create-order.png" alt="Create Order form" caption="Create Order tab — fill in products, delivery, and payment" />

        <H3>Key fields</H3>
        <Steps items={[
          "Select a Catalog — loads your products into the SKU picker",
          "Add one or more Order Items with quantity and unit price",
          "Choose a Delivery Group type: Ship, Pickup (BOPIS), or Transfer",
          "Fill in Account details (name, email, shipping address)",
          "Click Create Order Summary",
        ]} />

        <H3>Delivery Group types</H3>
        <P><strong>Ship</strong> — standard home delivery. Requires an OrderDeliveryMethod ID.</P>
        <P><strong>Pickup (BOPIS)</strong> — buy online, pick up in store. Requires a Location ExternalReference.</P>
        <P><strong>Transfer</strong> — inter-location transfer. Requires source and destination location references.</P>
        <HelpImg src="/help/06-delivery-group.png" alt="Delivery group options" caption="Delivery group type selector" />

        <H3>OCI Reservation</H3>
        <P>When you create an order, the app optionally creates an OCI reservation before submitting. Enable it with the <strong>Reserve Inventory</strong> toggle. The reservation ID is embedded in the Order Summary graph.</P>
        <Note>The OCI reservation uses the Location Group ExternalReference configured on the catalog, or the specific store ExternalReference for BOPIS.</Note>

        <H3>Reading the result</H3>
        <P>After creation, a floating panel shows the Order Summary ID, status, and the full JSON payload. The <strong>Console</strong> at the bottom logs every API call made during the process.</P>
        <HelpImg src="/help/07-order-result.png" alt="Order result panel" caption="Order result with Order Summary ID and payload preview" />
      </>
    ),
  },
  {
    id: "oci",
    label: "OCI",
    icon: "🏪",
    content: () => (
      <>
        <H2>🏪 OCI — Omnichannel Inventory</H2>
        <P>Four operations available via the radio buttons at the top of the OCI tab.</P>
        <HelpImg src="/help/08-oci-operations.png" alt="OCI operation selector" caption="OCI operation selector: Get Availability, Reserve, Release, Manage Stock" />

        <H3>Get Availability</H3>
        <P>Check inventory levels for one or more SKUs across a Location Group or specific locations.</P>
        <Steps items={[
          "Select a Location Group or enter individual Location ExternalReferences",
          "Add SKUs from your catalog or type them manually",
          "Click Get Availability",
          "Results show availableToFulfill and availableToOrder per SKU",
        ]} />
        <Note>The OCI API limits availability checks to 100 total (SKUs × locations). The app batches requests automatically if you exceed this limit.</Note>
        <HelpImg src="/help/09-oci-availability.png" alt="OCI availability result" caption="Availability result with ATF and ATO per location" />

        <H3>Create Reservation</H3>
        <P>Reserve inventory for one or more SKUs. Requires an Action Request ID (generated automatically or enter your own).</P>
        <Warn>Reservations decrement availableToFulfill immediately. Always release reservations you no longer need.</Warn>

        <H3>Release Reservation</H3>
        <P>Release a previously created reservation using the same Action Request ID.</P>

        <H3>Manage Stock</H3>
        <P>View and edit stock levels directly — Quantity on Hand, Safety Stock, and Futures — across all locations in a Location Group.</P>
        <Steps items={[
          "Select a Location Group — loads all its locations",
          "Select a Catalog — loads all SKUs",
          "The table shows current stock per SKU × Location",
          "Click any cell to edit QoH, Safety Stock, or add Futures",
          "Click Publish Stock to push all changes to OCI in one call",
        ]} />
        <HelpImg src="/help/10-manage-stock.png" alt="Manage Stock table" caption="Manage Stock — pivot table with inline cell editor" />
        <Note>Toggle between SKU × Location and Location × SKU pivot views using the toolbar buttons.</Note>
        <Note>Only modified cells (highlighted in amber) are sent on Publish. Unchanged cells are not touched.</Note>
      </>
    ),
  },
  {
    id: "delivery",
    label: "Delivery Estimate",
    icon: "🚚",
    content: () => (
      <>
        <H2>🚚 Delivery Estimate</H2>
        <P>Query the CDS (Commerce Delivery Service) API for BOPIS pickup times and home delivery date estimates.</P>
        <Warn>Requires CDS credentials configured in App Config → Delivery Estimate tab.</Warn>
        <HelpImg src="/help/11-delivery-estimate.png" alt="Delivery Estimate form" caption="Delivery Estimate form with BOPIS and Home Delivery tabs" />

        <H3>BOPIS — Pickup Estimate</H3>
        <P>Get the earliest pickup time for a SKU at a specific store or across nearby stores.</P>
        <Steps items={[
          "Enter a SKU or select from catalog",
          "Enter a store ExternalReference (fixed store) or a customer address + radius for geo search",
          "Click Get Estimate",
          "Results show earliestPickupTime per location",
        ]} />
        <Note>CDS always returns an earliestPickupTime even when stock is 0. The app checks availableToFulfill and shows "Out of stock" if ATF = 0.</Note>

        <H3>Home Delivery Estimate</H3>
        <P>Get estimated delivery date range for a SKU to a customer address.</P>
        <Steps items={[
          "Enter a SKU or select from catalog",
          "Select a shipping carrier method (configured on the catalog)",
          "Enter the destination address",
          "Click Get Estimate",
          "Results show earliest and latest estimated delivery dates",
        ]} />
        <HelpImg src="/help/12-home-delivery-estimate.png" alt="Home delivery estimate result" caption="Estimated delivery window per shipping method" />
      </>
    ),
  },
  {
    id: "ecom",
    label: "eCommerce Simulation",
    icon: "🛒",
    content: () => (
      <>
        <H2>🛒 eCommerce Simulation</H2>
        <P>A full PLP → PDP → Cart → Checkout flow that exercises OCI, CDS, TMS, and Order Summary creation together.</P>
        <HelpImg src="/help/13-ecom-plp.png" alt="eCommerce PLP" caption="Product Listing Page with inventory badges" />

        <H3>Setup</H3>
        <Steps items={[
          "Select a Catalog in the eCommerce tab",
          "Optionally select a Store for BOPIS (buy online, pick up in store)",
          "Browse products in the PLP",
        ]} />

        <H3>Product Detail Page (PDP)</H3>
        <P>Click a product to open its PDP. You'll see:</P>
        <Steps items={[
          "Live inventory badge (ATF / ATO from OCI PLP cache)",
          "BOPIS section — pickup time at selected store or nearest store",
          "Home Delivery section — estimated delivery per shipping method",
          "For TMS-enabled products: first available delivery slot shown per method",
          "Add to Cart button — disabled until a delivery method is selected (if configured)",
        ]} />
        <HelpImg src="/help/14-ecom-pdp.png" alt="Product detail page" caption="PDP with BOPIS, Home Delivery, and TMS slot" />
        <Note>Products with <strong>Require TMS Booking</strong> flag enabled require a shipping method with an available slot before they can be added to cart.</Note>

        <H3>Cart</H3>
        <P>The cart groups items by delivery type (BOPIS pickup or home delivery per method). For each delivery group you can:</P>
        <Steps items={[
          "Change method — switch to a different shipping carrier (TMS slot searched in background)",
          "Change slot — pick a different TMS delivery time window",
          "Adjust quantities or remove items",
        ]} />
        <HelpImg src="/help/15-ecom-cart.png" alt="Cart view" caption="Cart grouped by delivery type with Change method and Change slot buttons" />
        <Warn>Same product added twice with different delivery methods (e.g. BOPIS + Home Delivery) creates two separate cart lines — this is intentional.</Warn>

        <H3>Checkout</H3>
        <P>Checkout creates the Order Summary with all delivery groups, OCI reservations, and TMS bookings in one operation.</P>
        <HelpImg src="/help/16-ecom-checkout.png" alt="Checkout" caption="Checkout confirmation with order summary ID" />
      </>
    ),
  },
  {
    id: "slot-manager",
    label: "Slot Manager",
    icon: "📅",
    content: () => (
      <>
        <H2>📅 Slot Manager</H2>
        <P>Configure and manage BOPIS pickup time slots for in-store collection. Access via the ⚙️ gear icon → <strong>Slot Manager</strong> tab.</P>
        <HelpImg src="/help/17-slot-manager.png" alt="Slot Manager" caption="Slot Manager config with time grid and booking list" />

        <H3>Setup</H3>
        <Steps items={[
          "Select or create a SlotConfig for a store location",
          "Set slot duration (minutes) and max concurrent slots",
          "Select a date to view availability",
          "Create or cancel bookings manually for testing",
        ]} />

        <Note>Requires the SlotConfig__c and SlotBooking__c custom objects deployed via the Deploy panel.</Note>

        <H3>How it works in eCommerce</H3>
        <P>When a customer selects BOPIS on the PDP, the app queries slot availability for the selected store and date, and presents available time slots. The selected slot is stored in the cart and persisted in <Code>OrderMetadata__c</Code> on the Order Summary.</P>
      </>
    ),
  },
  {
    id: "tms",
    label: "TMS",
    icon: "🚛",
    content: () => (
      <>
        <H2>🚛 TMS — Transport Management</H2>
        <P>Configure delivery time windows for carrier methods and manage bookings. Access via the ⚙️ gear icon → <strong>TMS</strong> tab.</P>
        <HelpImg src="/help/18-tms-config.png" alt="TMS Config" caption="TMS Config with time windows and booking calendar" />

        <H3>Setup</H3>
        <Steps items={[
          "Select a TmsConfig linked to a Shipping Method Reference (must match the ref on your catalog's de_carrier_methods)",
          "Add time windows (start time, end time, max capacity)",
          "Select a date to view slot availability and existing bookings",
          "Use Generate to fill random bookings for demo purposes",
          "Use Clean to clear test bookings",
        ]} />
        <Note>Requires TmsConfig__c, TmsTimeWindow__c, and TmsBooking__c custom objects deployed via the Deploy panel.</Note>

        <H3>How it works in eCommerce</H3>
        <P>For products with <strong>Require TMS Booking</strong> enabled, the PDP automatically finds the first available TMS slot after the estimated delivery date. The slot is shown on the PDP and stored in the cart.</P>
        <Steps items={[
          "PDP computes the estimated delivery max date via CDS",
          "findFirstAvailableTmsSlot scans up to 14 days from that date",
          "Selected slot is stored in cart item as tmsBooking",
          "On checkout, the booking is confirmed and persisted in OrderMetadata__c",
        ]} />
        <HelpImg src="/help/19-tms-slot-picker.png" alt="TMS slot picker" caption="TMS slot picker modal in Cart — Change slot button" />

        <H3>Linking TMS to a Shipping Method</H3>
        <P>The <Code>ShippingMethodRef__c</Code> on a TmsConfig must exactly match the <Code>ref</Code> field of a method in your catalog's <Code>de_carrier_methods</Code> array. This is how the app knows which TMS config to query for each shipping option.</P>
      </>
    ),
  },
  {
    id: "fulfillment",
    label: "Fulfillment",
    icon: "📬",
    content: () => (
      <>
        <H2>📬 Fulfillment</H2>
        <P>View and manage Fulfillment Orders created from Order Summaries.</P>
        <HelpImg src="/help/20-fulfillment.png" alt="Fulfillment panel" caption="Fulfillment Orders list with status and actions" />

        <H3>What you can do</H3>
        <Steps items={[
          "List all Fulfillment Orders for the active org",
          "View line items and fulfillment status",
          "Trigger fulfillment actions (ship, cancel)",
        ]} />
        <Note>Fulfillment Orders are created automatically by SF OMS when an Order Summary is submitted with the appropriate process flow enabled in your org.</Note>
      </>
    ),
  },
  {
    id: "use-cases",
    label: "Use Cases",
    icon: "💾",
    content: () => (
      <>
        <H2>💾 Use Cases</H2>
        <P>Use Cases let you save and restore the state of any form — a quick way to switch between demo scenarios without re-filling everything manually.</P>
        <HelpImg src="/help/23-use-cases.png" alt="Use Cases panel" caption="Use Cases panel — slide out from the left edge of the screen" />

        <H3>Opening the panel</H3>
        <P>Hover over the <strong>USE CASES</strong> strip on the left edge of the screen. The panel slides in and shows all saved use cases for the current tab.</P>
        <Note>Use Cases are tab-specific — cases saved on the OCI tab only appear when you're on the OCI tab, and so on.</Note>

        <H3>Saving a Use Case</H3>
        <Steps items={[
          "Fill in the form on any tab (Order Summary, OCI, Delivery Estimate…)",
          "Open the Use Cases panel",
          "Click Save current — enter a name and confirm",
          "The use case appears in the list immediately",
        ]} />
        <HelpImg src="/help/24-use-case-save.png" alt="Save use case" caption="Save current form state as a named use case" />

        <H3>Restoring a Use Case</H3>
        <Steps items={[
          "Open the Use Cases panel on the relevant tab",
          "Click the use case name or the ▶ Restore button",
          "The form is populated instantly with the saved values",
        ]} />
        <Note>Restoring a use case overwrites the current form state. Unsaved changes are lost.</Note>

        <H3>Updating a Use Case</H3>
        <P>To overwrite an existing use case with the current form state, click the <strong>Update</strong> (↑) button next to it. Useful when you've tweaked a scenario and want to keep the changes.</P>

        <H3>Export &amp; Import</H3>
        <P>Use cases are stored locally in <Code>backend/use_cases.json</Code>. You can share them between machines or teammates:</P>
        <Steps items={[
          "Click Export to download a JSON file with all use cases",
          "On another machine, click Import and select the JSON file",
          "All use cases are merged into the existing list",
        ]} />
        <HelpImg src="/help/25-use-case-export.png" alt="Export/import use cases" caption="Export and Import buttons in the Use Cases panel header" />
        <Warn>The exported JSON may contain Salesforce IDs and org-specific values. Use cases from one org may not work directly on a different org without updating the IDs.</Warn>
      </>
    ),
  },
  {
    id: "console",
    label: "Console & Cache",
    icon: "🔧",
    content: () => (
      <>
        <H2>🔧 Console &amp; Cache</H2>

        <H3>Console (bottom panel)</H3>
        <P>Click <strong>Console</strong> at the bottom of the page to expand the request log. Every API call is logged with method, URL, status, duration, and full request/response body.</P>
        <HelpImg src="/help/21-console.png" alt="Console panel" caption="Console showing request/response log with payload preview" />
        <Steps items={[
          "Click any row to expand the request/response body",
          "Click the 📋 icon on a response to open it in the Preview panel",
          "Use the X button to clear the log",
        ]} />

        <H3>Preview Panel</H3>
        <P>The floating panel on the right shows the last SF API payload in formatted JSON. Useful for inspecting what was sent and received.</P>

        <H3>Cache management</H3>
        <P>Open ⚙️ App Config → <strong>Cache</strong> tab to inspect and manage the backend cache.</P>
        <Steps items={[
          "View all cached entries with their TTL and last-fetched timestamp",
          "Click Refresh on an entry to force a re-fetch from Salesforce",
          "Click Clear All to invalidate the entire cache",
        ]} />
        <HelpImg src="/help/22-cache.png" alt="Cache config" caption="Cache tab showing all cached SF API responses" />
        <Note>The backend caches SF reference data (locations, products, slots) for 5 minutes to reduce API calls. Mutations (create booking, release reservation) automatically invalidate relevant cache entries.</Note>
      </>
    ),
  },
];

// ── Main HelpPanel component ──────────────────────────────────────────────────
export default function HelpPanel({ onClose }) {
  const [activeSection, setActiveSection] = useState("getting-started");
  const section = SECTIONS.find((s) => s.id === activeSection);

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Panel */}
      <div
        className="relative ml-auto w-full max-w-2xl bg-white h-full flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b bg-[#00A1E0]">
          <h1 className="text-white font-semibold text-base">SFOM Demo — Help</h1>
          <button onClick={onClose} className="text-white/80 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <nav className="w-44 flex-shrink-0 border-r bg-gray-50 py-3 overflow-y-auto">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`w-full text-left px-4 py-2 text-xs flex items-center gap-2 transition-colors ${
                  activeSection === s.id
                    ? "bg-[#00A1E0]/10 text-[#00A1E0] font-semibold border-r-2 border-[#00A1E0]"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <span>{s.icon}</span>
                <span>{s.label}</span>
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {section && <section.content />}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-5 py-2 bg-gray-50 text-[10px] text-gray-400 flex items-center justify-between">
          <span>SFOM Demo — Salesforce Order Management sandbox</span>
          <a
            href="https://github.com/ffeix-sfdc/sfom-demo"
            target="_blank"
            rel="noreferrer"
            className="text-[#00A1E0] hover:underline"
          >
            GitHub
          </a>
        </div>
      </div>
    </div>
  );
}
