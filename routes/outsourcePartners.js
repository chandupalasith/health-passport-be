const router = require('express').Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const { list, create, update, remove } = require('../controllers/outsourcePartnerController');
router.use(verifyToken);
router.get('/',      list);
router.post('/',     requireRole('admin'), create);
router.patch('/:id', requireRole('admin'), update);
router.delete('/:id', requireRole('admin'), remove);
module.exports = router;
