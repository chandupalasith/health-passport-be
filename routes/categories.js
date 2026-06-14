const router = require('express').Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} = require('../controllers/categoryController');

router.use(verifyToken);

router.get('/',       listCategories);                         // all users
router.post('/',      requireRole('admin'), createCategory);   // admin
router.put('/:id',    requireRole('admin'), updateCategory);   // admin
router.delete('/:id', requireRole('admin'), deleteCategory);   // admin

module.exports = router;
