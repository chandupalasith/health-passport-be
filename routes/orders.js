const router = require('express').Router();
const { verifyToken } = require('../middleware/auth');
const { createOrder, listOrders, markDelivered } = require('../controllers/orderController');

router.use(verifyToken);

router.post('/',                      createOrder);
router.get('/',                       listOrders);
router.patch('/:orderId/deliver',     markDelivered);

module.exports = router;
