const router = require('express').Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const { searchPatient, createPatient, listCustomers, updatePatient } = require('../controllers/patientController');

router.use(verifyToken);

router.get('/',               listCustomers);
router.get('/search',         searchPatient);
router.post('/',              createPatient);
router.patch('/:patientId',   updatePatient);

module.exports = router;
