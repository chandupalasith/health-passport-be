const OutsourcePartner = require('../models/OutsourcePartner');

/**
 * GET /api/outsource-partners
 * Returns all outsource partners for the calling user's lab, sorted by name.
 */
async function list(req, res, next) {
  try {
    const partners = await OutsourcePartner.find({ labId: req.user.labId })
      .sort({ name: 1 })
      .lean();
    return res.json({ partners });
  } catch (err) { next(err); }
}

/**
 * POST /api/outsource-partners
 * Body: { name }
 * Creates a new outsource partner for the lab.
 */
async function create(req, res, next) {
  try {
    const { name } = req.body;
    if (!name || !name.trim())
      return res.status(400).json({ message: 'name is required.' });

    const partner = await OutsourcePartner.create({
      labId: req.user.labId,
      name:  name.trim(),
    });
    return res.status(201).json({ partner });
  } catch (err) { next(err); }
}

/**
 * PATCH /api/outsource-partners/:id
 * Body: { name }
 * Updates an existing outsource partner.
 */
async function update(req, res, next) {
  try {
    const { name } = req.body;
    if (!name || !name.trim())
      return res.status(400).json({ message: 'name is required.' });

    const partner = await OutsourcePartner.findOneAndUpdate(
      { _id: req.params.id, labId: req.user.labId },
      { name: name.trim() },
      { new: true },
    );
    if (!partner) return res.status(404).json({ message: 'Partner not found.' });
    return res.json({ partner });
  } catch (err) { next(err); }
}

/**
 * DELETE /api/outsource-partners/:id
 * Removes an outsource partner belonging to the lab.
 */
async function remove(req, res, next) {
  try {
    const partner = await OutsourcePartner.findOneAndDelete({
      _id: req.params.id,
      labId: req.user.labId,
    });
    if (!partner) return res.status(404).json({ message: 'Partner not found.' });
    return res.json({ message: 'Partner removed.' });
  } catch (err) { next(err); }
}

module.exports = { list, create, update, remove };
