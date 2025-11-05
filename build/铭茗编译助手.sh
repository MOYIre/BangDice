#!/bin/bash
# BangDice 跨平台打包助手 - Linux x64 编译
# 支持 Linux x64 / Linux ARM64 / Windows x64 / macOS x64
# 使用 npx pkg，无需全局安装

set -e

ROOT_DIR=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$ROOT_DIR"

BUILD_DIR="./build"
mkdir -p "$BUILD_DIR"

echo "检查 Node 环境..."
command -v node >/dev/null 2>&1 || { echo "未安装 Node.js"; exit 1; }

echo "检查 npm..."
command -v npm >/dev/null 2>&1 || { echo "未安装 npm"; exit 1; }

echo "检查 pkg 依赖..."
if [ ! -d "./node_modules/pkg" ]; then
    npm install pkg --save-dev
fi

APP_NAME="BangDice"

echo "御铭茗编译小助手"
echo "🐾快速打包选项🐾"
echo "1) Linux x64"
echo "2) Linux ARM64"
echo "3) Windows x64"
echo "4) macOS x64"
echo "5) 所有以上平台"
printf "请选择 [1-5]: "
read choice

case $choice in
    1) TARGETS=("node18-linux-x64") ;;
    2) TARGETS=("node18-linux-arm64") ;;
    3) TARGETS=("node18-win-x64") ;;
    4) TARGETS=("node18-macos-x64") ;;
    5) TARGETS=("node18-linux-x64" "node18-linux-arm64" "node18-win-x64" "node18-macos-x64") ;;
    *) echo "无效选择"; exit 1 ;;
esac

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
echo "开始打包..."

for target in "${TARGETS[@]}"; do
    output="$BUILD_DIR/${APP_NAME}-${target}-${TIMESTAMP}"
    [[ "$target" == *"win"* ]] && output="${output}.exe"

    npx pkg index.js --targets "$target" --output "$output"
    echo "已打包 -> $output"
done

echo "打包完成辣！文件在 ./build 目录下："
ls -lh "$BUILD_DIR"
