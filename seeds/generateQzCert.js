/**
 * One-time setup: generates an RSA key pair and self-signed X.509 certificate
 * for QZ Tray silent printing.
 *
 * Usage:  node seeds/generateQzCert.js
 *
 * Outputs:
 *   backend/certs/qz-private-key.pem   — keep on server, NEVER commit
 *   backend/certs/qz-certificate.txt   — copy to QZ Tray trusted folder on each PC
 *                                        also copy to frontend/public/qz-certificate.txt
 */

const selfsigned = require('selfsigned');
const fs         = require('fs');
const path       = require('path');

const certsDir = path.join(__dirname, '../certs');
if (!fs.existsSync(certsDir)) fs.mkdirSync(certsDir);

console.log('Generating RSA-2048 key pair + self-signed certificate (SHA-512)…');

(async () => {

const pems = await selfsigned.generate(
  [{ name: 'commonName', value: 'HealthPassport' }],
  { keySize: 2048, days: 3650, algorithm: 'sha512' },
);

fs.writeFileSync(path.join(certsDir, 'qz-private-key.pem'), pems.private);
fs.writeFileSync(path.join(certsDir, 'qz-certificate.txt'), pems.cert);

console.log('\n✓ Files written:');
console.log('  backend/certs/qz-private-key.pem  ← stays on the server, never commit');
console.log('  backend/certs/qz-certificate.txt  ← public, safe to commit\n');

console.log('Next steps:');
console.log('  1. Copy qz-certificate.txt  →  frontend/public/qz-certificate.txt');
console.log('  2. On each Windows PC running QZ Tray, copy qz-certificate.txt to:');
console.log('       C:\\Users\\<Username>\\.qz\\security\\digital-certificate.txt');
console.log('  3. Restart QZ Tray on that PC');
console.log('  4. Restart the backend server\n');
})();
