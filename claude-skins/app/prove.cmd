@echo off
rem Le prove automatiche di Claudeleon: prima la logica (ponte, file, aggiornamento), poi la finestra (la pagina
rem vera con l'API finta, dentro Electron, per ogni tema). Alla fine dice quante sono passate.
setlocal
set "APP=%~dp0"
where npm >nul 2>nul || goto senza_node
pushd "%APP%"
if not exist "node_modules\playwright-core" (
  echo Scarico gli strumenti per le prove...
  call npm install
)
echo === Prove della logica ===
call npm test
set "UNIT=%errorlevel%"
echo.
echo === Prove della finestra ===
call npm run test:ui
set "UI=%errorlevel%"
popd
echo.
if "%UNIT%%UI%"=="00" (echo Tutte le prove sono passate.) else (echo Qualche prova non e' passata: guarda i messaggi qui sopra.)
pause
exit /b 0

:senza_node
echo Serve Node.js LTS: https://nodejs.org - installalo e riprova.
pause
exit /b 1
