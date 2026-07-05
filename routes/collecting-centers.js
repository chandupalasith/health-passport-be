const router = require('express').Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const cc = require('../controllers/collectingCenterController');

router.use(verifyToken);
router.use(requireRole('admin', 'superadmin'));

router.get('/',      cc.listCenters);
router.post('/',     cc.createCenter);
router.patch('/:id', cc.updateCenter);
router.delete('/:id', cc.deleteCenter);

module.exports = router;
