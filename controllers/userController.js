const User = require('../models/User');

/**
 * GET /api/users
 * Admin: lists all users within their own lab.
 */
async function listUsers(req, res, next) {
  try {
    const users = await User.find({ labId: req.user.labId })
      .select('name email role createdAt')
      .sort({ role: 1, name: 1 });
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
    const { name, email, password } = req.body;

    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ message: 'name, email and password are required.' });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(409).json({ message: 'Email already in use.' });

    const user = await User.create({
      labId:        req.user.labId,
      name:         name.trim(),
      email:        email.toLowerCase().trim(),
      passwordHash: password,
      role:         'technician',   // admin can only create technicians
    });

    return res.status(201).json({
      user: { _id: user._id, name: user.name, email: user.email, role: user.role },
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
