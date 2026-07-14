const crypto       = require('crypto');
const path         = require('path');
const fs           = require('fs');
const Report       = require('../models/Report');
const Order        = require('../models/Order');
const Lab          = require('../models/Lab');
const Patient      = require('../models/Patient');
const TestTemplate = require('../models/TestTemplate');
const { sendSMS }  = require('../services/sms');

/** Validate result values against template field types. Returns an error string or null. */
async function validateResults(labId, testType, results) {
  if (!results || typeof results !== 'object') return null;
  const template = await TestTemplate.findOne({ labId, testType }).lean()
    ?? await TestTemplate.findOne({ labId: null, testType }).lean();
  if (!template) return null;

  for (const field of template.fields ?? []) {
    if (field.isHeader || field.fieldType === 'formula' || field.fieldType === 'text') continue;
    const val = results[field.name];
    if (!val && val !== 0) continue; // empty allowed

    const ft = field.fieldType ?? 'decimal2';
    if (ft === 'integer' || ft === 'numeric') {
      if (!/^-?\d+$/.test(String(val).trim()))
        return `"${field.name}" requires a whole number (got: ${val})`;
    } else if (ft === 'decimal2' || ft === 'decimal4') {
      if (isNaN(parseFloat(String(val))))
        return `"${field.name}" requires a number (got: ${val})`;
    } else if (ft === 'dropdown') {
      const opts = field.dropdownOptions ?? [];
      if (opts.length > 0 && !opts.includes(String(val)))
        return `"${field.name}" has an invalid option (got: ${val})`;
    }
  }
  return null;
}

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

    const validationError = await validateResults(req.user.labId, testType, results);
    if (validationError) return res.status(400).json({ message: validationError });

    const meta = order.testMeta?.find((m) => m.testType === testType);

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
      partnerName: meta?.partnerName || '',
      price:       meta?.price       || 0,
    });

    // Promote to 'ready' only when every test type in the order has a report
    if (order.testTypes.length > 0) {
      const submitted = await Report.find({ orderId }).select('testType').lean();
      const submittedSet = new Set(submitted.map((r) => r.testType));
      if (order.testTypes.every((t) => submittedSet.has(t))) {
        await Order.findByIdAndUpdate(orderId, { status: 'ready' });
      }
    }

    return res.status(201).json({ report });
  } catch (err) { next(err); }
}

/**
 * PATCH /api/reports/:reportId
 * Body: { results, comment }
 * Updates results/comment on an existing report and invalidates the cached PDF.
 */
async function updateReport(req, res, next) {
  try {
    const { results, comment } = req.body;
    const report = await Report.findOne({ _id: req.params.reportId, labId: req.user.labId });
    if (!report) return res.status(404).json({ message: 'Report not found.' });

    if (results !== undefined) {
      const validationError = await validateResults(req.user.labId, report.testType, results);
      if (validationError) return res.status(400).json({ message: validationError });
      report.results = results;
    }
    if (comment !== undefined) report.comment = comment.trim();
    report.pdfUrl = null; // force PDF regeneration on next view

    await report.save();
    return res.json({ report });
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
        .select('testType accessToken submittedAt smsSentAt orderId results comment')
        .sort({ submittedAt: -1 });
      return res.json({ reports });
    }

    // ── Admin dashboard use ───────────────────────────────────────────────────
    const filter = { labId };

    // Date range
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();

    if (date === 'today' || !date) {
      filter.submittedAt = { $gte: new Date(y, m, d) };
    } else if (date === 'yesterday') {
      filter.submittedAt = {
        $gte: new Date(y, m, d - 1),
        $lte: new Date(y, m, d - 1, 23, 59, 59, 999),
      };
    } else if (date === '7days') {
      filter.submittedAt = { $gte: new Date(y, m, d - 7) };
    } else if (date === 'all') {
      // no date restriction — search across all records
    } else if (date === 'custom' && startDate && endDate) {
      filter.submittedAt = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
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
        .populate('orderId',     'billNo')
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
      .populate('patientId', 'name mobile noPhone')
      .populate('labId',     'name smsCredits');

    if (!report) return res.status(404).json({ message: 'Report not found.' });

    const patient = report.patientId;
    const lab     = report.labId;

    if (patient.noPhone || patient.mobile === '0000000000') {
      return res.status(400).json({ message: 'Cannot send SMS: this patient has no phone number on file.' });
    }

    const BASE_URL  = process.env.FRONTEND_URL || 'https://healthpassport.lk';
    const reportUrl = `${BASE_URL}/r/${report.accessToken}`;

    const message = `Dear ${patient.name}, your ${report.testType} report from ${lab.name} is ready. View here: ${reportUrl}`;

    const result = await sendSMS(patient.mobile, message, lab._id);

    await Report.findByIdAndUpdate(report._id, { smsSentAt: new Date() });

    // Mark order delivered only when every test has been SMS'd
    const orderDoc = await Order.findById(report.orderId).select('testTypes');
    if (orderDoc) {
      const sentReports = await Report.find({
        orderId: report.orderId,
        smsSentAt: { $ne: null },
      }).select('testType');
      const sentTypes = new Set(sentReports.map((r) => r.testType));
      if (orderDoc.testTypes.every((t) => sentTypes.has(t))) {
        await Order.findByIdAndUpdate(report.orderId, { status: 'delivered' });
      }
    }

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
      .populate('labId',      'name address phone logoUrl signatureUrl signatoryName signatoryPosition signatoryExtra signatoryFontSize printPaddingTop printPaddingBottom printShowSignatory reportFooter reportFooterSize reportAccentColor regNo regNoSize')
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
        results:       report.results ?? {},

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
          refDoctor:      order?.refDoctor  || 'N/A',
          sampleType:     order?.sampleType ?? '',
          billNo:         order?.billNo     ?? '',
          collectionDate: order?.orderedAt  ?? null,
        },

        lab: {
          name:               lab.name,
          address:            lab.address            ?? '',
          phone:              lab.phone              ?? '',
          logoUrl:            lab.logoUrl            ?? null,
          signatureUrl:       lab.signatureUrl       ?? null,
          signatoryName:      lab.signatoryName      ?? '',
          signatoryPosition:  lab.signatoryPosition  ?? '',
          signatoryExtra:     lab.signatoryExtra     ?? '',
          signatoryFontSize:  lab.signatoryFontSize  ?? 8,
          printPaddingTop:    lab.printPaddingTop    ?? 25,
          printPaddingBottom: lab.printPaddingBottom ?? 20,
          printShowSignatory: lab.printShowSignatory ?? true,
          reportFooter:       lab.reportFooter       ?? '',
          reportFooterSize:   lab.reportFooterSize   ?? 14,
          reportAccentColor:  lab.reportAccentColor  ?? '#1d4ed8',
          regNo:              lab.regNo              ?? '',
          regNoSize:          lab.regNoSize          ?? 8,
        },
        comment:  report.comment ?? '',
        signedBy: report.submittedBy?.name ?? '',
        token:    req.params.token,
      },
    });
  } catch (err) { next(err); }
}

// ── PDF endpoint (no auth) ────────────────────────────────────────────────────

/**
 * GET /api/public/report/:token/pdf
 * Generates the PDF on first request and caches the URL in report.pdfUrl.
 * Subsequent requests serve the cached file immediately.
 */
async function getReportPdf(req, res, next) {
  try {
    let report = await Report.findOne({ accessToken: req.params.token });
    if (!report) return res.status(404).json({ message: 'Report not found.' });

    // Regenerate if pdfUrl is a local path that no longer exists (e.g. dev server restart)
    if (report.pdfUrl && !report.pdfUrl.startsWith('http')) {
      const localPath = path.join(__dirname, '..', report.pdfUrl);
      if (!fs.existsSync(localPath)) {
        await Report.findByIdAndUpdate(report._id, { pdfUrl: null });
        report.pdfUrl = null;
      }
    }

    if (!report.pdfUrl) {
      const full = await Report.findOne({ accessToken: req.params.token })
        .populate('patientId',   'name mobile dob ageAtRegistration gender')
        .populate('labId',       'name address phone logoUrl signatureUrl signatoryName signatoryPosition signatoryExtra signatoryFontSize reportFooter reportFooterSize reportAccentColor regNo regNoSize pdfLabNameSize pdfAddressSize pdfMetadataSize pdfTestHeadingSize pdfSectionHeaderSize pdfRowPadding pdfCommentsSize pdfFooterSize pdfLineColor pdfBadgeColor')
        .populate('orderId',     'refDoctor sampleType billNo orderedAt')
        .populate('submittedBy', 'name');

      const { generatePdf } = require('../services/pdfService');
      const pdfUrl = await generatePdf(full);
      await Report.findByIdAndUpdate(report._id, { pdfUrl });
      report.pdfUrl = pdfUrl;
    }

    const forDownload = req.query.dl === '1';

    // Build a sanitised filename: TestName_PatientName_BillNo.pdf
    const sanitize = (s) => (s || '').replace(/[^a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_');
    let pdfFilename = 'lab-report.pdf';
    if (forDownload) {
      const named = await Report.findOne({ accessToken: req.params.token })
        .populate('patientId', 'name')
        .populate('orderId',   'billNo');
      const parts = [
        sanitize(named.testType),
        sanitize(named.patientId?.name),
        sanitize(named.orderId?.billNo),
      ].filter(Boolean);
      if (parts.length) pdfFilename = parts.join('_') + '.pdf';
    }

    if (report.pdfUrl.startsWith('http')) {
      if (forDownload) {
        const nodeFetch = require('node-fetch');
        const s3Res = await nodeFetch(report.pdfUrl);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${pdfFilename}"`);
        return s3Res.body.pipe(res);
      }
      return res.redirect(302, report.pdfUrl);
    }

    const localPath = path.join(__dirname, '..', report.pdfUrl);
    const disposition = forDownload ? 'attachment' : 'inline';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename="${pdfFilename}"`);
    return res.sendFile(localPath);
  } catch (err) { next(err); }
}

module.exports = { createReport, updateReport, listReports, sendReportSms, getPublicReport, getReportPdf };
