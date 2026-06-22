const TestCategory = require('../models/TestCategory');
const Lab          = require('../models/Lab');
const SystemConfig = require('../models/SystemConfig');

/**
 * GET /api/categories
 * Returns system categories + any lab-specific ones for this lab.
 * With ?all=1, returns all including hidden system ones (with hidden:true flag).
 */
async function listCategories(req, res, next) {
  try {
    const [lab, globalCfg] = await Promise.all([
      Lab.findById(req.user.labId).select('disabledSystemCategories').lean(),
      SystemConfig.findOne({ key: 'global' }).select('hiddenSystemCategories').lean(),
    ]);

    const disabled     = new Set((lab?.disabledSystemCategories ?? []).map(String));
    const globalHidden = new Set((globalCfg?.hiddenSystemCategories ?? []).map(String));

    const all = await TestCategory.find({
      $or: [{ labId: null }, { labId: req.user.labId }],
    }).sort({ sortOrder: 1, name: 1 }).lean();

    const includeHidden = req.query.all === '1';

    const categories = all
      .map((c) => {
        const id = String(c._id);
        if (c.labId === null && globalHidden.has(id)) return null; // super admin hid globally
        if (c.labId === null && disabled.has(id)) {
          if (!includeHidden) return null;
          return { ...c, hidden: true };
        }
        return c;
      })
      .filter(Boolean);

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
    // Allow editing system defaults (labId: null) and this lab's own categories
    const category = await TestCategory.findOne({
      _id: req.params.id,
      $or: [{ labId: req.user.labId }, { labId: null }],
    });
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

/**
 * PATCH /api/categories/system-visibility
 * Body: { categoryId: string, hidden: boolean }
 * Add or remove a system category from this lab's disabled list.
 */
async function setSystemCategoryVisibility(req, res, next) {
  try {
    const { categoryId, hidden } = req.body;
    if (!categoryId) return res.status(400).json({ message: 'categoryId is required.' });

    const update = hidden
      ? { $addToSet: { disabledSystemCategories: categoryId } }
      : { $pull:     { disabledSystemCategories: categoryId } };

    await Lab.findByIdAndUpdate(req.user.labId, update);
    return res.json({ message: hidden ? 'Category hidden.' : 'Category restored.' });
  } catch (err) { next(err); }
}

module.exports = { listCategories, createCategory, updateCategory, deleteCategory, setSystemCategoryVisibility };
