const Doctor = require('../models/Doctor');

async function listDoctors(req, res, next) {
  try {
    const doctors = await Doctor.find({ labId: req.user.labId }).sort({ name: 1 });
    return res.json({ doctors });
  } catch (err) { next(err); }
}

async function createDoctor(req, res, next) {
  try {
    const { name, phone, specialty } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Name is required.' });
    const doctor = await Doctor.create({
      labId:     req.user.labId,
      name:      name.trim(),
      phone:     phone?.trim()     || '',
      specialty: specialty?.trim() || '',
    });
    return res.status(201).json({ doctor });
  } catch (err) { next(err); }
}

async function updateDoctor(req, res, next) {
  try {
    const { name, phone, specialty } = req.body;
    const update = {};
    if (name      !== undefined) update.name      = name.trim();
    if (phone     !== undefined) update.phone     = phone.trim();
    if (specialty !== undefined) update.specialty = specialty.trim();
    const doctor = await Doctor.findOneAndUpdate(
      { _id: req.params.id, labId: req.user.labId },
      { $set: update },
      { new: true, runValidators: true },
    );
    if (!doctor) return res.status(404).json({ message: 'Doctor not found.' });
    return res.json({ doctor });
  } catch (err) { next(err); }
}

async function deleteDoctor(req, res, next) {
  try {
    const doctor = await Doctor.findOneAndDelete({ _id: req.params.id, labId: req.user.labId });
    if (!doctor) return res.status(404).json({ message: 'Doctor not found.' });
    return res.json({ message: 'Doctor removed.' });
  } catch (err) { next(err); }
}

module.exports = { listDoctors, createDoctor, updateDoctor, deleteDoctor };
