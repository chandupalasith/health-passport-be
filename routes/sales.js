const router = require('express').Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const { getSales } = require('../controllers/salesController');

router.use(verifyToken);
router.use(requireRole('admin'));

router.get('/', getSales);

module.exports = router;
