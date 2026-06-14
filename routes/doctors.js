const router = require('express').Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const { listDoctors, createDoctor, updateDoctor, deleteDoctor } = require('../controllers/doctorController');

router.use(verifyToken);

router.get('/',       listDoctors);
router.post('/',      requireRole('admin'), createDoctor);
router.patch('/:id',  requireRole('admin'), updateDoctor);
router.delete('/:id', requireRole('admin'), deleteDoctor);

module.exports = router;
