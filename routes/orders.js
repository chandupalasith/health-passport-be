const router = require('express').Router();
const { verifyToken } = require('../middleware/auth');
const { createOrder, listOrders } = require('../controllers/orderController');

router.use(verifyToken);

router.post('/', createOrder);
router.get('/', listOrders);

module.exports = router;
