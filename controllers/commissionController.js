const mongoose     = require('mongoose');
const Order        = require('../models/Order');
const Doctor       = require('../models/Doctor');
const TestTemplate = require('../models/TestTemplate');

async function getDoctorCommission(req, res, next) {
  try {
    const labId = req.user.labId;
    const { doctorId, startDate, endDate } = req.query;

    if (!doctorId) return res.status(400).json({ message: 'doctorId is required.' });
    if (!mongoose.Types.ObjectId.isValid(doctorId))
      return res.status(400).json({ message: 'Invalid doctorId.' });

    const doctorOid = new mongoose.Types.ObjectId(doctorId);
    const doctor = await Doctor.findOne({ _id: doctorOid, labId });
    if (!doctor) return res.status(404).json({ message: 'Doctor not found.' });

    const filter = { labId, refDoctorId: doctorOid };
    if (startDate || endDate) {
      filter.orderedAt = {};
      if (startDate) filter.orderedAt.$gte = new Date(startDate);
      if (endDate)   filter.orderedAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    const orders = await Order.find(filter).select('testTypes orderedAt');

    // Count per test type
    const countMap = {};
    orders.forEach((o) => {
      o.testTypes.forEach((tt) => {
        countMap[tt] = (countMap[tt] || 0) + 1;
      });
    });

    const testTypes = Object.keys(countMap);
    if (testTypes.length === 0) {
      return res.json({ doctor, items: [], totalOrders: orders.length, totalTests: 0, grandTotal: 0 });
    }

    // Resolve prices: lab override takes priority over system default
    const [labTpls, sysTpls] = await Promise.all([
      TestTemplate.find({ labId, testType: { $in: testTypes } }).select('testType shortName price'),
      TestTemplate.find({ labId: null, testType: { $in: testTypes } }).select('testType shortName price'),
    ]);

    const priceMap = {};
    sysTpls.forEach((t) => { priceMap[t.testType] = { price: t.price ?? 0, shortName: t.shortName || t.testType }; });
    labTpls.forEach((t) => { priceMap[t.testType] = { price: t.price ?? 0, shortName: t.shortName || t.testType }; });

    const items = testTypes.map((tt) => {
      const count     = countMap[tt];
      const unitPrice = priceMap[tt]?.price    ?? 0;
      const label     = priceMap[tt]?.shortName ?? tt;
      return { testType: tt, label, count, unitPrice, total: unitPrice * count };
    }).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));

    const grandTotal = items.reduce((s, i) => s + i.total, 0);
    const totalTests = items.reduce((s, i) => s + i.count, 0);

    return res.json({ doctor, items, totalOrders: orders.length, totalTests, grandTotal });
  } catch (err) { next(err); }
}

async function listDoctorSummaries(req, res, next) {
  try {
    const labId = req.user.labId;
    const { startDate, endDate } = req.query;

    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate)   dateFilter.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));

    const filter = { labId, refDoctorId: { $ne: null } };
    if (startDate || endDate) filter.orderedAt = dateFilter;

    const [orders, doctors] = await Promise.all([
      Order.find(filter).select('refDoctorId testTypes'),
      Doctor.find({ labId }).select('name specialty'),
    ]);

    const doctorMap = Object.fromEntries(doctors.map((d) => [d._id.toString(), d]));

    const summary = {};
    orders.forEach((o) => {
      const id = o.refDoctorId?.toString();
      if (!id || !doctorMap[id]) return;
      if (!summary[id]) summary[id] = { doctor: doctorMap[id], testCount: 0 };
      summary[id].testCount += o.testTypes.length;
    });

    const list = Object.values(summary).sort((a, b) => b.testCount - a.testCount);
    return res.json({ summaries: list });
  } catch (err) { next(err); }
}

module.exports = { getDoctorCommission, listDoctorSummaries };
