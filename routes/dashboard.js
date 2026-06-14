const router = require('express').Router();
const { verifyToken } = require('../middleware/auth');
const { getStats }    = require('../controllers/dashboardController');

router.use(verifyToken);

router.get('/stats', getStats);

module.exports = router;
