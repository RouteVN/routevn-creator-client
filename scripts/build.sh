#!/bin/bash

# Build script for RouteVN Creator Client
# Usage: ./scripts/build.sh [web|tauri]

set -e

BUILD_TYPE=${1:-web}
SETUP_FILE="src/setup.${BUILD_TYPE}.js"
RETTANGOLI_VERSION="0.1.7"
RETTANGOLI_URL="https://cdn.jsdelivr.net/npm/@rettangoli/ui@${RETTANGOLI_VERSION}/dist/rettangoli-iife-ui.min.js"
RETTANGOLI_DIR="static/public/@rettangoli/ui@${RETTANGOLI_VERSION}/dist"
RETTANGOLI_FILE="${RETTANGOLI_DIR}/rettangoli-iife-ui.min.js"

echo "Building for ${BUILD_TYPE}..."

# Download Rettangoli UI if needed
echo "Checking Rettangoli UI..."
if [ ! -f "${RETTANGOLI_FILE}" ]; then
    echo "Downloading Rettangoli UI v${RETTANGOLI_VERSION}..."
    mkdir -p "${RETTANGOLI_DIR}"

    # Download with curl or wget
    if command -v curl >/dev/null 2>&1; then
        curl -L -o "${RETTANGOLI_FILE}" "${RETTANGOLI_URL}"
    elif command -v wget >/dev/null 2>&1; then
        wget -O "${RETTANGOLI_FILE}" "${RETTANGOLI_URL}"
    else
        echo "Error: Neither curl nor wget found. Please install one of them."
        exit 1
    fi

    echo "Rettangoli UI downloaded successfully."
else
    echo "Rettangoli UI v${RETTANGOLI_VERSION} already exists."
fi

# Clean and prepare site directory
rm -rf _site
mkdir -p _site
cp -rf static/* _site/

# Build UI components
echo "Building UI components..."
rtgl ui build-svg

# Build frontend bundle
echo "Building frontend bundle with ${SETUP_FILE}..."
rtgl fe build -s "${SETUP_FILE}"

echo "Build completed for ${BUILD_TYPE}"