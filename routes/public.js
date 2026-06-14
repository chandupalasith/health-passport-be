/**
 * Public routes — no authentication required.
 * Only exposes data that a patient can see via their SMS link.
 */
const router = require('express').Router();
const { getPublicReport } = require('../controllers/reportController');

router.get('/report/:token', getPublicReport);

module.exports = router;
