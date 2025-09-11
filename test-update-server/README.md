# Test Update Server for RouteVN Creator

This directory contains a test server for testing the auto-update functionality of RouteVN Creator.

## Files Structure

### Core Files
- **`server.js`** - The actual update server that provides update checking and file download endpoints
- **`test-server.js`** - Test script to verify the server is working correctly  
- **`generate-test-versions.sh`** - Script to build test versions (0.1.0 and 0.2.0) for testing updates
- **`package.json`** - Node.js dependencies and scripts

### Generated Directories
- **`updates/`** - Contains the update files (.nsis.zip and .sig files) for version 0.2.0
- **`../test-versions/`** - Contains installer executables for testing (v0.1.0 and v0.2.0)

## Quick Start

1. Run `./generate-test-versions.sh` to generate test packages
2. Run `npm install` to install test update backend dependencies
3. Run `npm start` to start the update server
4. Install version 0.1.0 from `test-versions/v0.1.0/`
5. When the app starts, after about 5 seconds it will show an update dialog for version 0.2.0
6. After confirming, it will auto-update and restart

## Testing the Server

Run `npm test` to verify the server is working correctly. This will test:
- Server health check
- Update availability for version 0.1.0
- No update for version 0.2.0 (already latest)

## Server Endpoints

- `GET /` - Health check
- `GET /check/:target/:arch/:version` - Check for updates
- `GET /download/:filename` - Download update files

## Cleaning Up

To reset and regenerate test files:
```bash
rm -rf updates ../test-versions
./generate-test-versions.sh
```

