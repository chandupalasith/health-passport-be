const router = require('express').Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const { listUsers, createUser, updateUser, deleteUser } = require('../controllers/userController');

router.use(verifyToken);
router.use(requireRole('admin'));

router.get('/',              listUsers);
router.post('/',             createUser);
router.patch('/:userId',     updateUser);
router.delete('/:userId',    deleteUser);

module.exports = router;
