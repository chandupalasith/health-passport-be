const Order            = require('../models/Order');
const TestTemplate     = require('../models/TestTemplate');
const CollectingCenter = require('../models/CollectingCenter');

/**
 * GET /api/sales?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Returns sales summary, breakdown by test type, and daily revenue.
 * Admin only.
 */
async function getSales(req, res, next) {
  try {
    const { startDate, endDate, collectingCenterId } = req.query;

    // ── Date filter ───────────────────────────────────────────────────────────
    const orderFilter = { labId: req.user.labId };

    // ── Branch filter ─────────────────────────────────────────────────────────
    if (collectingCenterId && collectingCenterId !== 'all') {
      orderFilter.collectingCenterId = collectingCenterId === 'none'
        ? null
        : collectingCenterId;
    }
    if (startDate || endDate) {
      orderFilter.orderedAt = {};
      if (startDate) orderFilter.orderedAt.$gte = new Date(startDate + 'T00:00:00.000Z');
      if (endDate)   orderFilter.orderedAt.$lte = new Date(endDate   + 'T23:59:59.999Z');
    }

    // ── Fetch orders + templates in parallel ──────────────────────────────────
    const [orders, templates, centers] = await Promise.all([
      Order.find(orderFilter).select('testTypes orderedAt status').lean(),
      TestTemplate.find({ $or: [{ labId: req.user.labId }, { labId: null }] })
        .select('testType shortName price margin labId').lean(),
      CollectingCenter.find({ labId: req.user.labId }).select('name').sort({ name: 1 }).lean(),
    ]);

    // ── Build price + margin maps (lab override wins over system default) ─────
    const priceMap     = new Map();
    const marginMap    = new Map();
    const shortNameMap = new Map();
    templates.filter((t) => !t.labId).forEach((t) => {
      priceMap.set(t.testType,     t.price     || 0);
      marginMap.set(t.testType,    t.margin    || 0);
      shortNameMap.set(t.testType, t.shortName || t.testType);
    });
    templates.filter((t) =>  t.labId).forEach((t) => {
      priceMap.set(t.testType,     t.price     || 0);
      marginMap.set(t.testType,    t.margin    || 0);
      shortNameMap.set(t.testType, t.shortName || t.testType);
    });

    // ── Aggregate ─────────────────────────────────────────────────────────────
    const byTestType = new Map();
    const byDate     = new Map();
    let totalRevenue = 0;
    let totalNet     = 0;
    let totalTests   = 0;

    for (const order of orders) {
      const d       = new Date(order.orderedAt);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      for (const testType of (order.testTypes || [])) {
        const unitPrice = priceMap.get(testType)  || 0;
        const margin    = marginMap.get(testType)  || 0;
        // margin > 0 means outsourced — lab keeps margin% of price; otherwise lab keeps full price
        const unitNet   = margin > 0 ? unitPrice * margin / 100 : unitPrice;

        // By test type
        if (!byTestType.has(testType)) {
          byTestType.set(testType, {
            testType,
            shortName: shortNameMap.get(testType) || testType,
            count:     0,
            unitPrice,
            margin,
            total:     0,
            netTotal:  0,
          });
        }
        const tt = byTestType.get(testType);
        tt.count    += 1;
        tt.total    += unitPrice;
        tt.netTotal += unitNet;

        // By date
        if (!byDate.has(dateKey)) {
          byDate.set(dateKey, { date: dateKey, tests: 0, revenue: 0, netRevenue: 0 });
        }
        const day = byDate.get(dateKey);
        day.tests      += 1;
        day.revenue    += unitPrice;
        day.netRevenue += unitNet;

        totalRevenue += unitPrice;
        totalNet     += unitNet;
        totalTests   += 1;
      }
    }

    return res.json({
      summary: {
        totalRevenue,
        netRevenue: totalNet,
        totalTests,
        orderCount: orders.length,
      },
      byTestType:        [...byTestType.values()].sort((a, b) => b.total - a.total),
      byDate:            [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
      collectingCenters: centers,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getSales };
