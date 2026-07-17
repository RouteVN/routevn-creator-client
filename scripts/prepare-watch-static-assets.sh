#!/bin/bash

set -e

mkdir -p _site
cp -rf static/. _site/

# Vite transforms extensionless files under its root as JavaScript modules.
# Mirror templates into Vite's public directory so their extensionless binary
# files are served directly while preserving the template storage contract.
rm -rf _site/public/templates
mkdir -p _site/public/templates
cp -rf static/templates/. _site/public/templates/
