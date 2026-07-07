const Lab              = require('../models/Lab');
const Order            = require('../models/Order');
const Report           = require('../models/Report');
const Patient          = require('../models/Patient');
const TestTemplate     = require('../models/TestTemplate');
const OutsourcePartner = require('../models/OutsourcePartner');

/**
 * POST /api/orders
 */
async function createOrder(req, res, next) {
  try {
    const { patientId, testTypes: rawTestTypes, testMeta: rawTestMeta, refDoctor, refDoctorId, sampleType, paymentMethod } = req.body;
    if (!patientId)
      return res.status(400).json({ message: 'patientId is required.' });

    // Resolve testTypes and testMeta
    let resolvedTestTypes;
    let resolvedTestMeta = [];

    if (Array.isArray(rawTestMeta) && rawTestMeta.length > 0) {
      // Validate each testMeta entry has a testType
      for (const m of rawTestMeta) {
        if (!m.testType || !String(m.testType).trim())
          return res.status(400).json({ message: 'Each testMeta entry must have a testType.' });
      }

      // Validate any partnerId belongs to this lab
      const partnerIds = rawTestMeta
        .filter((m) => m.partnerId)
        .map((m) => m.partnerId);

      if (partnerIds.length > 0) {
        const validPartners = await OutsourcePartner.find({
          _id: { $in: partnerIds },
          labId: req.user.labId,
        }).select('_id name').lean();
        const validIds = new Set(validPartners.map((p) => p._id.toString()));
        const partnerNameMap = new Map(validPartners.map((p) => [p._id.toString(), p.name]));

        for (const m of rawTestMeta) {
          if (m.partnerId && !validIds.has(String(m.partnerId)))
            return res.status(400).json({ message: `Partner ${m.partnerId} not found in this lab.` });
          // Enrich partnerName from DB if not provided
          if (m.partnerId && !m.partnerName) {
            m.partnerName = partnerNameMap.get(String(m.partnerId)) || '';
          }
        }
      }

      resolvedTestMeta  = rawTestMeta.map((m) => ({
        testType:       String(m.testType).trim(),
        partnerId:      m.partnerId || null,
        partnerName:    (m.partnerName || '').trim(),
        price:          Number(m.price)          || 0,
        commissionRate: Number(m.commissionRate) || 0,
      }));
      resolvedTestTypes = resolvedTestMeta.map((m) => m.testType);
    } else {
      // Legacy path: plain testTypes array
      if (!Array.isArray(rawTestTypes) || rawTestTypes.length === 0)
        return res.status(400).json({ message: 'Select at least one test type.' });
      resolvedTestTypes = rawTestTypes.map((t) => t.trim()).filter(Boolean);
    }

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
      labId:              req.user.labId,
      patientId:          patient._id,
      testTypes:          resolvedTestTypes,
      testMeta:           resolvedTestMeta,
      orderedBy:          req.user.userId,
      status:             'pending',
      refDoctor:          (refDoctor  || '').trim(),
      refDoctorId:        refDoctorId || null,
      sampleType:         (sampleType || '').trim(),
      billNo,
      paymentMethod:      ['cash', 'card'].includes(paymentMethod) ? paymentMethod : 'cash',
      collectingCenterId: req.user.collectingCenterId || null,
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
    const filter = { labId: req.user.labId, cancelledAt: null };

    if (status) {
      // 'ready' includes fully-ready orders AND partial pending orders (filtered post-join)
      if      (status === 'ready')     filter.status = { $in: ['ready', 'submitted', 'pending'] };
      else if (status === 'delivered') filter.status = { $in: ['delivered', 'sent'] };
      else                             filter.status = status;
    }

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

    // ── Search: name, mobile, or bill number ─────────────────────────────
    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const matchedPatients = await Patient.find({
        labId: req.user.labId,
        $or: [{ name: regex }, { mobile: regex }],
      }).select('_id').lean();
      filter.$or = [
        { billNo:    { $regex: regex } },
        { patientId: { $in: matchedPatients.map((p) => p._id) } },
      ];
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

    // Attach which test types already have a submitted report (for partial-order indicator)
    const orderIds = orders.map((o) => o._id);
    const reports  = await Report.find({ orderId: { $in: orderIds } }).select('orderId testType').lean();
    const doneMap  = new Map();
    for (const r of reports) {
      const key = r.orderId.toString();
      if (!doneMap.has(key)) doneMap.set(key, []);
      doneMap.get(key).push(r.testType);
    }
    const enriched = orders
      .map((o) => {
        // Merge report-based completed tests with outsource-delivered tests
        const reportCompleted   = doneMap.get(o._id.toString()) ?? [];
        const outsourceDone     = o.outsourceDeliveredTestTypes ?? [];
        const mergedCompleted   = [...new Set([...reportCompleted, ...outsourceDone])];
        const completed         = mergedCompleted;
        const completedSet = new Set(completed);

        let viewTestTypes;
        if (status === 'ready' && o.status === 'pending') {
          // Partial order shown in ready tab: only the completed tests
          viewTestTypes = (o.testTypes || []).filter((t) => completedSet.has(t));
        } else if (status === 'pending') {
          // Pending tab: only the tests not yet completed
          viewTestTypes = (o.testTypes || []).filter((t) => !completedSet.has(t));
        }
        // For ready/submitted status orders, viewTestTypes is omitted — frontend uses testTypes

        // Tests routed to an outsource partner
        const outsourceTestTypes = (o.testMeta ?? [])
          .filter((m) => m.partnerId)
          .map((m) => m.testType);

        return {
          ...o.toObject(),
          completedTestTypes: completed,
          outsourceTestTypes,
          ...(viewTestTypes !== undefined ? { viewTestTypes } : {}),
        };
      })
      // In the ready tab, drop pending orders that have no completed tests yet
      .filter((o) => {
        if (status === 'ready' && o.status === 'pending') {
          return (o.viewTestTypes ?? []).length > 0;
        }
        // In the pending tab, drop orders that are fully complete (no remaining tests)
        if (status === 'pending') {
          return (o.viewTestTypes ?? o.testTypes ?? []).length > 0;
        }
        return true;
      });

    return res.json({ orders: enriched });
  } catch (err) { next(err); }
}

/**
 * PATCH /api/orders/:orderId/deliver
 * Marks an order as delivered (triggered when admin/tech clicks Print).
 */
async function markDelivered(req, res, next) {
  try {
    const order = await Order.findOneAndUpdate(
      { _id: req.params.orderId, labId: req.user.labId },
      { status: 'delivered' },
      { new: true },
    );
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    return res.json({ order });
  } catch (err) { next(err); }
}

/**
 * PATCH /api/orders/:orderId/deliver-test
 * Marks a specific outsource test type as delivered without requiring a report.
 * If all test types are now complete (reports + outsource delivery), promotes the order to 'ready'.
 */
async function deliverTestType(req, res, next) {
  try {
    const { testType } = req.body;
    if (!testType) return res.status(400).json({ message: 'testType is required.' });

    const order = await Order.findOne({ _id: req.params.orderId, labId: req.user.labId });
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    if (!order.testTypes.includes(testType))
      return res.status(400).json({ message: 'testType not in this order.' });

    // Add to outsourceDeliveredTestTypes (idempotent)
    if (!order.outsourceDeliveredTestTypes.includes(testType)) {
      order.outsourceDeliveredTestTypes.push(testType);
    }

    // Check if all tests are now done (reports + outsource delivered)
    const reportsDone = await Report.find({ orderId: order._id }).select('testType').lean();
    const doneSet = new Set([
      ...reportsDone.map((r) => r.testType),
      ...order.outsourceDeliveredTestTypes,
    ]);
    if (order.testTypes.every((t) => doneSet.has(t))) {
      order.status = 'ready';
    }

    await order.save();
    return res.json({ order });
  } catch (err) { next(err); }
}

/**
 * PATCH /api/orders/:orderId/cancel
 * Admin-only soft-cancel. Sets cancelledAt so the order is hidden from the queue
 * and excluded from sales figures.
 */
async function cancelOrder(req, res, next) {
  try {
    const order = await Order.findOne({ _id: req.params.orderId, labId: req.user.labId });
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    if (order.cancelledAt) return res.status(400).json({ message: 'Order is already cancelled.' });

    order.cancelledAt = new Date();
    order.cancelledBy = req.user.userId;
    await order.save();

    return res.json({ message: 'Order cancelled.', order });
  } catch (err) { next(err); }
}

module.exports = { createOrder, listOrders, markDelivered, deliverTestType, cancelOrder };
