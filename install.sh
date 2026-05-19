#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "╔══════════════════════════════════════╗"
echo "║      SFOM Demo — Installation        ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── 1. Check prerequisites ────────────────────────────────────────────────────

echo "▶ Checking prerequisites..."

# Homebrew
if ! command -v brew &>/dev/null; then
  echo ""
  echo "  Homebrew is required but not installed."
  echo "  Install it from https://brew.sh then re-run this script."
  exit 1
fi

# Python 3.10+
if ! command -v python3 &>/dev/null; then
  echo "  Python 3 not found — installing via Homebrew..."
  brew install python3
fi
PY_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
PY_MAJOR=$(python3 -c "import sys; print(sys.version_info.major)")
PY_MINOR=$(python3 -c "import sys; print(sys.version_info.minor)")
if [ "$PY_MAJOR" -lt 3 ] || ([ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 10 ]); then
  echo "  Python 3.10+ required (found $PY_VERSION) — installing via Homebrew..."
  brew install python3
fi
echo "  ✓ Python $(python3 --version | cut -d' ' -f2)"

# Node.js
if ! command -v node &>/dev/null; then
  echo "  Node.js not found — installing via Homebrew..."
  brew install node
fi
echo "  ✓ Node $(node --version)"

# Salesforce CLI
if ! command -v sf &>/dev/null; then
  echo "  Salesforce CLI not found — installing via Homebrew..."
  brew install salesforce-cli
fi
echo "  ✓ Salesforce CLI $(sf --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"

echo ""

# ── 2. Python virtual environment + dependencies ──────────────────────────────

echo "▶ Setting up Python environment..."
cd "$SCRIPT_DIR/backend"

if [ ! -d "venv" ]; then
  python3 -m venv venv
  echo "  ✓ Virtual environment created"
fi

source venv/bin/activate
pip install -q --upgrade pip
pip install -q -r requirements.txt
echo "  ✓ Python dependencies installed"

cd "$SCRIPT_DIR"
echo ""

# ── 3. Frontend build ─────────────────────────────────────────────────────────

echo "▶ Building frontend..."
cd "$SCRIPT_DIR/frontend"

npm install --silent
npm run build

echo "  ✓ Frontend built → backend/static/"
cd "$SCRIPT_DIR"
echo ""

# ── 4. Create launcher ────────────────────────────────────────────────────────

echo "▶ Creating launcher..."

LAUNCHER="$SCRIPT_DIR/SFOM Demo.command"
cat > "$LAUNCHER" << 'LAUNCHER_SCRIPT'
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "╔══════════════════════════════════════╗"
echo "║        SFOM Demo — Starting          ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Activate venv
source "$SCRIPT_DIR/backend/venv/bin/activate"

# Check that at least one SF org is connected
SF_ORGS=$(sf org list --json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); orgs=d.get('result',{}).get('nonScratchOrgs',[])+d.get('result',{}).get('scratchOrgs',[]); print(len(orgs))" 2>/dev/null || echo "0")
if [ "$SF_ORGS" = "0" ]; then
  echo "⚠ No Salesforce org connected."
  echo ""
  echo "  Connect your org first:"
  echo "    sf org login web --alias my-org"
  echo ""
  echo "  Then re-launch SFOM Demo."
  echo ""
  read -p "Press Enter to exit..."
  exit 1
fi

# Start FastAPI
cd "$SCRIPT_DIR/backend"
echo "▶ Starting server on http://localhost:8000"
echo "  (Close this window to stop the app)"
echo ""

# Open browser after a short delay
(sleep 2 && open "http://localhost:8000") &

python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
LAUNCHER_SCRIPT

chmod +x "$LAUNCHER"
echo "  ✓ Launcher created: SFOM Demo.command"
echo ""

# ── Done ──────────────────────────────────────────────────────────────────────

echo "╔══════════════════════════════════════╗"
echo "║         Installation complete!       ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "  Double-click  →  SFOM Demo.command"
echo "  Or run        →  ./\"SFOM Demo.command\""
echo ""
echo "  To connect a Salesforce org:"
echo "    sf org login web --alias my-org"
echo ""
