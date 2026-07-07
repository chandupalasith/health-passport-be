const router = require('express').Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const { createOrder, listOrders, markDelivered, deliverTestType, cancelOrder } = require('../controllers/orderController');

router.use(verifyToken);

router.post('/',                                          createOrder);
router.get('/',                                           listOrders);
router.patch('/:orderId/deliver',                         markDelivered);
router.patch('/:orderId/deliver-test',                    deliverTestType);
router.patch('/:orderId/cancel', requireRole('admin', 'manager'), cancelOrder);

module.exports = router;
