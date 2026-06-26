#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ── Helpers ───────────────────────────────────────────────────────────────────

ERRORS=0

ok()   { echo "  ✓ $*"; }
warn() { echo "  ⚠ $*"; }
fail() { echo ""; echo "  ✗ $*"; ERRORS=$((ERRORS + 1)); }

echo "╔══════════════════════════════════════╗"
echo "║      SFOM Demo — Installation        ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── 1. Check prerequisites ────────────────────────────────────────────────────

echo "▶ Checking prerequisites..."

# ── macOS only ────────────────────────────────────────────────────────────────
if [ "$(uname)" != "Darwin" ]; then
  fail "This installer is designed for macOS. Detected: $(uname)"
  echo ""
  echo "  On Linux, install prerequisites manually:"
  echo "    • Python 3.10+  →  https://python.org"
  echo "    • Node.js 18+   →  https://nodejs.org"
  echo "    • Salesforce CLI →  https://developer.salesforce.com/tools/salesforcecli"
  echo ""
  exit 1
fi

# ── Homebrew ──────────────────────────────────────────────────────────────────
if ! command -v brew &>/dev/null; then
  echo ""
  fail "Homebrew is required but not installed."
  echo ""
  echo "  Install it by running this command in Terminal:"
  echo '    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
  echo ""
  echo "  Then re-run:  ./install.sh"
  echo ""
  exit 1
fi
ok "Homebrew $(brew --version | head -1 | awk '{print $2}')"

# ── Python 3.10+ ──────────────────────────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
  warn "Python 3 not found — installing via Homebrew..."
  brew install python@3.12
fi

PY_MAJOR=$(python3 -c "import sys; print(sys.version_info.major)")
PY_MINOR=$(python3 -c "import sys; print(sys.version_info.minor)")
PY_VERSION="$PY_MAJOR.$PY_MINOR"

if [ "$PY_MAJOR" -lt 3 ] || ([ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 10 ]); then
  warn "Python $PY_VERSION found but 3.10+ is required — installing Python 3.12..."
  brew install python@3.12
  # Ensure the new python3 is in PATH for this session
  export PATH="$(brew --prefix python@3.12)/bin:$PATH"
  # Also create a symlink so future shells pick it up
  sudo ln -sf "$(brew --prefix python@3.12)/bin/python3.12" /usr/local/bin/python3 2>/dev/null || true
  PY_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
fi

ok "Python $(python3 --version | cut -d' ' -f2)"

# Verify python3 resolves to the right binary (common pitfall after Homebrew upgrade)
PY_PATH=$(which python3)
if [ "$PY_PATH" = "/usr/bin/python3" ]; then
  warn "python3 resolves to the macOS system Python ($PY_PATH)."
  echo ""
  echo "  This is the built-in Python 3.9 which is too old. Fix it by running:"
  echo "    sudo ln -sf \$(brew --prefix python@3.12)/bin/python3.12 /usr/local/bin/python3"
  echo "    hash -r"
  echo "  Then re-run:  ./install.sh"
  echo ""
  exit 1
fi

# ── Node.js 18+ ───────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  warn "Node.js not found — installing via Homebrew..."
  brew install node
fi

NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))" 2>/dev/null || echo "0")
if [ "$NODE_MAJOR" -lt 18 ]; then
  fail "Node.js 18+ is required (found $(node --version))."
  echo ""
  echo "  Upgrade with:  brew upgrade node"
  echo "  Or use nvm:    nvm install 20 && nvm use 20"
  echo ""
  ERRORS=$((ERRORS + 1))
else
  ok "Node.js $(node --version)"
fi

# ── npm ───────────────────────────────────────────────────────────────────────
if ! command -v npm &>/dev/null; then
  fail "npm not found. It should ship with Node.js."
  echo "  Try:  brew reinstall node"
  ERRORS=$((ERRORS + 1))
else
  ok "npm $(npm --version)"
fi

# ── Salesforce CLI ────────────────────────────────────────────────────────────
if ! command -v sf &>/dev/null; then
  warn "Salesforce CLI not found — installing via Homebrew..."
  brew install salesforce-cli
fi

SF_VERSION=$(sf --version 2>/dev/null | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
SF_MAJOR=$(echo "$SF_VERSION" | cut -d. -f1)
SF_MINOR=$(echo "$SF_VERSION" | cut -d. -f2)

ok "Salesforce CLI $SF_VERSION"

if [ -n "$SF_MAJOR" ] && [ -n "$SF_MINOR" ]; then
  # Warn if < 2.139 (sf org auth show-access-token added in ~2.139)
  if [ "$SF_MAJOR" -lt 2 ] || ([ "$SF_MAJOR" -eq 2 ] && [ "$SF_MINOR" -lt 139 ]); then
    warn "SF CLI $SF_VERSION is older than 2.139 — token refresh may be limited."
    echo "         Upgrade with:  sf update"
    echo "         The app will still work but may prompt for re-authentication more often."
  fi
fi

# ── git ───────────────────────────────────────────────────────────────────────
if ! command -v git &>/dev/null; then
  fail "git is not installed."
  echo ""
  echo "  Install Xcode Command Line Tools:"
  echo "    xcode-select --install"
  echo ""
  ERRORS=$((ERRORS + 1))
else
  ok "git $(git --version | awk '{print $3}')"
fi

# ── Abort if hard failures ────────────────────────────────────────────────────
if [ "$ERRORS" -gt 0 ]; then
  echo ""
  echo "  $ERRORS prerequisite(s) failed. Fix the errors above then re-run:"
  echo "    ./install.sh"
  echo ""
  exit 1
fi

echo ""

# ── 2. Python virtual environment + dependencies ──────────────────────────────

echo "▶ Setting up Python environment..."
cd "$SCRIPT_DIR/backend"

# Recreate venv if it was built with wrong Python version
if [ -d "venv" ]; then
  VENV_PY=$(venv/bin/python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null || echo "0.0")
  VENV_MAJOR=$(echo "$VENV_PY" | cut -d. -f1)
  VENV_MINOR=$(echo "$VENV_PY" | cut -d. -f2)
  if [ "$VENV_MAJOR" -lt 3 ] || ([ "$VENV_MAJOR" -eq 3 ] && [ "$VENV_MINOR" -lt 10 ]); then
    warn "Existing venv uses Python $VENV_PY (too old) — recreating with Python $PY_VERSION..."
    rm -rf venv
  fi
fi

if [ ! -d "venv" ]; then
  python3 -m venv venv
  ok "Virtual environment created (Python $PY_VERSION)"
else
  ok "Virtual environment already exists (Python $VENV_PY)"
fi

source venv/bin/activate

if ! pip install -q --upgrade pip 2>/dev/null; then
  fail "Could not upgrade pip."
  echo "  Try:  python3 -m pip install --upgrade pip"
  exit 1
fi

if ! pip install -q -r requirements.txt; then
  echo ""
  fail "Failed to install Python dependencies."
  echo ""
  echo "  Try manually:"
  echo "    cd backend && source venv/bin/activate && pip install -r requirements.txt"
  echo ""
  exit 1
fi
ok "Python dependencies installed"

cd "$SCRIPT_DIR"
echo ""

# ── 3. Frontend build ─────────────────────────────────────────────────────────

echo "▶ Building frontend..."
cd "$SCRIPT_DIR/frontend"

if ! npm install --silent; then
  echo ""
  fail "npm install failed."
  echo ""
  echo "  Try:"
  echo "    cd frontend && npm install"
  echo "  If you see EACCES errors:"
  echo "    sudo chown -R \$(whoami) ~/.npm"
  echo ""
  exit 1
fi

if ! npm run build; then
  echo ""
  fail "Frontend build failed."
  echo ""
  echo "  Try:"
  echo "    cd frontend && npm run build"
  echo ""
  exit 1
fi

ok "Frontend built → backend/static/"
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

# ── Activate venv ─────────────────────────────────────────────────────────────
if [ ! -f "$SCRIPT_DIR/backend/venv/bin/activate" ]; then
  echo "✗ Python virtual environment not found."
  echo ""
  echo "  Run the installer first:"
  echo "    ./install.sh"
  echo ""
  read -p "Press Enter to exit..."
  exit 1
fi
source "$SCRIPT_DIR/backend/venv/bin/activate"

# ── Check SF CLI ──────────────────────────────────────────────────────────────
if ! command -v sf &>/dev/null; then
  echo "✗ Salesforce CLI (sf) not found."
  echo ""
  echo "  Install it with:"
  echo "    brew install salesforce-cli"
  echo ""
  read -p "Press Enter to exit..."
  exit 1
fi

# ── Check connected orgs ──────────────────────────────────────────────────────
SF_ORGS=$(sf org list --json 2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
orgs = d.get('result', {}).get('nonScratchOrgs', []) + d.get('result', {}).get('scratchOrgs', [])
print(len(orgs))
" 2>/dev/null || echo "0")

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

# ── Check port 8000 availability ─────────────────────────────────────────────
if lsof -ti:8000 &>/dev/null; then
  echo "⚠ Port 8000 is already in use."
  echo ""
  echo "  Another instance may already be running."
  echo "  Open http://localhost:8000 to check, or kill the process:"
  echo "    kill \$(lsof -ti:8000)"
  echo ""
  read -p "Press Enter to exit..."
  exit 1
fi

# ── Start FastAPI ─────────────────────────────────────────────────────────────
cd "$SCRIPT_DIR/backend"
echo "▶ Starting server on http://localhost:8000"
echo "  (Close this window to stop the app)"
echo ""

(sleep 2 && open "http://localhost:8000") &

python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
LAUNCHER_SCRIPT

chmod +x "$LAUNCHER"
ok "Launcher created: SFOM Demo.command"
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
