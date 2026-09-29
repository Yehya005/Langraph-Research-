#!/usr/bin/env bash
# One-command launcher (macOS/Linux): installs what is missing, builds the UI, starts the server.
set -e
cd "$(dirname "$0")"

if [ ! -x backend/.venv/bin/python ]; then
  echo "[1/4] Creating Python environment (first run only)..."
  python3 -m venv backend/.venv
  backend/.venv/bin/pip install -q -r backend/requirements.txt
fi

if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  echo "backend/.env created - add your GOOGLE_API_KEY (and KAGGLE_API_TOKEN), then run ./start.sh again."
  exit 1
fi

[ -d frontend/node_modules ] || (echo "[2/4] Installing frontend packages..." && cd frontend && npm install --silent)

echo "[3/4] Building the UI..."
(cd frontend && npm run build --silent)

echo "[4/4] Open http://localhost:8000  (Ctrl+C to stop)"
cd backend && exec .venv/bin/python -m uvicorn app.server:app --port 8000
