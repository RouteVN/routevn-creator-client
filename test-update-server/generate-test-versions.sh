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
    
    # Update version in tauri.conf.json
    sed -i.bak "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" ../src-tauri/tauri.conf.json
    
    # Update version in Cargo.toml
    sed -i.bak "s/^version = \".*\"/version = \"$VERSION\"/" ../src-tauri/Cargo.toml
    
    # Build the application
    cd ../src-tauri
    cargo tauri build
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Version $VERSION built successfully${NC}"
        return 0
    else
        echo -e "${RED}✗ Failed to build version $VERSION${NC}"
        return 1
    fi
}

# Step 1: Generate signing keys if not exists
if [ ! -f "../src-tauri/keys/updater.key" ]; then
    echo -e "${YELLOW}Generating signing keys...${NC}"
    cd ../src-tauri
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
    cp ../src-tauri/target/release/bundle/nsis/*.exe "$ORIGINAL_DIR/../test-versions/v0.1.0/" 2>/dev/null
    echo -e "${GREEN}✓ Version 0.1.0 copied to test-versions/v0.1.0/${NC}"
fi

# Step 3: Build version 0.2.0
echo -e "${YELLOW}Preparing version 0.2.0...${NC}"
build_version "0.2.0"

if [ $? -eq 0 ]; then
    # Copy 0.2.0 update files to test-update-server
    mkdir -p "$ORIGINAL_DIR/updates"
    cp ../src-tauri/target/release/bundle/nsis/*.nsis.zip "$ORIGINAL_DIR/updates/" 2>/dev/null
    cp ../src-tauri/target/release/bundle/nsis/*.nsis.zip.sig "$ORIGINAL_DIR/updates/" 2>/dev/null
    
    # Also copy installer to test-versions for reference
    mkdir -p "$ORIGINAL_DIR/../test-versions/v0.2.0"
    cp ../src-tauri/target/release/bundle/nsis/*.exe "$ORIGINAL_DIR/../test-versions/v0.2.0/" 2>/dev/null
    
    echo -e "${GREEN}✓ Version 0.2.0 update files copied to test-update-server/updates/${NC}"
    echo -e "${GREEN}✓ Version 0.2.0 installer copied to test-versions/v0.2.0/${NC}"
fi

# Restore original directory
cd "$ORIGINAL_DIR"

echo ""
echo -e "${GREEN}==================================="
echo "Build Complete!"
echo "===================================${NC}"
echo ""
echo "Next steps:"
echo "1. Install dependencies: cd test-update-server && npm install"
echo "2. Start the update server: npm start"
echo "3. Install version 0.1.0 from test-versions/v0.1.0/"
echo "4. The app should auto-update to 0.2.0"