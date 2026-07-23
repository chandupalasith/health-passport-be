const router = require('express').Router();
const { verifyToken } = require('../middleware/auth');
const {
  createReport, updateReport, listReports, sendReportSms,
  submitForApproval, approveReport, rejectReport, getApprovalCounts,
} = require('../controllers/reportController');

// All report routes require auth
router.use(verifyToken);

router.get('/',                              listReports);
router.get('/approval-counts',              getApprovalCounts);
router.post('/',                            createReport);
router.patch('/:reportId',                  updateReport);
router.post('/:reportId/send-sms',          sendReportSms);
router.post('/:reportId/submit-approval',   submitForApproval);
router.post('/:reportId/approve',           approveReport);
router.post('/:reportId/reject',            rejectReport);

module.exports = router;
