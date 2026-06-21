const router = require('express').Router();
const { verifyToken } = require('../middleware/auth');
const {
  createReport,
  updateReport,
  listReports,
  sendReportSms,
} = require('../controllers/reportController');

// All report routes require auth
router.use(verifyToken);

router.get('/',                       listReports);
router.post('/',                      createReport);
router.patch('/:reportId',            updateReport);
router.post('/:reportId/send-sms',    sendReportSms);

module.exports = router;
