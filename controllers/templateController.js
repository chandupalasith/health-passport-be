const mongoose     = require('mongoose');
const TestTemplate = require('../models/TestTemplate');
const Lab          = require('../models/Lab');
const SystemConfig = require('../models/SystemConfig');

// Default columns (no 'comment' — comment is a report-level field, not a table column)
const DEFAULT_COLUMNS = [
  { key: 'result',   label: 'Result',          columnType: 'builtin' },
  { key: 'unit',     label: 'Unit',            columnType: 'builtin' },
  { key: 'refRange', label: 'Reference Range', columnType: 'builtin' },
  { key: 'flag',     label: 'Flag',            columnType: 'builtin' },
];

// ── Read endpoints (any logged-in user) ───────────────────────────────────────

/**
 * GET /api/templates
 * List all available templates for this lab (system defaults + lab overrides).
 * Category is populated to return { _id, name, color }.
 */
async function listTemplates(req, res, next) {
  try {
    const [lab, globalCfg] = await Promise.all([
      req.user.labId ? Lab.findById(req.user.labId).select('disabledSystemTemplates').lean() : null,
      SystemConfig.findOne({ key: 'global' }).select('hiddenSystemTemplates').lean(),
    ]);

    const disabled     = new Set(lab?.disabledSystemTemplates ?? []);
    const globalHidden = new Set(globalCfg?.hiddenSystemTemplates ?? []);

    // Lab-specific overrides take priority — fetch them first
    const labTemplates = req.user.labId
      ? await TestTemplate.find({ labId: req.user.labId })
          .select('testType shortName category sampleType price margin inhouseAvailable partnerPricing defaultComment columns labId')
          .populate('category', 'name color')
      : [];

    const overriddenTypes = new Set(labTemplates.map((t) => t.testType));

    // Fetch system defaults visible to this lab:
    // - not overridden by a lab-specific template
    // - sharedWithLabs is empty (global) OR includes this lab
    const labId = req.user.labId;
    const labObjId = labId ? new mongoose.Types.ObjectId(labId) : null;
    const sharedFilter = labObjId
      ? { $or: [
          { sharedWithLabs: { $size: 0 } },
          { sharedWithLabs: { $exists: false } },
          { sharedWithLabs: labObjId },
        ] }
      : {};

    const sysTemplates = await TestTemplate.find({
      labId: null,
      testType: { $nin: [...overriddenTypes] },
      ...sharedFilter,
    })
      .select('testType shortName category sampleType price margin inhouseAvailable partnerPricing defaultComment columns labId')
      .populate('category', 'name color');

    const includeHidden = req.query.all === '1';

    const systemMapped = sysTemplates.map((t) => {
      const obj = t.toObject();
      if (globalHidden.has(t.testType)) return null; // super admin hid globally
      if (disabled.has(t.testType)) {
        if (!includeHidden) return null;
        obj.hidden = true;
      }
      return obj;
    }).filter(Boolean);

    const templates = [...labTemplates.map((t) => t.toObject()), ...systemMapped]
      .sort((a, b) => a.testType.localeCompare(b.testType));

    return res.json({ templates });
  } catch (err) { next(err); }
}

/**
 * GET /api/templates/:testType
 * Returns the full template for a test type.
 * Priority: lab-specific override → system default.
 */
async function getTemplate(req, res, next) {
  try {
    const testType = req.params.testType;

    let template =
      await TestTemplate.findOne({ labId: req.user.labId, testType }).populate('category', 'name color') ??
      await TestTemplate.findOne({ labId: null,           testType }).populate('category', 'name color');

    if (!template)
      return res.status(404).json({ message: `No template found for "${testType}".` });

    // Backfill columns for old templates with none stored
    if (!template.columns || template.columns.length === 0) {
      template = template.toObject();
      template.columns = DEFAULT_COLUMNS;
    }

    return res.json({ template });
  } catch (err) { next(err); }
}

// ── Admin CRUD endpoints ───────────────────────────────────────────────────────

/**
 * POST /api/templates
 * Create a new lab-specific template (admin only).
 */
async function createTemplate(req, res, next) {
  try {
    const { testType, shortName, category, sampleType, price, margin, inhouseAvailable, partnerPricing, defaultComment, columns, fields, pdfOverrides, printOverrides } = req.body;
    if (!testType?.trim())
      return res.status(400).json({ message: 'testType is required.' });

    const labId = req.user.role === 'superadmin' ? null : req.user.labId;
    const existing = await TestTemplate.findOne({ labId, testType: testType.trim() });
    if (existing)
      return res.status(409).json({ message: `A template for "${testType}" already exists.` });

    const template = await TestTemplate.create({
      labId,
      testType:         testType.trim(),
      shortName:        (shortName       || '').trim(),
      category:         category         || null,
      sampleType:       (sampleType      || '').trim(),
      price:            Number(price)    || 0,
      margin:           Number(margin)   || 0,
      inhouseAvailable: inhouseAvailable !== undefined ? Boolean(inhouseAvailable) : true,
      partnerPricing:   Array.isArray(partnerPricing) ? partnerPricing : [],
      defaultComment:   (defaultComment  || '').trim(),
      columns:          columns?.length ? columns : DEFAULT_COLUMNS,
      fields:           fields ?? [],
      pdfOverrides:     pdfOverrides ?? {},
      printOverrides:   printOverrides ?? {},
    });

    return res.status(201).json({ template: await template.populate('category', 'name color') });
  } catch (err) { next(err); }
}

/**
 * PUT /api/templates/:id
 * Update an existing lab template (admin only; only own-lab templates).
 */
async function updateTemplate(req, res, next) {
  try {
    const labId = req.user.role === 'superadmin' ? null : req.user.labId;
    const template = await TestTemplate.findOne({ _id: req.params.id, labId });
    if (!template)
      return res.status(404).json({ message: 'Template not found.' });

    const { testType, shortName, category, sampleType, price, margin, inhouseAvailable, partnerPricing, defaultComment, columns, fields, pdfOverrides, printOverrides } = req.body;

    if (testType          !== undefined) template.testType          = testType.trim();
    if (shortName         !== undefined) template.shortName         = shortName.trim();
    if (category          !== undefined) template.category          = category || null;
    if (sampleType        !== undefined) template.sampleType        = sampleType.trim();
    if (price             !== undefined) template.price             = Number(price) || 0;
    if (margin            !== undefined) template.margin            = Number(margin) || 0;
    if (inhouseAvailable  !== undefined) template.inhouseAvailable  = Boolean(inhouseAvailable);
    if (partnerPricing    !== undefined) template.partnerPricing    = Array.isArray(partnerPricing) ? partnerPricing : [];
    if (defaultComment    !== undefined) template.defaultComment    = (defaultComment || '').trim();
    if (columns           !== undefined) template.columns           = columns;
    if (fields            !== undefined) template.fields            = fields;
    if (pdfOverrides      !== undefined) template.pdfOverrides      = pdfOverrides;
    if (printOverrides    !== undefined) template.printOverrides    = printOverrides;

    await template.save();
    return res.json({ template: await template.populate('category', 'name color') });
  } catch (err) { next(err); }
}

/**
 * DELETE /api/templates/:id
 * Remove a lab template (admin only; cannot delete system defaults).
 */
async function deleteTemplate(req, res, next) {
  try {
    const labId = req.user.role === 'superadmin' ? null : req.user.labId;
    const template = await TestTemplate.findOne({ _id: req.params.id, labId });
    if (!template)
      return res.status(404).json({ message: 'Template not found (or it is a system default).' });

    await template.deleteOne();
    return res.json({ message: 'Template deleted.' });
  } catch (err) { next(err); }
}

/**
 * PATCH /api/templates/system-visibility
 * Body: { testType: string, hidden: boolean }
 * Add or remove a system default template from this lab's disabled list.
 */
async function setSystemVisibility(req, res, next) {
  try {
    const { testType, hidden } = req.body;
    if (!testType) return res.status(400).json({ message: 'testType is required.' });

    const update = hidden
      ? { $addToSet: { disabledSystemTemplates: testType } }
      : { $pull:     { disabledSystemTemplates: testType } };

    await Lab.findByIdAndUpdate(req.user.labId, update);
    return res.json({ message: hidden ? 'Template hidden.' : 'Template restored.' });
  } catch (err) { next(err); }
}

module.exports = { listTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate, setSystemVisibility };
