#!/usr/bin/env node

// Build setup script to select the correct setup file based on platform
import { copyFileSync } from 'fs';
import { resolve } from 'path';

const platform = process.argv[2] || 'web';
const srcPath = resolve(`src/setup.${platform}.js`);
const destPath = resolve('src/setup.js');

console.log(`Setting up build for platform: ${platform}`);
console.log(`Copying ${srcPath} to ${destPath}`);

try {
  copyFileSync(srcPath, destPath);
  console.log('Setup file configured successfully');
} catch (error) {
  console.error('Error copying setup file:', error);
  process.exit(1);
}