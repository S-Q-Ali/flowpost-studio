@echo off
echo ============================================
echo FlowPost Desktop Build Script
echo ============================================
echo.

REM Check for Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo [1/5] Checking dependencies...
if not exist "node_modules" (
    echo ERROR: Dependencies not installed. Run 'npm install' first.
    pause
    exit /b 1
)
echo [OK] Dependencies found

echo.
echo [2/5] Building web app...
call npm run build
if errorlevel 1 (
    echo ERROR: Web build failed
    pause
    exit /b 1
)
echo [OK] Web build complete

echo.
echo [3/5] Checking for Pake CLI...
where pake >nul 2>&1
if errorlevel 1 (
    echo Installing Pake CLI...
    call npm install -g pake-cli
    if errorlevel 1 (
        echo ERROR: Failed to install Pake CLI
        pause
        exit /b 1
    )
)
echo [OK] Pake CLI found

echo.
echo [4/5] Checking for icon file...
if not exist "public\icon.ico" (
    echo WARNING: Icon file not found at public\icon.ico
    echo Using default icon. Please add a 256x256 icon for better appearance.
)
echo [OK] Icon check complete

echo.
echo [5/5] Building desktop app with Pake...
call pake build --config desktop\pake.config.json
if errorlevel 1 (
    echo ERROR: Desktop build failed
    pause
    exit /b 1
)
echo [OK] Desktop build complete

echo.
echo ============================================
echo Desktop app built successfully!
echo Output location: dist-desktop\
echo ============================================
echo.
pause
