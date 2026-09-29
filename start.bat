@echo off
REM One-click launcher: installs what is missing, builds the UI, starts the server, opens the browser.
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8

if not exist "backend\.venv\Scripts\python.exe" (
    echo [1/4] Creating Python environment and installing packages ^(first run only^)...
    python -m venv backend\.venv || goto :error
    backend\.venv\Scripts\python -m pip install -q -r backend\requirements.txt || goto :error
) else (
    echo [1/4] Python environment OK
)

if not exist "backend\.env" (
    copy backend\.env.example backend\.env >nul
    echo.
    echo   backend\.env was created. Put your GOOGLE_API_KEY ^(and KAGGLE_API_TOKEN^) in it,
    echo   save, close Notepad, and the launcher will continue.
    notepad backend\.env
)

if not exist "frontend\node_modules" (
    echo [2/4] Installing frontend packages ^(first run only^)...
    pushd frontend && call npm install --silent && popd || goto :error
) else (
    echo [2/4] Frontend packages OK
)

echo [3/4] Building the UI...
pushd frontend && call npm run build --silent && popd || goto :error

echo [4/4] Starting server at http://localhost:8000  ^(close this window or press Ctrl+C to stop^)
start "" cmd /c "timeout /t 5 >nul & start http://localhost:8000"
cd backend
.venv\Scripts\python -m uvicorn app.server:app --port 8000
goto :eof

:error
echo.
echo Something failed - see the messages above.
pause
