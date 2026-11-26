@echo off
rem Apre il rotolo: Electron parte direttamente, senza npm nel PATH e senza lasciare una console aperta
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
