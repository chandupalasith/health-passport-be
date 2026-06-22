const router = require('express').Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  setSystemVisibility,
} = require('../controllers/templateController');

router.use(verifyToken);

// ── Read (all users) ──────────────────────────────────────────────────────────
router.get('/',          listTemplates);
router.get('/:testType', getTemplate);

// ── Admin CRUD ────────────────────────────────────────────────────────────────
router.post('/',    requireRole('admin'), createTemplate);
router.put('/:id',  requireRole('admin'), updateTemplate);
router.delete('/:id', requireRole('admin'), deleteTemplate);
router.patch('/system-visibility', requireRole('admin'), setSystemVisibility);

module.exports = router;
