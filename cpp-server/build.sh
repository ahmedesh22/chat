#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# build.sh – Compile the Lumina C++ WebSocket server
#
# What it does:
#   1. Downloads httplib.h (cpp-httplib) if not already present
#   2. Downloads nlohmann/json.hpp if not already present
#   3. Compiles main.cpp into ./lumina-server binary
#
# Requirements:
#   - macOS with Xcode Command Line Tools  (xcode-select --install)
#   - curl  (pre-installed on macOS)
# ─────────────────────────────────────────────────────────────────────────────

set -e  # Exit immediately on error

# Move into the cpp-server directory (works even if called from project root)
cd "$(dirname "$0")"

echo "=== Lumina C++ Build Script ==="

# ── Step 1: Download httplib.h ─────────────────────────────────────────────
HTTPLIB_URL="https://raw.githubusercontent.com/yhirose/cpp-httplib/master/httplib.h"
if [ ! -f "httplib.h" ]; then
    echo "[1/3] Downloading httplib.h..."
    curl -sSL "$HTTPLIB_URL" -o httplib.h
    echo "      httplib.h downloaded."
else
    echo "[1/3] httplib.h already present, skipping download."
fi

# ── Step 2: Download nlohmann/json.hpp ────────────────────────────────────
JSON_URL="https://raw.githubusercontent.com/nlohmann/json/develop/single_include/nlohmann/json.hpp"
if [ ! -f "nlohmann/json.hpp" ]; then
    echo "[2/3] Downloading nlohmann/json.hpp..."
    mkdir -p nlohmann
    curl -sSL "$JSON_URL" -o nlohmann/json.hpp
    echo "      nlohmann/json.hpp downloaded."
else
    echo "[2/3] nlohmann/json.hpp already present, skipping download."
fi

# ── Step 3: Compile ────────────────────────────────────────────────────────
echo "[3/3] Compiling main.cpp..."
clang++ \
    -std=c++17 \
    -O2 \
    -pthread \
    -Wall \
    -Wextra \
    -o lumina-server \
    main.cpp

echo ""
echo "=== Build successful! ==="
echo "    Binary: $(pwd)/lumina-server"
echo "    Run:    ./lumina-server"
