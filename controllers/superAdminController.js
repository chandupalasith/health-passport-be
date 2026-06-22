const Lab          = require('../models/Lab');
const User         = require('../models/User');
const Report       = require('../models/Report');
const Order        = require('../models/Order');
const SmsTopup     = require('../models/SmsTopup');
const SystemConfig = require('../models/SystemConfig');
const TestTemplate = require('../models/TestTemplate');
const TestCategory = require('../models/TestCategory');

// ── Dashboard ───────────────────────────────────────────────────────────────

async function getDashboardStats(req, res, next) {
  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const [totalInstitutions, totalReportsToday, totalSmsSentToday, totalPendingOrders] =
      await Promise.all([
        Lab.countDocuments(),
        Report.countDocuments({ submittedAt: { $gte: todayStart } }),
        Report.countDocuments({ smsSentAt:   { $gte: todayStart } }),
        Order.countDocuments({ status: 'pending' }),
      ]);

    return res.json({ totalInstitutions, totalReportsToday, totalSmsSentToday, totalPendingOrders });
  } catch (err) { next(err); }
}

// ── Institutions ────────────────────────────────────────────────────────────

async function listInstitutions(req, res, next) {
  try {
    const institutions = await Lab.find({})
      .select('name address phone logoUrl labCode smsCredits createdAt')
      .sort({ name: 1 });

    // Attach user counts
    const labIds = institutions.map((l) => l._id);
    const counts = await User.aggregate([
      { $match: { labId: { $in: labIds } } },
      { $group: { _id: '$labId', count: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(counts.map((c) => [c._id.toString(), c.count]));

    const data = institutions.map((l) => ({
      ...l.toObject(),
      userCount: countMap[l._id.toString()] ?? 0,
    }));

    return res.json({ institutions: data });
  } catch (err) { next(err); }
}

async function createInstitution(req, res, next) {
  try {
    const { name, address, phone, logoUrl, labCode, initialCredits = 0 } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Lab name is required.' });
    if (labCode && !/^[A-Za-z]{2,4}$/.test(labCode.trim())) {
      return res.status(400).json({ message: 'Lab code must be 2–4 letters.' });
    }

    const lab = await Lab.create({
      name:    name.trim(),
      address: address?.trim(),
      phone:   phone?.trim(),
      logoUrl: logoUrl?.trim(),
      labCode: labCode?.trim().toUpperCase() || undefined,
      smsCredits: Math.max(0, parseInt(initialCredits, 10) || 0),
    });

    return res.status(201).json({ institution: lab });
  } catch (err) { next(err); }
}

async function getInstitution(req, res, next) {
  try {
    const lab = await Lab.findById(req.params.labId);
    if (!lab) return res.status(404).json({ message: 'Institution not found.' });
    return res.json({ institution: lab });
  } catch (err) { next(err); }
}

async function updateInstitution(req, res, next) {
  try {
    const { name, address, phone, logoUrl, labCode, canPrintReceipt } = req.body;
    if (labCode && !/^[A-Za-z]{2,4}$/.test(labCode.trim())) {
      return res.status(400).json({ message: 'Lab code must be 2–4 letters.' });
    }
    const update = {};
    if (name             !== undefined) update.name             = name.trim();
    if (address          !== undefined) update.address          = address.trim();
    if (phone            !== undefined) update.phone            = phone.trim();
    if (logoUrl          !== undefined) update.logoUrl          = logoUrl.trim();
    if (labCode          !== undefined) update.labCode          = labCode.trim().toUpperCase();
    if (canPrintReceipt  !== undefined) update.canPrintReceipt  = Boolean(canPrintReceipt);

    const lab = await Lab.findByIdAndUpdate(
      req.params.labId,
      { $set: update },
      { new: true, runValidators: true },
    );
    if (!lab) return res.status(404).json({ message: 'Institution not found.' });
    return res.json({ institution: lab });
  } catch (err) { next(err); }
}

// ── Users per institution ───────────────────────────────────────────────────

async function listLabUsers(req, res, next) {
  try {
    const raw = await User.find({ labId: req.params.labId })
      .select('name email role createdAt')
      .sort({ role: 1, name: 1 })
      .lean();
    const users = raw.map(({ email, ...rest }) => ({ ...rest, username: email }));
    return res.json({ users });
  } catch (err) { next(err); }
}

async function createLabUser(req, res, next) {
  try {
    const { name, username, password, role } = req.body;
    if (!name || !username || !password) {
      return res.status(400).json({ message: 'name, username and password are required.' });
    }
    if (!['admin', 'technician'].includes(role)) {
      return res.status(400).json({ message: 'role must be admin or technician.' });
    }
    const existing = await User.findOne({ email: username.toLowerCase().trim() });
    if (existing) return res.status(409).json({ message: 'Username already in use.' });

    const lab = await Lab.findById(req.params.labId);
    if (!lab) return res.status(404).json({ message: 'Institution not found.' });

    const user = await User.create({
      labId:        lab._id,
      name:         name.trim(),
      email:        username.toLowerCase().trim(),
      passwordHash: password,
      role,
    });

    return res.status(201).json({
      user: { _id: user._id, name: user.name, username: user.email, role: user.role },
    });
  } catch (err) { next(err); }
}

async function deleteLabUser(req, res, next) {
  try {
    const user = await User.findOneAndDelete({
      _id:   req.params.userId,
      labId: req.params.labId,
    });
    if (!user) return res.status(404).json({ message: 'User not found.' });
    return res.json({ message: 'User removed.' });
  } catch (err) { next(err); }
}

// ── SMS top-up ──────────────────────────────────────────────────────────────

async function topupSmsCredits(req, res, next) {
  try {
    const credits = parseInt(req.body.credits, 10);
    const notes   = req.body.notes?.trim() || '';

    if (!credits || credits < 1) {
      return res.status(400).json({ message: 'credits must be a positive integer.' });
    }

    const lab = await Lab.findById(req.params.labId);
    if (!lab) return res.status(404).json({ message: 'Institution not found.' });

    const previousBalance = lab.smsCredits;
    const newBalance      = previousBalance + credits;

    await Lab.findByIdAndUpdate(req.params.labId, { smsCredits: newBalance });

    await SmsTopup.create({
      labId:           lab._id,
      creditsAdded:    credits,
      previousBalance,
      newBalance,
      topUpBy:         req.user.userId,
      notes,
    });

    return res.json({ previousBalance, creditsAdded: credits, newBalance });
  } catch (err) { next(err); }
}

async function getTopupHistory(req, res, next) {
  try {
    const history = await SmsTopup.find({ labId: req.params.labId })
      .populate('topUpBy', 'name')
      .sort({ topUpAt: -1 })
      .limit(100);
    return res.json({ history });
  } catch (err) { next(err); }
}

// ── SMS usage report ────────────────────────────────────────────────────────

async function getSmsUsage(req, res, next) {
  try {
    const { date, startDate, endDate } = req.query;

    let dateFilter;
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    if (date === '7days') {
      const d = new Date(); d.setDate(d.getDate() - 7); d.setUTCHours(0, 0, 0, 0);
      dateFilter = { $gte: d };
    } else if (date === '30days') {
      const d = new Date(); d.setDate(d.getDate() - 30); d.setUTCHours(0, 0, 0, 0);
      dateFilter = { $gte: d };
    } else if (date === 'custom' && startDate && endDate) {
      dateFilter = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setUTCHours(23, 59, 59, 999)),
      };
    } else {
      // default: today
      dateFilter = { $gte: todayStart };
    }

    // Aggregate SMS count per lab
    const rows = await Report.aggregate([
      { $match: { smsSentAt: dateFilter } },
      { $group: { _id: '$labId', smsSent: { $sum: 1 } } },
      { $lookup: { from: 'labs', localField: '_id', foreignField: '_id', as: 'lab' } },
      { $unwind: '$lab' },
      { $project: { labName: '$lab.name', smsSent: 1, smsCredits: '$lab.smsCredits' } },
      { $sort: { smsSent: -1 } },
    ]);

    const total = rows.reduce((s, r) => s + r.smsSent, 0);
    return res.json({ usage: rows, total });
  } catch (err) { next(err); }
}

// ── Dialog eSMS config ──────────────────────────────────────────────────────

async function getDialogConfig(req, res, next) {
  try {
    const cfg = await SystemConfig.findOne({ key: 'global' });
    return res.json({
      config: {
        hasApiKey:           !!cfg?.dialogApiKey,
        dialogSourceAddress: cfg?.dialogSourceAddress || '',
      },
    });
  } catch (err) { next(err); }
}

async function updateDialogConfig(req, res, next) {
  try {
    const { dialogApiKey, dialogSourceAddress } = req.body;
    if (!dialogApiKey?.trim()) {
      return res.status(400).json({ message: 'dialogApiKey is required.' });
    }

    await SystemConfig.findOneAndUpdate(
      { key: 'global' },
      {
        dialogApiKey:        dialogApiKey.trim(),
        dialogSourceAddress: (dialogSourceAddress || 'HealthPass').trim(),
        updatedAt:           new Date(),
        updatedBy:           req.user.userId,
      },
      { upsert: true, new: true },
    );

    return res.json({ message: 'Dialog eSMS configuration updated.' });
  } catch (err) { next(err); }
}

// ── PDF config per institution ──────────────────────────────────────────────

async function updatePdfConfig(req, res, next) {
  try {
    const { reportFooter, primaryColor, showWatermark, watermarkText, pageSize } = req.body;

    const update = {};
    if (reportFooter  !== undefined) update['pdfConfig.reportFooter']  = reportFooter;
    if (primaryColor  !== undefined) update['pdfConfig.primaryColor']  = primaryColor;
    if (showWatermark !== undefined) update['pdfConfig.showWatermark'] = showWatermark;
    if (watermarkText !== undefined) update['pdfConfig.watermarkText'] = watermarkText;
    if (pageSize      !== undefined) update['pdfConfig.pageSize']      = pageSize;

    const lab = await Lab.findByIdAndUpdate(
      req.params.labId,
      { $set: update },
      { new: true },
    );
    if (!lab) return res.status(404).json({ message: 'Institution not found.' });
    return res.json({ pdfConfig: lab.pdfConfig });
  } catch (err) { next(err); }
}

// ── Global system-default visibility ────────────────────────────────────────

async function getSystemDefaults(req, res, next) {
  try {
    const cfg = await SystemConfig.findOne({ key: 'global' })
      .select('hiddenSystemTemplates hiddenSystemCategories').lean();

    const hiddenTplSet = new Set(cfg?.hiddenSystemTemplates ?? []);
    const hiddenCatSet = new Set(cfg?.hiddenSystemCategories ?? []);

    const [rawTemplates, rawCategories] = await Promise.all([
      TestTemplate.find({ labId: null })
        .select('testType shortName').sort({ testType: 1 }).lean(),
      TestCategory.find({ labId: null })
        .select('name color sortOrder').sort({ sortOrder: 1, name: 1 }).lean(),
    ]);

    const templates = rawTemplates.map((t) => ({
      ...t, hidden: hiddenTplSet.has(t.testType),
    }));

    const categories = rawCategories.map((c) => ({
      ...c, hidden: hiddenCatSet.has(String(c._id)),
    }));

    return res.json({ templates, categories });
  } catch (err) { next(err); }
}

async function setGlobalTemplateVisibility(req, res, next) {
  try {
    const { testType, hidden } = req.body;
    if (!testType) return res.status(400).json({ message: 'testType is required.' });

    const update = hidden
      ? { $addToSet: { hiddenSystemTemplates: testType } }
      : { $pull:     { hiddenSystemTemplates: testType } };

    await SystemConfig.findOneAndUpdate({ key: 'global' }, update, { upsert: true });
    return res.json({ message: hidden ? 'Template hidden globally.' : 'Template restored globally.' });
  } catch (err) { next(err); }
}

async function setGlobalCategoryVisibility(req, res, next) {
  try {
    const { categoryId, hidden } = req.body;
    if (!categoryId) return res.status(400).json({ message: 'categoryId is required.' });

    const update = hidden
      ? { $addToSet: { hiddenSystemCategories: categoryId } }
      : { $pull:     { hiddenSystemCategories: categoryId } };

    await SystemConfig.findOneAndUpdate({ key: 'global' }, update, { upsert: true });
    return res.json({ message: hidden ? 'Category hidden globally.' : 'Category restored globally.' });
  } catch (err) { next(err); }
}

module.exports = {
  getDashboardStats,
  listInstitutions, createInstitution, getInstitution, updateInstitution,
  listLabUsers, createLabUser, deleteLabUser,
  topupSmsCredits, getTopupHistory,
  getSmsUsage,
  getDialogConfig, updateDialogConfig,
  updatePdfConfig,
  getSystemDefaults, setGlobalTemplateVisibility, setGlobalCategoryVisibility,
};
