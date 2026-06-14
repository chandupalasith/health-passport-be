const crypto       = require('crypto');
const Report       = require('../models/Report');
const Order        = require('../models/Order');
const Lab          = require('../models/Lab');
const Patient      = require('../models/Patient');
const TestTemplate = require('../models/TestTemplate');
const { sendSMS }  = require('../services/sms');

// ── Staff endpoints (require verifyToken) ──────────────────────────────────

/**
 * POST /api/reports
 * Body: { orderId, testType, results: { [fieldName]: value } }
 */
async function createReport(req, res, next) {
  try {
    const { orderId, testType, results, comment } = req.body;
    if (!orderId || !testType)
      return res.status(400).json({ message: 'orderId and testType are required.' });

    const order = await Order.findOne({ _id: orderId, labId: req.user.labId });
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    const duplicate = await Report.findOne({ orderId, testType });
    if (duplicate)
      return res.status(409).json({ message: 'Results already submitted for this test.', report: duplicate });

    const report = await Report.create({
      orderId,
      labId:       req.user.labId,
      patientId:   order.patientId,
      testType,
      results:     results ?? {},
      comment:     (comment || '').trim(),
      accessToken: crypto.randomUUID(),
      submittedAt: new Date(),
      submittedBy: req.user.userId,
    });

    const reportCount = await Report.countDocuments({ orderId });
    if (reportCount >= order.testTypes.length)
      await Order.findByIdAndUpdate(orderId, { status: 'submitted' });

    return res.status(201).json({ report });
  } catch (err) { next(err); }
}

/**
 * GET /api/reports
 *
 * Queue use (orderId present):
 *   ?orderId=xxx  — returns reports for one order (no patient population)
 *
 * Admin dashboard use (date / search present):
 *   ?date=today|7days|custom
 *   ?startDate=ISO  &endDate=ISO   (custom range)
 *   ?search=text    — filters by patient name or mobile (case-insensitive)
 *   ?page=1         — 1-based page number (default 1, 50 per page)
 *
 * Admin rows include patientId populated with { name, mobile }.
 */
async function listReports(req, res, next) {
  try {
    const labId = req.user.labId;
    const { orderId, date, startDate, endDate, search, page = '1' } = req.query;

    // ── Simple queue use ──────────────────────────────────────────────────────
    if (orderId) {
      const reports = await Report.find({ labId, orderId })
        .select('testType accessToken submittedAt smsSentAt orderId')
        .sort({ submittedAt: -1 });
      return res.json({ reports });
    }

    // ── Admin dashboard use ───────────────────────────────────────────────────
    const filter = { labId };

    // Date range
    if (date === 'today' || !date) {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      filter.submittedAt = { $gte: todayStart };
    } else if (date === '7days') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      d.setUTCHours(0, 0, 0, 0);
      filter.submittedAt = { $gte: d };
    } else if (date === 'custom' && startDate && endDate) {
      filter.submittedAt = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setUTCHours(23, 59, 59, 999)),
      };
    }

    // Search: match patient name/mobile OR bill number
    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const [patients, matchedOrders] = await Promise.all([
        Patient.find({ labId, $or: [{ name: regex }, { mobile: regex }] }).select('_id'),
        Order.find({ labId, billNo: { $regex: regex } }).select('_id'),
      ]);
      filter.$or = [
        { patientId: { $in: patients.map((p) => p._id) } },
        { orderId:   { $in: matchedOrders.map((o) => o._id) } },
      ];
    }

    const limit = 50;
    const skip  = (parseInt(page, 10) - 1) * limit;

    const [reports, total] = await Promise.all([
      Report.find(filter)
        .populate('patientId',  'name mobile')
        .populate('submittedBy', 'name')
        .select('testType accessToken submittedAt smsSentAt orderId patientId submittedBy')
        .sort({ submittedAt: -1 })
        .skip(skip)
        .limit(limit),
      Report.countDocuments(filter),
    ]);

    return res.json({ reports, total, page: parseInt(page, 10), pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
}

/**
 * POST /api/reports/:reportId/send-sms
 * Sends the patient link via Dialog eSMS (with Notify.lk fallback).
 * Message: "Dear {patientName}, your {testType} report from {labName} is ready. View here: {link}"
 */
async function sendReportSms(req, res, next) {
  try {
    const report = await Report.findOne({ _id: req.params.reportId, labId: req.user.labId })
      .populate('patientId', 'name mobile')
      .populate('labId',     'name smsCredits');

    if (!report) return res.status(404).json({ message: 'Report not found.' });

    const patient = report.patientId;
    const lab     = report.labId;

    const BASE_URL  = process.env.FRONTEND_URL || 'https://healthpassport.lk';
    const reportUrl = `${BASE_URL}/r/${report.accessToken}`;

    const message = `Dear ${patient.name}, your ${report.testType} report from ${lab.name} is ready. View here: ${reportUrl}`;

    const result = await sendSMS(patient.mobile, message, lab._id);

    await Report.findByIdAndUpdate(report._id, { smsSentAt: new Date() });
    await Order.findByIdAndUpdate(report.orderId, { status: 'sent' });

    return res.json({
      message:    'SMS sent successfully.',
      provider:   result.provider,
      reportUrl,
    });
  } catch (err) {
    // Return 502 so the frontend can display the error without crashing
    return res.status(502).json({ message: err.message });
  }
}

// ── Public endpoint (no auth) ──────────────────────────────────────────────

/**
 * GET /api/public/report/:token
 * Patient-facing. Returns only the data needed to render the report.
 * No internal IDs, no other patient records.
 */
const DEFAULT_COLUMNS = [
  { key: 'result',   label: 'Result',          columnType: 'builtin' },
  { key: 'unit',     label: 'Unit',            columnType: 'builtin' },
  { key: 'refRange', label: 'Reference Range', columnType: 'builtin' },
  { key: 'flag',     label: 'Flag',            columnType: 'builtin' },
];

async function getPublicReport(req, res, next) {
  try {
    const report = await Report.findOne({ accessToken: req.params.token })
      .populate('patientId',  'name mobile dob ageAtRegistration gender')
      .populate('labId',      'name address phone logoUrl reportFooter printLetterheadUrl printLetterheadPaddingTop printLetterheadPaddingBottom smsLetterheadUrl smsLetterheadPaddingTop smsLetterheadPaddingBottom')
      .populate('orderId',    'refDoctor sampleType billNo orderedAt')
      .populate('submittedBy','name');

    if (!report) return res.status(404).json({ message: 'Report not found.' });

    // Resolve template: lab-specific override → system default
    const template =
      (await TestTemplate.findOne({ labId: report.labId._id, testType: report.testType })
        .populate('category', 'name color')) ??
      (await TestTemplate.findOne({ labId: null, testType: report.testType })
        .populate('category', 'name color'));

    const templateFields  = template?.fields   ?? [];
    const templateColumns = (template?.columns && template.columns.length)
      ? template.columns
      : DEFAULT_COLUMNS;

    const patient = report.patientId;
    const lab     = report.labId;
    const order   = report.orderId;   // populated

    return res.json({
      report: {
        testType:      report.testType,
        testShortName: template?.shortName ?? '',
        submittedAt:   report.submittedAt,
        results:       Object.fromEntries(report.results),

        templateFields,
        templateColumns,

        patient: {
          name:              patient.name,
          dob:               patient.dob              ?? null,
          ageAtRegistration: patient.ageAtRegistration ?? null,
          gender:            patient.gender            ?? null,
        },

        // Order-level header fields
        order: {
          refDoctor:      order?.refDoctor  ?? '',
          sampleType:     order?.sampleType ?? '',
          billNo:         order?.billNo     ?? '',
          collectionDate: order?.orderedAt  ?? null,
        },

        lab: {
          name:         lab.name,
          address:      lab.address    ?? '',
          phone:        lab.phone      ?? '',
          logoUrl:      lab.logoUrl    ?? null,
          reportFooter: lab.reportFooter ?? '',
          printLetterheadUrl:           lab.printLetterheadUrl           ?? null,
          printLetterheadPaddingTop:    lab.printLetterheadPaddingTop    ?? 120,
          printLetterheadPaddingBottom: lab.printLetterheadPaddingBottom ?? 60,
          smsLetterheadUrl:             lab.smsLetterheadUrl             ?? null,
          smsLetterheadPaddingTop:      lab.smsLetterheadPaddingTop      ?? 120,
          smsLetterheadPaddingBottom:   lab.smsLetterheadPaddingBottom   ?? 60,
        },
        comment:  report.comment ?? '',
        signedBy: report.submittedBy?.name ?? '',
      },
    });
  } catch (err) { next(err); }
}

module.exports = { createReport, listReports, sendReportSms, getPublicReport };
