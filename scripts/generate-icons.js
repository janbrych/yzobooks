const fs = require('fs');

// Minimal 1x1 transparent PNG buffer converted to standard base64 PNG
const minimalPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

fs.writeFileSync('./public/icons/icon-192.png', minimalPng);
fs.writeFileSync('./public/icons/icon-512.png', minimalPng);
console.log('PNG placeholder icons written.');
