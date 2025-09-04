@echo off
setlocal enabledelayedexpansion

:: Get current directory
set CURDIR=%cd%

:: Path to startup folder
for /f "tokens=*" %%i in ('powershell -command "[Environment]::GetFolderPath('Startup')"') do set STARTUP=%%i

:: Create runner bat in project folder
echo @echo off > "%CURDIR%\run-ahk-companion.bat"
echo cd /d "%CURDIR%" >> "%CURDIR%\run-ahk-companion.bat"
echo call npm start >> "%CURDIR%\run-ahk-companion.bat"

:: Create VBS wrapper to run batch hidden
echo Set WshShell = CreateObject("WScript.Shell") > "%CURDIR%\run-ahk-companion.vbs"
echo WshShell.Run chr(34) ^& "%CURDIR%\run-ahk-companion.bat" ^& chr(34), 0 >> "%CURDIR%\run-ahk-companion.vbs"

:: Create a shortcut in startup folder pointing to the VBS
powershell -command "$s=(New-Object -COM WScript.Shell).CreateShortcut('%STARTUP%\AHK Companion.lnk');$s.TargetPath='%CURDIR%\run-ahk-companion.vbs';$s.Save()"

echo Added AHK Companion to startup (hidden)!
pause
