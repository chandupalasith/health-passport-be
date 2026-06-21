const router = require('express').Router();
const { verifyToken, requireRole }                              = require('../middleware/auth');
const { uploadLetterhead: multerUpload, uploadImage: multerImage } = require('../middleware/upload');
const { getLab, updateLab, uploadLetterhead, removeLetterhead, uploadImage, removeImage } = require('../controllers/labController');

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

// :imageType = 'logo' | 'signature'
router.post('/:labId/image/:imageType', requireRole('admin'), (req, res, next) => {
  multerImage(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
}, uploadImage);

router.delete('/:labId/image/:imageType', requireRole('admin'), removeImage);

module.exports = router;
