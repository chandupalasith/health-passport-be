const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { createTest, getTests, getTestsByPatient } = require('../controllers/testController');

router.use(protect);
router.post('/', createTest);
router.get('/', getTests);
router.get('/patient/:patientId', getTestsByPatient);

module.exports = router;
