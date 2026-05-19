# SFOM Demo — Salesforce Order Management Demo App

A local sandbox app to explore and demonstrate **Salesforce Order Management** APIs without the Salesforce UI.  
Authentication uses the **Salesforce CLI** — no Connected App or OAuth setup required.

---

## What it does

| Module | Description |
|---|---|
| **Create Order** | Build and submit Order Summaries via the SF Order Graph API |
| **OCI** | Check availability, create/release reservations, manage stock (QoH, Safety Stock, Futures) |
| **Delivery Estimate** | BOPIS pickup times and home delivery estimates via CDS API |
| **eCommerce Simulation** | Full PLP → PDP → Cart → Checkout flow with BOPIS, Home Delivery, TMS slots |
| **Slot Manager** | Configure and book BOPIS pickup time slots |
| **TMS** | Configure delivery time windows and manage carrier bookings |
| **Fulfillment** | View and manage Fulfillment Orders |

---

## Prerequisites

Before running `install.sh`, make sure you have:

- **macOS** (the launcher uses macOS-specific double-click `.command` files)
- **Homebrew** — [brew.sh](https://brew.sh)  
  If not installed, open Terminal and run:
  ```bash
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  ```
- **Salesforce CLI** connected to at least one org  
  If not installed, `install.sh` will install it automatically.  
  To connect an org after installation:
  ```bash
  sf org login web --alias my-org
  ```

---

## Installation

### Step 1 — Clone the repository

```bash
git clone https://github.com/ffeix-sfdc/sfom-demo.git
cd sfom-demo
```

### Step 2 — Run the installer

```bash
./install.sh
```

This script will:
1. Check for Homebrew, Python 3, Node.js, and Salesforce CLI — installing any that are missing
2. Create a Python virtual environment and install backend dependencies
3. Build the React frontend into the backend (single-process mode)
4. Create the **`SFOM Demo.command`** launcher file

> The installer only needs to be run once, or again after pulling updates.

### Step 3 — Launch the app

Double-click **`SFOM Demo.command`** in Finder, or run from Terminal:

```bash
./"SFOM Demo.command"
```

The app will:
- Verify a Salesforce org is connected
- Start the server on `http://localhost:8000`
- Open your browser automatically

---

## First-time setup in the app

### 1. Select a Salesforce org

The top-left dropdown lists all orgs already connected via the SF CLI.  
Click **+ Add Org**, enter an alias, and authenticate in the browser that opens.

### 2. Configure a Catalog

Go to the **Catalog** panel and create a catalog with your products, SKUs, and the SF org references (Location Group, Delivery Methods, etc.).

### 3. (Optional) Configure Delivery Estimate

If you want to use the CDS Delivery Estimate API, open **App Config → Delivery Estimate** and enter your CDS credentials:
- Client ID and Client Secret
- Scope (e.g. `SALESFORCE_COMMERCE_API:xxxx sfcc.inventory.availability`)
- Org Short Code and Region

### 4. (Optional) Deploy custom objects

The TMS and Slot Manager features require custom Salesforce objects (`TmsConfig__c`, `SlotConfig__c`, etc.).  
Go to **Deploy** to push the metadata to your org and assign the permission set.

---

## Development mode

If you are working on the code, run the frontend and backend separately for hot reload:

```bash
# Terminal 1 — backend with auto-reload
cd backend
source venv/bin/activate
uvicorn main:app --reload

# Terminal 2 — frontend with Vite HMR
cd frontend
npm run dev
```

Frontend → `http://localhost:5173`  
Backend API → `http://localhost:8000`

To rebuild the frontend into the backend (production mode):

```bash
cd frontend && npm run build
```

---

## Project structure

```
sfom-demo/
├── install.sh              # One-time installer
├── SFOM Demo.command       # Double-click launcher (created by install.sh)
├── backend/
│   ├── main.py             # FastAPI app
│   ├── requirements.txt
│   ├── app_state.json      # Active org, order sequence, CDS credentials (gitignored)
│   ├── catalogs/           # Local catalog files (gitignored)
│   ├── routers/            # API route handlers
│   ├── services/           # SF CLI auth, cache, HTTP client
│   └── metadata/           # Salesforce custom object definitions for Deploy
└── frontend/
    ├── src/
    │   ├── components/     # React components
    │   ├── api/            # Axios client + caching helpers
    │   └── i18n/           # EN / FR / ES translations
    └── vite.config.js
```

---

## Notes

- **No secrets in this repo.** `app_state.json` (which stores CDS credentials and the active org alias) is gitignored. The app creates it automatically on first launch from `app_state.example.json`.
- **Single-user only.** This app is designed for local demo use, not multi-tenant or production deployment.
- **SF API version:** v65.0
