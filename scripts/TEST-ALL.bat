@echo off
echo ============================================
echo FlowPost Studio - Complete Test Suite
echo ============================================
echo.

REM Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [FAIL] Node.js not found. Please install Node.js 18+.
    pause
    exit /b 1
)
echo [OK] Node.js found
echo.

REM Check if dist exists
if exist "dist" (
    echo [OK] dist folder exists (previous build)
    del /s /q "dist\*" 2>nul
    echo [INFO] Cleared old build
)
echo.

echo [1/5] Web Build Test...
call npm run build
if errorlevel 1 (
    echo [FAIL] Web build failed
    pause
    exit /b 1
)
echo [OK] Web build successful
echo.

echo [2/5] Type Checking...
npx tsc --noEmit
if errorlevel 1 (
    echo [WARN] TypeScript errors found
) else (
    echo [OK] TypeScript check passed
)
echo.

echo [3/5] ESLint Check...
call npm run lint
echo.

echo [4/5] Checking Required Files...
if exist "src\components\LocalFileUploader.tsx" (
    echo [OK] LocalFileUploader component exists
) else (
    echo [WARN] LocalFileUploader component missing
)

if exist "src\components\GoogleDrivePicker.tsx" (
    echo [OK] GoogleDrivePicker component exists
) else (
    echo [WARN] GoogleDrivePicker component missing
)

if exist "src\components\ContentAutomation.tsx" (
    echo [OK] ContentAutomation component exists
) else (
    echo [WARN] ContentAutomation component missing
)

if exist "src\lib\offline-db.ts" (
    echo [OK] offline-db.ts exists
) else (
    echo [WARN] offline-db.ts missing
)

if exist "src\components\ErrorBoundary.tsx" (
    echo [OK] ErrorBoundary exists
) else (
    echo [WARN] ErrorBoundary missing
)

if exist "supabase\functions\upload-local-file\index.ts" (
    echo [OK] upload-local-file edge function exists
) else (
    echo [WARN] upload-local-file edge function missing
)
echo.

echo [5/5] Desktop Config Check...
if exist "desktop\pake.config.json" (
    echo [OK] Pake config exists
) else (
    echo [FAIL] Pake config missing
)

if exist "desktop\README.md" (
    echo [OK] Desktop README exists
) else (
    echo [WARN] Desktop README missing
)

if exist "scripts\build-desktop.bat" (
    echo [OK] Build script exists
) else (
    echo [WARN] Build script missing
)
echo.

echo ============================================
echo Build Test Complete!
echo ============================================
echo.
echo Next Steps:
echo 1. Deploy edge functions: npx supabase functions deploy upload-local-file
echo 2. Deploy to Vercel: vercel --prod
echo 3. Test locally: npm run preview
echo 4. For desktop build: Install Visual Studio Build Tools
echo.
pause
