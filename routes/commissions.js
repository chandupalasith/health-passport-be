const router = require('express').Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const { getDoctorCommission, listDoctorSummaries } = require('../controllers/commissionController');

router.use(verifyToken);
router.use(requireRole('admin'));

router.get('/',        getDoctorCommission);
router.get('/summary', listDoctorSummaries);

module.exports = router;
