const router = require('express').Router();
const { verifyToken, requireRole }                              = require('../middleware/auth');
const { uploadLetterhead: multerUpload }                        = require('../middleware/upload');
const { getLab, updateLab, uploadLetterhead, removeLetterhead } = require('../controllers/labController');

router.use(verifyToken);

router.get('/:labId',   getLab);
router.patch('/:labId', requireRole('admin'), updateLab);

// :type = 'print' | 'sms'
router.post('/:labId/letterhead/:type', requireRole('admin'), (req, res, next) => {
  multerUpload(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
}, uploadLetterhead);

router.delete('/:labId/letterhead/:type', requireRole('admin'), removeLetterhead);

module.exports = router;
