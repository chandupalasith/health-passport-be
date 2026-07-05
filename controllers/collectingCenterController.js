const CollectingCenter = require('../models/CollectingCenter');

async function listCenters(req, res, next) {
  try {
    const labId   = req.params.labId || req.user.labId;
    const centers = await CollectingCenter.find({ labId }).sort({ name: 1 });
    return res.json({ centers });
  } catch (err) { next(err); }
}

async function createCenter(req, res, next) {
  try {
    const labId = req.params.labId || req.user.labId;
    const { name, address, phone } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Name is required.' });
    const center = await CollectingCenter.create({
      labId,
      name:    name.trim(),
      address: address?.trim() || '',
      phone:   phone?.trim()   || '',
    });
    return res.status(201).json({ center });
  } catch (err) { next(err); }
}

async function updateCenter(req, res, next) {
  try {
    const labId = req.params.labId || req.user.labId;
    const { name, address, phone, isActive } = req.body;
    const update = {};
    if (name     !== undefined) update.name     = name.trim();
    if (address  !== undefined) update.address  = address.trim();
    if (phone    !== undefined) update.phone    = phone.trim();
    if (isActive !== undefined) update.isActive = Boolean(isActive);
    const center = await CollectingCenter.findOneAndUpdate(
      { _id: req.params.id, labId },
      { $set: update },
      { new: true, runValidators: true },
    );
    if (!center) return res.status(404).json({ message: 'Collecting center not found.' });
    return res.json({ center });
  } catch (err) { next(err); }
}

async function deleteCenter(req, res, next) {
  try {
    const labId  = req.params.labId || req.user.labId;
    const center = await CollectingCenter.findOneAndDelete({ _id: req.params.id, labId });
    if (!center) return res.status(404).json({ message: 'Collecting center not found.' });
    return res.json({ message: 'Collecting center removed.' });
  } catch (err) { next(err); }
}

module.exports = { listCenters, createCenter, updateCenter, deleteCenter };
