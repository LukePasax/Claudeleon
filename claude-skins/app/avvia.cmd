@echo off
rem Apre l'app. La prima volta, o dopo un clone nuovo, installa da sola le dipendenze ed Electron:
rem node_modules non sta nel repo.
setlocal
set "APP=%~dp0"
set "ELECTRON=%APP%node_modules\electron\dist\electron.exe"
if exist "%ELECTRON%" goto avvia

echo Prima installazione: scarico le dipendenze ed Electron, ci vuole qualche minuto...
where npm >nul 2>nul || goto senza_node
pushd "%APP%"
call npm install
rem Con npm 11 lo script di Electron a volte non parte: lo si lancia a mano
if not exist "%ELECTRON%" call node node_modules\electron\install.js
popd
if not exist "%ELECTRON%" goto non_riuscito

:avvia
rem Electron parte direttamente, senza lasciare una console aperta
start "" "%ELECTRON%" "%APP%."
exit /b 0

:senza_node
echo Serve Node.js LTS: https://nodejs.org - installalo e riprova.
pause
exit /b 1

:non_riuscito
echo Installazione non riuscita: guarda i messaggi qui sopra.
pause
exit /b 1
