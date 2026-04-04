// Simple script to help move assets from public to src/assets directory
const fs = require('fs');
const path = require('path');

// Define source and destination directories
const sourceDir = path.join(__dirname, 'public/src/game/characters');
const destDir = path.join(__dirname, 'src/assets/characters');

// Ensure destination directories exist
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
}

// Copy files recursively
function copyFiles(source, dest) {
  ensureDirectoryExists(dest);
  
  const entries = fs.readdirSync(source, { withFileTypes: true });
  
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyFiles(sourcePath, destPath);
    } else {
      fs.copyFileSync(sourcePath, destPath);
      console.log(`Copied: ${sourcePath} → ${destPath}`);
    }
  }
}

// Main function
function moveAssets() {
  console.log('Starting asset migration...');
  
  // Check if source directory exists
  if (!fs.existsSync(sourceDir)) {
    console.error(`Source directory doesn't exist: ${sourceDir}`);
    console.log('Please make sure you have character assets in the public directory first.');
    return;
  }
  
  // Create destination directory and copy files
  try {
    copyFiles(sourceDir, destDir);
    console.log('\nAsset migration completed successfully!');
    console.log('\nNow update your imports to use:');
    console.log('import ModelPath from \'../assets/characters/merc.glb?url\'');
    console.log('instead of hardcoded paths.');
  } catch (error) {
    console.error('Error during migration:', error);
  }
}

// Run the script
moveAssets(); 