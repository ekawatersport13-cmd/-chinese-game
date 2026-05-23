const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

const zip = new AdmZip();
const distDir = 'dist';

function addDir(dir, zipPath) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const entryPath = zipPath ? zipPath + '/' + item : item;
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      addDir(fullPath, entryPath);
    } else {
      zip.addLocalFile(fullPath, zipPath ? zipPath.replace(/\\/g, '/') : '', item);
    }
  }
}

addDir(distDir, '');
zip.writeZip('hanzi-puzzle-dist.zip');

// verify
const z2 = new AdmZip('hanzi-puzzle-dist.zip');
for (const entry of z2.getEntries()) {
  console.log(entry.entryName + ': ' + entry.header.size + ' bytes');
}
