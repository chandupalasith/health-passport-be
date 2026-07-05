const User             = require('../models/User');
const CollectingCenter = require('../models/CollectingCenter');

async function listUsers(req, res, next) {
  try {
    const raw = await User.find({ labId: req.user.labId })
      .select('name email role createdAt collectingCenterId')
      .sort({ role: 1, name: 1 })
      .populate('collectingCenterId', 'name')
      .lean();

    const users = raw.map(({ email, collectingCenterId, ...rest }) => ({
      ...rest,
      username:            email,
      collectingCenterId:  collectingCenterId?._id?.toString() || null,
      collectingCenterName: collectingCenterId?.name || null,
    }));

    return res.json({ users });
  } catch (err) { next(err); }
}

async function createUser(req, res, next) {
  try {
    const { name, username, password, collectingCenterId } = req.body;

    if (!name?.trim() || !username?.trim() || !password) {
      return res.status(400).json({ message: 'name, username and password are required.' });
    }

    // Validate collecting center if provided
    if (collectingCenterId) {
      const center = await CollectingCenter.findOne({ _id: collectingCenterId, labId: req.user.labId });
      if (!center) return res.status(404).json({ message: 'Collecting center not found.' });
    }

    const existing = await User.findOne({ email: username.toLowerCase().trim() });
    if (existing) return res.status(409).json({ message: 'Username already in use.' });

    const user = await User.create({
      labId:              req.user.labId,
      name:               name.trim(),
      email:              username.toLowerCase().trim(),
      passwordHash:       password,
      role:               'technician',
      collectingCenterId: collectingCenterId || null,
    });

    const centerName = collectingCenterId
      ? (await CollectingCenter.findById(collectingCenterId).select('name').lean())?.name || null
      : null;

    return res.status(201).json({
      user: {
        _id:                 user._id,
        name:                user.name,
        username:            user.email,
        role:                user.role,
        collectingCenterId:  user.collectingCenterId || null,
        collectingCenterName: centerName,
      },
    });
  } catch (err) { next(err); }
}

async function updateUser(req, res, next) {
  try {
    const { collectingCenterId } = req.body;

    if (collectingCenterId) {
      const center = await CollectingCenter.findOne({ _id: collectingCenterId, labId: req.user.labId });
      if (!center) return res.status(404).json({ message: 'Collecting center not found.' });
    }

    const user = await User.findOneAndUpdate(
      { _id: req.params.userId, labId: req.user.labId },
      { $set: { collectingCenterId: collectingCenterId || null } },
      { new: true },
    ).populate('collectingCenterId', 'name').lean();

    if (!user) return res.status(404).json({ message: 'User not found.' });

    return res.json({
      user: {
        _id:                 user._id,
        name:                user.name,
        username:            user.email,
        role:                user.role,
        collectingCenterId:  user.collectingCenterId?._id?.toString() || null,
        collectingCenterName: user.collectingCenterId?.name || null,
      },
    });
  } catch (err) { next(err); }
}

async function deleteUser(req, res, next) {
  try {
    if (req.params.userId === req.user.userId) {
      return res.status(400).json({ message: 'You cannot remove your own account.' });
    }

    const user = await User.findOneAndDelete({
      _id:   req.params.userId,
      labId: req.user.labId,
      role:  'technician',
    });

    if (!user) return res.status(404).json({ message: 'Technician not found.' });
    return res.json({ message: 'Technician removed.' });
  } catch (err) { next(err); }
}

module.exports = { listUsers, createUser, updateUser, deleteUser };
