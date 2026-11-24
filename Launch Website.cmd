@echo off
setlocal
set "BUNDLED_PYTHON=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if exist "%BUNDLED_PYTHON%" (
    "%BUNDLED_PYTHON%" -B "%~dp0website.py"
) else (
    where py >nul 2>nul
    if errorlevel 1 (
        python -B "%~dp0website.py"
    ) else (
        py -3 -B "%~dp0website.py"
    )
)
if errorlevel 1 pause
