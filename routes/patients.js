const router = require('express').Router();
const { verifyToken } = require('../middleware/auth');
const { searchPatient, createPatient } = require('../controllers/patientController');

router.use(verifyToken);

router.get('/search', searchPatient);
router.post('/', createPatient);

module.exports = router;
