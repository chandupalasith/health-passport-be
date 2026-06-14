const TestCategory = require('../models/TestCategory');

/**
 * GET /api/categories
 * Returns system categories + any lab-specific ones for this lab.
 */
async function listCategories(req, res, next) {
  try {
    const categories = await TestCategory.find({
      $or: [{ labId: null }, { labId: req.user.labId }],
    }).sort({ sortOrder: 1, name: 1 });

    return res.json({ categories });
  } catch (err) { next(err); }
}

/**
 * POST /api/categories
 * Create a lab-specific category (admin only).
 */
async function createCategory(req, res, next) {
  try {
    const { name, color, sortOrder } = req.body;
    if (!name?.trim())
      return res.status(400).json({ message: 'Category name is required.' });

    const existing = await TestCategory.findOne({ labId: req.user.labId, name: name.trim() });
    if (existing)
      return res.status(409).json({ message: `Category "${name}" already exists.` });

    const category = await TestCategory.create({
      labId:     req.user.labId,
      name:      name.trim(),
      color:     color     || '#6b7280',
      sortOrder: sortOrder ?? 0,
    });

    return res.status(201).json({ category });
  } catch (err) { next(err); }
}

/**
 * PUT /api/categories/:id
 * Update a lab-specific category (admin only — cannot update system defaults).
 */
async function updateCategory(req, res, next) {
  try {
    const category = await TestCategory.findOne({ _id: req.params.id, labId: req.user.labId });
    if (!category)
      return res.status(404).json({ message: 'Category not found.' });

    const { name, color, sortOrder } = req.body;
    if (name      !== undefined) category.name      = name.trim();
    if (color     !== undefined) category.color     = color;
    if (sortOrder !== undefined) category.sortOrder = sortOrder;

    await category.save();
    return res.json({ category });
  } catch (err) { next(err); }
}

/**
 * DELETE /api/categories/:id
 * Delete a lab-specific category (admin only).
 */
async function deleteCategory(req, res, next) {
  try {
    const category = await TestCategory.findOne({ _id: req.params.id, labId: req.user.labId });
    if (!category)
      return res.status(404).json({ message: 'Category not found (or it is a system default).' });

    await category.deleteOne();
    return res.json({ message: 'Category deleted.' });
  } catch (err) { next(err); }
}

module.exports = { listCategories, createCategory, updateCategory, deleteCategory };
