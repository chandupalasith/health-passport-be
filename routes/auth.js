const router = require('express').Router();
const { login, logout, me } = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');

// Public
router.post('/login', login);

// Protected
router.post('/logout', verifyToken, logout);
router.get('/me', verifyToken, me);

module.exports = router;
