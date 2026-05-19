#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "╔══════════════════════════════════════╗"
echo "║        SFOM Demo — Starting          ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Activate Python venv
source "$SCRIPT_DIR/backend/venv/bin/activate"

# Check that at least one SF org is connected
SF_ORGS=$(sf org list --json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); orgs=d.get('result',{}).get('nonScratchOrgs',[])+d.get('result',{}).get('scratchOrgs',[]); print(len(orgs))" 2>/dev/null || echo "0")
if [ "$SF_ORGS" = "0" ]; then
  echo "⚠ No Salesforce org connected."
  echo ""
  echo "  Connect your org first:"
  echo "    sf org login web --alias my-org"
  echo ""
  read -p "Press Enter to exit..."
  exit 1
fi

# Start backend
echo "▶ Starting backend on http://localhost:8000"
cd "$SCRIPT_DIR/backend"
python3 -m uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

# Start frontend dev server
echo "▶ Starting frontend on http://localhost:5173"
cd "$SCRIPT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!

# Open browser after servers are up
(sleep 3 && open "http://localhost:5173") &

echo ""
echo "  Backend  → http://localhost:8000"
echo "  Frontend → http://localhost:5173"
echo ""
echo "  Close this window to stop both servers."
echo ""

# Wait — killing this window kills both processes
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM EXIT
wait $BACKEND_PID $FRONTEND_PID
