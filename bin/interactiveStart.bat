@echo off

set rootPath=%~dp0..

if not exist %rootPath%\node_modules (
    echo Installing dependencies...
    call npm install
)

node %rootPath%\index.js -i
