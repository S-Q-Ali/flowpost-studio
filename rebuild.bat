@echo off
setlocal
rem One double-click build for both FlowPost Studio desktop artifacts:
rem the portable zip and the per-user setup .exe.
rem
rem The real work lives in scripts\build-desktop.ps1 (same args, same installer
rem script CI uses). This file only wraps it, so the console window stays open
rem after a double-click and the build's exit code still reaches a caller.
rem
rem Extra arguments pass straight through, e.g.
rem     rebuild.bat -Target portable
rem     rebuild.bat -Version 1.2.0 -ConfigFile config/dev.json
rem For a non-stop run call the script itself:
rem     powershell -ExecutionPolicy Bypass -File scripts\build-desktop.ps1

cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-desktop.ps1 %*
set "BUILD=%ERRORLEVEL%"
echo.

if not "%BUILD%"=="0" goto :failed

echo Build OK. Artifacts are in "%~dp0dist-desktop":
echo     FlowPost-portable.zip     extract it and run flowpost.exe, no install
echo     FlowPostNativeSetup.exe   the per-user installer
echo Verify either one against its .sha256 with:
echo     certutil -hashfile dist-desktop\FlowPost-portable.zip SHA256
goto :done

:failed
echo Build failed with exit code %BUILD%. The usual causes:
echo     desktop-flutter\config\prod.json is missing  - copy dev.example.json and fill it in
echo     Flutter has no Windows target                - flutter config --enable-windows-desktop
echo     the C++ build tools or Inno Setup 6 are gone - winget install JRSoftware.InnoSetup
echo     flowpost.exe is still running                - quit it from the tray icon first

:done
pause
exit /b %BUILD%
