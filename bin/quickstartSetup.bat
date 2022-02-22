@echo off

set rootPath=%~dp0..

if not exist %rootPath%\node_modules\package-lock.json (
    echo Installing dependencies...
    call npm install
)

node %rootPath%\index.js -s
pause