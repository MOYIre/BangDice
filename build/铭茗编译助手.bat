@echo off
REM BangDice 跨平台打包助手 - Windows 下使用 Node + pkg

SETLOCAL ENABLEDELAYEDEXPANSION

REM 检查 Node
where node >nul 2>nul
IF %ERRORLEVEL% NEQ 0 (
    echo Node.js 未安装，請先安装 Node.js
    exit /b 1
)

REM 检查 npm
where npm >nul 2>nul
IF %ERRORLEVEL% NEQ 0 (
    echo npm 未安装
    exit /b 1
)

REM 安装 pkg（如果没有）
IF NOT EXIST node_modules\pkg (
    echo 安装 pkg...
    npm install pkg --save-dev
)

REM 创建 build 文件夹
IF NOT EXIST build mkdir build

SET APP_NAME=BangDice

echo 御铭茗打包小助手
echo 1) Windows x64
echo 2) Linux x64
echo 3) Linux ARM64
echo 4) macOS x64
echo 5) 所有以上平台
set /p choice=请选择 [1-5]:

if "%choice%"=="1" set TARGETS=node18-win-x64
if "%choice%"=="2" set TARGETS=node18-linux-x64
if "%choice%"=="3" set TARGETS=node18-linux-arm64
if "%choice%"=="4" set TARGETS=node18-macos-x64
if "%choice%"=="5" (
    set TARGETS=node18-win-x64 node18-linux-x64 node18-linux-arm64 node18-macos-x64
)

REM 时间戳
for /f "tokens=1-4 delims=/:. " %%a in ("%DATE% %TIME%") do (
    set TIMESTAMP=%%d%%b%%c_%%a%%b%%c
)

echo 开始打包...

for %%T in (%TARGETS%) do (
    set OUTPUT=build\%APP_NAME%-%%T-%TIMESTAMP%
    if "%%T"=="node18-win-x64" set OUTPUT=!OUTPUT!.exe

    echo 正在打包 %%T ...
    npx pkg index.js --targets %%T --output "!OUTPUT!"
    echo 已打包 -> !OUTPUT!
)

echo.
echo 打包完成辣！所有文件在 ./build 目录
pause
