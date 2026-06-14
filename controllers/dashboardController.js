const Report = require('../models/Report');
const Order  = require('../models/Order');

/**
 * GET /api/dashboard/stats
 * Returns counts for the summary cards on the admin dashboard.
 */
async function getStats(req, res, next) {
  try {
    const labId = req.user.labId;

    // Midnight of the current day (server local time → use UTC for consistency)
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const [totalReportsToday, pendingOrders, smsSentToday] = await Promise.all([
      Report.countDocuments({ labId, submittedAt: { $gte: todayStart } }),
      Order.countDocuments({ labId, status: 'pending' }),
      Report.countDocuments({ labId, smsSentAt: { $gte: todayStart } }),
    ]);

    return res.json({ totalReportsToday, pendingOrders, smsSentToday });
  } catch (err) { next(err); }
}

module.exports = { getStats };
