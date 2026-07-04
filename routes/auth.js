const router   = require('express').Router();
const { createSign } = require('crypto');
const fs        = require('fs');
const path      = require('path');
const { login, logout, me } = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');

// Public
router.post('/login', login);

// Protected
router.post('/logout', verifyToken, logout);
router.get('/me',     verifyToken, me);

// QZ Tray request signing — signs the handshake token so QZ Tray trusts this site permanently
router.post('/sign-qz', verifyToken, (req, res) => {
  try {
    const { request } = req.body;
    const keyPath = path.join(__dirname, '../certs/qz-private-key.pem');

    if (!fs.existsSync(keyPath)) {
      return res.status(503).json({ message: 'QZ signing key not found. Run: node seeds/generateQzCert.js' });
    }

    const privateKey = fs.readFileSync(keyPath, 'utf8');
    const sign = createSign('SHA512');
    sign.update(request);
    const signature = sign.sign(privateKey, 'base64');

    return res.json({ signature });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to sign QZ request.' });
  }
});

module.exports = router;
