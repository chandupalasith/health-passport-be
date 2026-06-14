const Lab          = require('../models/Lab');
const Order        = require('../models/Order');
const Patient      = require('../models/Patient');
const TestTemplate = require('../models/TestTemplate');

/**
 * POST /api/orders
 */
async function createOrder(req, res, next) {
  try {
    const { patientId, testTypes, refDoctor, refDoctorId, sampleType } = req.body;
    if (!patientId)
      return res.status(400).json({ message: 'patientId is required.' });
    if (!Array.isArray(testTypes) || testTypes.length === 0)
      return res.status(400).json({ message: 'Select at least one test type.' });

    const patient = await Patient.findOne({ _id: patientId, labId: req.user.labId });
    if (!patient) return res.status(404).json({ message: 'Patient not found.' });

    // Atomically increment counter and generate bill number
    const lab = await Lab.findByIdAndUpdate(
      req.user.labId,
      { $inc: { billCounter: 1 } },
      { new: true },
    ).select('labCode billCounter');

    const year2  = String(new Date().getFullYear()).slice(-2);
    const seq    = String(lab.billCounter).padStart(6, '0');
    const code   = (lab.labCode || 'HP').toUpperCase();
    const billNo = `${code}/${year2}/${seq}`;

    const order = await Order.create({
      labId:      req.user.labId,
      patientId:  patient._id,
      testTypes:  testTypes.map((t) => t.trim()).filter(Boolean),
      orderedBy:  req.user.userId,
      status:     'pending',
      refDoctor:   (refDoctor  || '').trim(),
      refDoctorId: refDoctorId || null,
      sampleType:  (sampleType || '').trim(),
      billNo,
    });

    return res.status(201).json({ order });
  } catch (err) { next(err); }
}

/**
 * GET /api/orders
 * Query params:
 *   status     — pending | submitted | sent
 *   categoryId — ObjectId of a TestCategory
 *   testType   — exact test type name
 *   date       — today (default) | yesterday | week | all | custom
 *   startDate  — ISO date string (when date=custom)
 *   endDate    — ISO date string (when date=custom)
 *   search     — partial match on billNo
 */
async function listOrders(req, res, next) {
  try {
    const { status, categoryId, testType, date, startDate, endDate, search } = req.query;
    const filter = { labId: req.user.labId };

    if (status) filter.status = status;

    // ── Date filter (default: today) ──────────────────────────────────────
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    if (date === 'all') {
      // no date filter
    } else if (date === 'yesterday') {
      const start = new Date(todayStart);
      start.setDate(start.getDate() - 1);
      const end   = new Date(start);
      end.setHours(23, 59, 59, 999);
      filter.orderedAt = { $gte: start, $lte: end };
    } else if (date === 'week') {
      const weekAgo = new Date(todayStart);
      weekAgo.setDate(weekAgo.getDate() - 7);
      filter.orderedAt = { $gte: weekAgo };
    } else if (date === 'custom' && startDate && endDate) {
      filter.orderedAt = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
      };
    } else {
      filter.orderedAt = { $gte: todayStart };
    }

    // ── Bill number search ────────────────────────────────────────────────
    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.billNo = { $regex: regex };
    }

    // ── Category filter ───────────────────────────────────────────────────
    if (categoryId) {
      const templates = await TestTemplate.find({
        $or: [{ labId: null }, { labId: req.user.labId }],
        category: categoryId,
      }).select('testType');

      const names = templates.map((t) => t.testType);
      filter.testTypes = { $elemMatch: { $in: names } };
    }

    // ── Individual test type filter ───────────────────────────────────────
    if (testType) {
      filter.testTypes = { $elemMatch: { $eq: testType } };
    }

    const orders = await Order.find(filter)
      .populate('patientId', 'name mobile')
      .populate('orderedBy', 'name')
      .sort({ orderedAt: -1 });

    return res.json({ orders });
  } catch (err) { next(err); }
}

module.exports = { createOrder, listOrders };
