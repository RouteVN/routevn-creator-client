import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3333;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'Update server is running',
    version: '1.0.0',
    endpoints: [
      '/check/:target/:arch/:version'
    ]
  });
});

// Update check endpoint
app.get('/check/:target/:arch/:version', (req, res) => {
  const { target, arch, version } = req.params;
  
  console.log(`\n[${new Date().toLocaleTimeString()}] Update check received:`);
  console.log(`  Target: ${target}`);
  console.log(`  Architecture: ${arch}`);
  console.log(`  Current version: ${version}`);
  
  // Check if update is available (0.1.0 -> 0.2.0)
  if (version === '0.1.0') {
    const sigPath = path.join(__dirname, 'updates', 'RouteVN Creator_0.2.0_x64-setup.nsis.zip.sig');
    const zipPath = path.join(__dirname, 'updates', 'RouteVN Creator_0.2.0_x64-setup.nsis.zip');
    
    // Check if required files exist
    if (!fs.existsSync(sigPath)) {
      console.error(`  ✗ Signature file not found: ${sigPath}`);
      res.status(500).json({ error: 'Signature file not found' });
      return;
    }
    
    if (!fs.existsSync(zipPath)) {
      console.error(`  ✗ Update file not found: ${zipPath}`);
      res.status(500).json({ error: 'Update file not found' });
      return;
    }
    
    const updateInfo = {
      version: 'v0.2.0',
      notes: 'Test update from 0.1.0 to 0.2.0\n\n- Added auto-update functionality\n- Improved UI\n- Bug fixes',
      pub_date: new Date().toISOString(),
      platforms: {
        'windows-x86_64': {
          signature: fs.readFileSync(sigPath, 'utf-8').trim(),
          url: `http://localhost:${PORT}/download/RouteVN Creator_0.2.0_x64-setup.nsis.zip`
        }
      }
    };
    
    console.log(`  ✓ Update available: 0.2.0`);
    console.log(`  Update URL: ${updateInfo.platforms['windows-x86_64'].url}`);
    console.log(`  Signature length: ${updateInfo.platforms['windows-x86_64'].signature.length} chars`);
    res.json(updateInfo);
  } else {
    console.log(`  → No update available for version ${version}`);
    res.status(204).send();
  }
});

// Download endpoint
app.get('/download/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, 'updates', filename);
  
  console.log(`[${new Date().toLocaleTimeString()}] Download requested: ${filename}`);
  console.log(`  File path: ${filePath}`);
  console.log(`  File exists: ${fs.existsSync(filePath)}`);
  
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    console.log(`  File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Starting download...`);
    
    res.download(filePath, (err) => {
      if (err) {
        console.error(`  Download failed:`, err);
      } else {
        console.log(`  ✓ Download completed successfully`);
      }
    });
  } else {
    console.error(`  ✗ File not found: ${filePath}`);
    res.status(404).json({ error: 'File not found' });
  }
});

app.listen(PORT, () => {
  console.log(`Update server running at http://localhost:${PORT}`);
  console.log(`Place update files in: ${path.join(__dirname, 'updates')}`);
});