const router = require('express').Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const sa = require('../controllers/superAdminController');

router.use(verifyToken);
router.use(requireRole('superadmin'));

// Dashboard
router.get('/stats', sa.getDashboardStats);

// Institutions
router.get( '/institutions',              sa.listInstitutions);
router.post('/institutions',              sa.createInstitution);
router.get( '/institutions/:labId',       sa.getInstitution);
router.patch('/institutions/:labId',      sa.updateInstitution);

// Users per institution
router.get(   '/institutions/:labId/users',           sa.listLabUsers);
router.post(  '/institutions/:labId/users',           sa.createLabUser);
router.delete('/institutions/:labId/users/:userId',   sa.deleteLabUser);

// SMS credits
router.post('/institutions/:labId/topup',         sa.topupSmsCredits);
router.get( '/institutions/:labId/topup-history', sa.getTopupHistory);

// SMS usage report
router.get('/sms-usage', sa.getSmsUsage);

// Dialog eSMS config
router.get(  '/dialog-config', sa.getDialogConfig);
router.patch('/dialog-config', sa.updateDialogConfig);

// PDF config per lab
router.patch('/institutions/:labId/pdf-config', sa.updatePdfConfig);

// Global system-default visibility
router.get(  '/system-defaults',             sa.getSystemDefaults);
router.patch('/system-defaults/templates',   sa.setGlobalTemplateVisibility);
router.patch('/system-defaults/categories',  sa.setGlobalCategoryVisibility);

module.exports = router;
