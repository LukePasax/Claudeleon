@echo off
rem Crea l'installer di Claudeleon per Windows: dist\Claudeleon Setup <versione>.exe
rem La prima volta scarica gli strumenti (electron-builder); poi impacchetta l'app con la sua icona.
setlocal
set "APP=%~dp0"
where npm >nul 2>nul || goto senza_node
pushd "%APP%"
if not exist "node_modules\electron-builder" (
  echo Scarico gli strumenti per l'installer, ci vuole qualche minuto...
  call npm install
)
echo Creo l'installer...
call npm run dist
if errorlevel 1 goto errore
popd
echo.
echo Fatto: l'installer e' nella cartella dist.
explorer "%APP%dist"
exit /b 0

:senza_node
echo Serve Node.js LTS: https://nodejs.org - installalo e riprova.
pause
exit /b 1

:errore
popd
echo Creazione non riuscita: guarda i messaggi qui sopra.
pause
exit /b 1
