#!/bin/bash

echo "==================================="
echo "RouteVN Creator Test Version Builder"
echo "==================================="

# Save current directory
ORIGINAL_DIR=$(pwd)
PROJECT_ROOT=$(dirname "$ORIGINAL_DIR")

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to build a specific version
build_version() {
    VERSION=$1
    echo -e "${YELLOW}Building version $VERSION...${NC}"
    
    # Verify CSP configuration before building
    if grep -q "ipc: http://ipc.localhost" ../src-tauri/tauri.conf.json && \
       grep -q "'unsafe-inline'" ../src-tauri/tauri.conf.json; then
        echo -e "${GREEN}✓ CSP configuration verified${NC}"
    else
        echo -e "${RED}✗ Warning: CSP may not be configured correctly${NC}"
        echo "Please check tauri.conf.json for proper CSP settings"
    fi
    
    # Update version in tauri.conf.json
    sed -i.bak "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" ../src-tauri/tauri.conf.json
    
    # Update version in Cargo.toml
    sed -i.bak "s/^version = \".*\"/version = \"$VERSION\"/" ../src-tauri/Cargo.toml
    
    # Set signing key environment variables (keys are in project root)
    if [ -f "$PROJECT_ROOT/keys/updater.key" ]; then
        export TAURI_SIGNING_PRIVATE_KEY=$(cat "$PROJECT_ROOT/keys/updater.key")
        export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
        echo -e "${GREEN}✓ Signing keys configured${NC}"
    else
        echo -e "${YELLOW}⚠ No signing key found at $PROJECT_ROOT/keys/updater.key, updater signatures will be skipped${NC}"
    fi
    
    # Build the application (Windows cross-compile for testing auto-update)
    cd ../src-tauri
    cargo tauri build --target x86_64-pc-windows-gnu
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Version $VERSION built successfully${NC}"
        return 0
    else
        echo -e "${RED}✗ Failed to build version $VERSION${NC}"
        return 1
    fi
}

# Clean up old files to avoid confusion
echo -e "${YELLOW}Cleaning up old build files...${NC}"
rm -rf "$ORIGINAL_DIR/updates"
rm -rf "$ORIGINAL_DIR/../test-versions"
mkdir -p "$ORIGINAL_DIR/updates"
mkdir -p "$ORIGINAL_DIR/../test-versions"

# Step 1: Generate signing keys if not exists (keys should be in project root)
if [ ! -f "$PROJECT_ROOT/keys/updater.key" ]; then
    echo -e "${YELLOW}Generating signing keys...${NC}"
    echo -e "${YELLOW}Note: When prompted for password, press Enter to skip (recommended for testing)${NC}"
    cd "$PROJECT_ROOT"
    cargo tauri signer generate -w keys/updater.key
    
    # Extract public key
    PUBLIC_KEY=$(cat keys/updater.key.pub)
    echo -e "${GREEN}Public key generated:${NC}"
    echo "$PUBLIC_KEY"
    echo ""
    echo "Add this public key to your tauri.conf.json if not already added"
    cd "$ORIGINAL_DIR"
fi

# Step 2: Build version 0.1.0
echo -e "${YELLOW}Preparing version 0.1.0...${NC}"
build_version "0.1.0"

if [ $? -eq 0 ]; then
    # Copy 0.1.0 installer to test-versions
    mkdir -p "$ORIGINAL_DIR/../test-versions/v0.1.0"
    cp "../src-tauri/target/x86_64-pc-windows-gnu/release/bundle/nsis/RouteVN Creator_0.1.0_x64-setup.exe" "$ORIGINAL_DIR/../test-versions/v0.1.0/" 2>/dev/null
    echo -e "${GREEN}✓ Version 0.1.0 copied to test-versions/v0.1.0/${NC}"
    
    # Verify CSP in built Windows executable
    if grep -a "ipc: http://ipc.localhost" ../src-tauri/target/x86_64-pc-windows-gnu/release/app.exe > /dev/null 2>&1; then
        echo -e "${GREEN}✓ CSP correctly embedded in 0.1.0 executable${NC}"
    else
        echo -e "${RED}✗ Warning: CSP may not be correctly embedded in 0.1.0${NC}"
    fi
fi

# Step 3: Build version 0.2.0
echo -e "${YELLOW}Preparing version 0.2.0...${NC}"
build_version "0.2.0"

if [ $? -eq 0 ]; then
    # Copy 0.2.0 update files to test-update-server
    mkdir -p "$ORIGINAL_DIR/updates"
    cp "../src-tauri/target/x86_64-pc-windows-gnu/release/bundle/nsis/RouteVN Creator_0.2.0_x64-setup.nsis.zip" "$ORIGINAL_DIR/updates/" 2>/dev/null
    cp "../src-tauri/target/x86_64-pc-windows-gnu/release/bundle/nsis/RouteVN Creator_0.2.0_x64-setup.nsis.zip.sig" "$ORIGINAL_DIR/updates/" 2>/dev/null
    
    # Also copy installer to test-versions for reference
    mkdir -p "$ORIGINAL_DIR/../test-versions/v0.2.0"
    cp "../src-tauri/target/x86_64-pc-windows-gnu/release/bundle/nsis/RouteVN Creator_0.2.0_x64-setup.exe" "$ORIGINAL_DIR/../test-versions/v0.2.0/" 2>/dev/null
    
    echo -e "${GREEN}✓ Version 0.2.0 update files copied to test-update-server/updates/${NC}"
    echo -e "${GREEN}✓ Version 0.2.0 installer copied to test-versions/v0.2.0/${NC}"
    
    # Verify CSP in built Windows executable
    if grep -a "ipc: http://ipc.localhost" ../src-tauri/target/x86_64-pc-windows-gnu/release/app.exe > /dev/null 2>&1; then
        echo -e "${GREEN}✓ CSP correctly embedded in 0.2.0 executable${NC}"
    else
        echo -e "${RED}✗ Warning: CSP may not be correctly embedded in 0.2.0${NC}"
    fi
fi

# Restore original directory
cd "$ORIGINAL_DIR"

echo ""
echo -e "${GREEN}==================================="
echo "Build Complete!"
echo "===================================${NC}"
echo ""
echo "Important: Both test versions should have proper CSP configuration"
echo "including 'ipc: http://ipc.localhost' and 'unsafe-inline' for styles."
echo ""
echo "Next steps:"
echo "1. Install dependencies: cd test-update-server && npm install"
echo "2. Start the update server: npm start"
echo "3. Install version 0.1.0 from test-versions/v0.1.0/"
echo "4. The app should auto-update to 0.2.0"