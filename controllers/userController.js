const User = require('../models/User');

/**
 * GET /api/users
 * Admin: lists all users within their own lab.
 */
async function listUsers(req, res, next) {
  try {
    const raw = await User.find({ labId: req.user.labId })
      .select('name email role createdAt')
      .sort({ role: 1, name: 1 })
      .lean();
    const users = raw.map(({ email, ...rest }) => ({ ...rest, username: email }));
    return res.json({ users });
  } catch (err) { next(err); }
}

/**
 * POST /api/users
 * Admin: creates a technician within their own lab.
 * Admins cannot self-promote or create other admins.
 */
async function createUser(req, res, next) {
  try {
    const { name, username, password } = req.body;

    if (!name?.trim() || !username?.trim() || !password) {
      return res.status(400).json({ message: 'name, username and password are required.' });
    }

    const existing = await User.findOne({ email: username.toLowerCase().trim() });
    if (existing) return res.status(409).json({ message: 'Username already in use.' });

    const user = await User.create({
      labId:        req.user.labId,
      name:         name.trim(),
      email:        username.toLowerCase().trim(),
      passwordHash: password,
      role:         'technician',
    });

    return res.status(201).json({
      user: { _id: user._id, name: user.name, username: user.email, role: user.role },
    });
  } catch (err) { next(err); }
}

/**
 * DELETE /api/users/:userId
 * Admin: removes a technician from their own lab.
 * Cannot delete yourself.
 */
async function deleteUser(req, res, next) {
  try {
    if (req.params.userId === req.user.userId) {
      return res.status(400).json({ message: 'You cannot remove your own account.' });
    }

    const user = await User.findOneAndDelete({
      _id:   req.params.userId,
      labId: req.user.labId,
      role:  'technician',   // admin can only delete technicians, not other admins
    });

    if (!user) return res.status(404).json({ message: 'Technician not found.' });
    return res.json({ message: 'Technician removed.' });
  } catch (err) { next(err); }
}

module.exports = { listUsers, createUser, deleteUser };
