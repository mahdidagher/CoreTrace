@echo off
setlocal
set "BUNDLED_PYTHON=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if exist "%BUNDLED_PYTHON%" (
    "%BUNDLED_PYTHON%" -B "%~dp0simulator.py"
) else (
    where py >nul 2>nul
    if errorlevel 1 (
        python -B "%~dp0simulator.py"
    ) else (
        py -3 -B "%~dp0simulator.py"
    )
)
if errorlevel 1 pause
