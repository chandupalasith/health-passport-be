const Order            = require('../models/Order');
const TestTemplate     = require('../models/TestTemplate');
const CollectingCenter = require('../models/CollectingCenter');
const OutsourcePartner = require('../models/OutsourcePartner');

/**
 * GET /api/sales?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Returns sales summary, breakdown by test type, daily revenue, and partner breakdown.
 * Query params:
 *   startDate          — ISO date string
 *   endDate            — ISO date string
 *   collectingCenterId — ObjectId | 'none' | 'all'
 *   outsourcePartnerId — ObjectId (filter to orders containing this partner)
 * Admin only.
 */
async function getSales(req, res, next) {
  try {
    const { startDate, endDate, collectingCenterId, outsourcePartnerId, paymentMethod } = req.query;

    // ── Date filter ───────────────────────────────────────────────────────────
    const orderFilter = { labId: req.user.labId, cancelledAt: null };

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

    // ── Outsource partner filter ──────────────────────────────────────────────
    if (outsourcePartnerId && outsourcePartnerId !== 'all') {
      orderFilter['testMeta.partnerId'] = outsourcePartnerId;
    }

    // ── Payment method filter ─────────────────────────────────────────────────
    if (paymentMethod === 'cash' || paymentMethod === 'card') {
      orderFilter.paymentMethod = paymentMethod;
    }

    // ── Fetch orders, templates, centers, and partners in parallel ────────────
    const [orders, templates, centers, partners] = await Promise.all([
      Order.find(orderFilter).select('testTypes testMeta orderedAt status').lean(),
      TestTemplate.find({ $or: [{ labId: req.user.labId }, { labId: null }] })
        .select('testType shortName price margin labId').lean(),
      CollectingCenter.find({ labId: req.user.labId }).select('name').sort({ name: 1 }).lean(),
      OutsourcePartner.find({ labId: req.user.labId }).select('name').sort({ name: 1 }).lean(),
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
    const byTestType          = new Map();
    const providersByTestType = new Map(); // testType → Map(partnerKey → provider row)
    const byDate              = new Map();
    const byPartner           = new Map();
    let totalRevenue = 0;
    let totalNet     = 0;
    let totalTests   = 0;

    for (const order of orders) {
      const d       = new Date(order.orderedAt);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      // Build a map of testType → meta for this order (if testMeta present)
      const metaByType = new Map();
      if (Array.isArray(order.testMeta) && order.testMeta.length > 0) {
        for (const m of order.testMeta) {
          metaByType.set(m.testType, m);
        }
      }

      for (const testType of (order.testTypes || [])) {
        const meta = metaByType.get(testType);

        let unitPrice;
        let commissionRate;
        let partnerKey;
        let partnerName;

        if (meta) {
          // New orders with testMeta — use stored prices
          unitPrice      = meta.price          || 0;
          commissionRate = meta.commissionRate  || 0;
          partnerKey     = meta.partnerId ? String(meta.partnerId) : '__inhouse__';
          partnerName    = meta.partnerName  || (meta.partnerId ? 'Unknown Partner' : 'In-house');
        } else {
          // Legacy orders without testMeta — fall back to template
          unitPrice      = priceMap.get(testType)  || 0;
          // legacy margin field had the same meaning: % of price the lab keeps
          commissionRate = marginMap.get(testType)  || 0;
          partnerKey     = '__inhouse__';
          partnerName    = 'In-house';
        }

        // Net revenue: commissionRate% of price is what the lab keeps
        const unitNet = unitPrice * commissionRate / 100;

        // ── By test type ──────────────────────────────────────────────────────
        if (!byTestType.has(testType)) {
          byTestType.set(testType, {
            testType,
            shortName: shortNameMap.get(testType) || testType,
            count:     0,
            unitPrice,
            total:     0,
            netTotal:  0,
          });
        }
        const tt = byTestType.get(testType);
        tt.count    += 1;
        tt.total    += unitPrice;
        tt.netTotal += unitNet;

        // ── By provider within test type ──────────────────────────────────────
        if (!providersByTestType.has(testType)) providersByTestType.set(testType, new Map());
        const pvMap = providersByTestType.get(testType);
        if (!pvMap.has(partnerKey)) {
          pvMap.set(partnerKey, {
            partnerId:      partnerKey === '__inhouse__' ? null : partnerKey,
            partnerName:    partnerKey === '__inhouse__' ? 'Inhouse' : partnerName,
            count:          0,
            total:          0,
            netTotal:       0,
            commissionRate,
          });
        }
        const pv = pvMap.get(partnerKey);
        pv.count    += 1;
        pv.total    += unitPrice;
        pv.netTotal += unitNet;

        // ── By date ───────────────────────────────────────────────────────────
        if (!byDate.has(dateKey)) {
          byDate.set(dateKey, { date: dateKey, tests: 0, revenue: 0, netRevenue: 0 });
        }
        const day = byDate.get(dateKey);
        day.tests      += 1;
        day.revenue    += unitPrice;
        day.netRevenue += unitNet;

        // ── By partner ────────────────────────────────────────────────────────
        if (!byPartner.has(partnerKey)) {
          byPartner.set(partnerKey, {
            partnerId:   partnerKey === '__inhouse__' ? null : partnerKey,
            partnerName,
            count:       0,
            total:       0,
            netTotal:    0,
          });
        }
        const bp = byPartner.get(partnerKey);
        bp.count    += 1;
        bp.total    += unitPrice;
        bp.netTotal += unitNet;

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
      byTestType: [...byTestType.values()]
        .map((tt) => ({
          ...tt,
          byProvider: [...(providersByTestType.get(tt.testType)?.values() ?? [])],
        }))
        .sort((a, b) => b.total - a.total),
      byDate:            [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
      byPartner:         [...byPartner.values()].sort((a, b) => b.total - a.total),
      collectingCenters: centers,
      outsourcePartners: partners,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getSales };
