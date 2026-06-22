'use strict';

const path         = require('path');
const fs           = require('fs');
const puppeteer    = require('puppeteer-core');
const handlebars   = require('handlebars');
const nodeFetch    = require('node-fetch');
const TestTemplate = require('../models/TestTemplate');

const USE_S3 = process.env.NODE_ENV === 'production' && !!process.env.AWS_S3_BUCKET;

// ── Template (compiled once on first use) ────────────────────────────────────

let _compiled = null;
function getTemplate() {
  if (!_compiled) {
    const src = fs.readFileSync(path.join(__dirname, '../templates/report.hbs'), 'utf-8');
    _compiled = handlebars.compile(src);
  }
  return _compiled;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDateTime(date) {
  if (!date) return '';
  return new Date(date).toLocaleString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function computeFlag(val, refMale, refFemale, gender) {
  const ref = gender === 'female' ? (refFemale || refMale) : (refMale || refFemale);
  if (!ref || !val) return '';
  const n = parseFloat(val);
  if (isNaN(n)) return '';

  const between = ref.match(/^([\d.]+)\s*[–\-]\s*([\d.]+)$/);
  if (between) return n < +between[1] ? 'L' : n > +between[2] ? 'H' : 'N';

  const lte = ref.match(/^<=\s*([\d.]+)/);
  if (lte) return n > +lte[1] ? 'H' : 'N';

  const lt = ref.match(/^<\s*([\d.]+)/);
  if (lt) return n >= +lt[1] ? 'H' : 'N';

  const gte = ref.match(/^>=\s*([\d.]+)/);
  if (gte) return n < +gte[1] ? 'L' : 'N';

  const gt = ref.match(/^>\s*([\d.]+)/);
  if (gt) return n <= +gt[1] ? 'L' : 'N';

  return '';
}

function resolveRefRange(field, gender) {
  const m = field.refRangeMale   || '';
  const f = field.refRangeFemale || '';
  if (gender === 'male')   return m || f;
  if (gender === 'female') return f || m;
  if (m === f || !f) return m;
  if (!m)            return f;
  return `${m} (M) / ${f} (F)`;
}

// ── Image resolution → base64 data URI ───────────────────────────────────────

async function resolveImageUrl(url) {
  if (!url) return null;

  if (url.startsWith('http')) {
    try {
      const resp = await nodeFetch(url, { timeout: 8000 });
      if (!resp.ok) return url;  // let Puppeteer fetch directly
      const buf = await resp.buffer();
      const ct  = resp.headers.get('content-type') || 'image/png';
      return `data:${ct};base64,${buf.toString('base64')}`;
    } catch {
      return url;  // let Puppeteer fetch directly
    }
  }

  // Local path e.g. /uploads/letterheads/filename.png
  const localPath = path.join(__dirname, '..', url);
  if (!fs.existsSync(localPath)) return null;
  const ext  = path.extname(localPath).slice(1).toLowerCase();
  const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[ext] ?? 'image/png';
  const buf  = fs.readFileSync(localPath);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

// ── PDF storage ───────────────────────────────────────────────────────────────

async function storePdf(pdfBuffer, labId, reportId) {
  if (USE_S3) {
    const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
    const s3  = new S3Client({ region: process.env.AWS_REGION });
    const key = `reports/${labId}_${reportId}.pdf`;
    await s3.send(new PutObjectCommand({
      Bucket:      process.env.AWS_S3_BUCKET,
      Key:         key,
      Body:        pdfBuffer,
      ContentType: 'application/pdf',
    }));
    return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  }

  const dir = path.join(__dirname, '../uploads/reports');
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${labId}_${reportId}.pdf`;
  fs.writeFileSync(path.join(dir, filename), pdfBuffer);
  return `/uploads/reports/${filename}`;
}

// ── Default columns (mirrors reportController) ────────────────────────────────

const DEFAULT_COLUMNS = [
  { key: 'result',   label: 'Result',          columnType: 'builtin' },
  { key: 'unit',     label: 'Unit',            columnType: 'builtin' },
  { key: 'refRange', label: 'Reference Range', columnType: 'builtin' },
  { key: 'flag',     label: 'Flag',            columnType: 'builtin' },
];

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Generates a PDF for the given populated report document and stores it.
 * @param {object} report — Mongoose doc populated with patientId, labId, orderId, submittedBy
 * @returns {Promise<string>} URL or local path where the PDF is stored
 */
async function generatePdf(report) {
  const patient = report.patientId;
  const lab     = report.labId;
  const order   = report.orderId;
  const gender  = patient.gender ?? null;
  const results = Object.fromEntries(report.results);

  // Resolve test template (lab-specific first, then system default)
  const tmpl =
    (await TestTemplate.findOne({ labId: lab._id, testType: report.testType })) ??
    (await TestTemplate.findOne({ labId: null,     testType: report.testType }));

  const templateFields  = tmpl?.fields   ?? [];
  const templateColumns = (tmpl?.columns && tmpl.columns.length) ? tmpl.columns : DEFAULT_COLUMNS;

  const showUnit   = templateColumns.some((c) => c.key === 'unit');
  const showRef    = templateColumns.some((c) => c.key === 'refRange');
  const showPct    = templateColumns.some((c) => c.key === 'percent');
  const showFlag   = templateColumns.some((c) => c.key === 'flag');
  const customCols = templateColumns.filter((c) => c.columnType === 'custom');
  const totalCols  = 2 + (showUnit?1:0) + (showRef?1:0) + (showPct?1:0) + (showFlag?1:0) + customCols.length;

  // Compute age display
  let ageDisplay = null;
  if (patient.ageAtRegistration != null) {
    ageDisplay = `${patient.ageAtRegistration} years`;
  } else if (patient.dob) {
    const birth = new Date(patient.dob);
    const ref   = new Date(report.submittedAt);
    let age = ref.getFullYear() - birth.getFullYear();
    const m = ref.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) age--;
    ageDisplay = `${age} years`;
  }

  // Build result rows
  let rows;
  if (templateFields.length > 0) {
    rows = templateFields.map((field) => {
      if (field.isHeader) return { isHeader: true, name: field.name };

      const val  = String(results[field.name]          ?? '');
      const pct  = String(results[`${field.name}:pct`] ?? '');
      const ref  = resolveRefRange(field, gender);
      const flag = computeFlag(val, field.refRangeMale ?? '', field.refRangeFemale ?? '', gender);

      return {
        isHeader:     false,
        name:         field.name,
        result:       val  || '—',
        unit:         field.unit || '—',
        refRange:     ref  || '—',
        pct:          pct  || '—',
        flag:         flag || '—',
        isOutOfRange: flag === 'H' || flag === 'L',
        isSubField:   Boolean(field.isSubField),
        customValues: customCols.map((c) => ({
          value: String(results[`${field.name}:${c.key}`] ?? '') || '—',
        })),
      };
    });
  } else {
    // Fallback: render raw results when no template is defined
    rows = Object.entries(results).map(([name, val]) => ({
      isHeader:     false,
      name,
      result:       String(val) || '—',
      unit:         '—',
      refRange:     '—',
      pct:          '—',
      flag:         '—',
      isOutOfRange: false,
      isSubField:   false,
      customValues: [],
    }));
  }

  // Resolve logo and signature to base64 data URIs so Puppeteer doesn't need network
  const [logoDataUrl, signatureDataUrl] = await Promise.all([
    resolveImageUrl(lab.logoUrl),
    resolveImageUrl(lab.signatureUrl),
  ]);

  const accent = lab.reportAccentColor || '#1d4ed8';
  const data = {
    lab: {
      name:              lab.name,
      contactLine:       [lab.address, lab.phone].filter(Boolean).join('   |   ') || null,
      reportFooter:      lab.reportFooter      || null,
      signatoryName:     lab.signatoryName     || null,
      signatoryPosition: lab.signatoryPosition || null,
      logoDataUrl,
      signatureDataUrl,
      lineColor:         lab.pdfLineColor  || accent,
      badgeColor:        lab.pdfBadgeColor || accent,
      labNameSize:       lab.pdfLabNameSize       ?? 17,
      addressSize:       lab.pdfAddressSize       ?? 8.5,
      metadataSize:      lab.pdfMetadataSize      ?? 10.5,
      testHeadingSize:   lab.pdfTestHeadingSize   ?? 9.5,
      sectionHeaderSize: lab.pdfSectionHeaderSize ?? 9.5,
      rowPadding:        lab.pdfRowPadding        ?? 2,
      commentsSize:      lab.pdfCommentsSize      ?? 8.5,
      footerSize:        lab.pdfFooterSize        ?? 7.5,
    },
    patient: {
      name:        patient.name,
      ageDisplay,
      genderLabel: gender === 'male' ? 'Male' : gender === 'female' ? 'Female' : null,
    },
    order: {
      refDoctor:      order?.refDoctor  || 'N/A',
      sampleType:     order?.sampleType || null,
      billNo:         order?.billNo     || null,
      collectionDate: order?.orderedAt  ? fmtDateTime(order.orderedAt) : null,
    },
    testType:      report.testType,
    testShortName: (tmpl?.shortName && tmpl.shortName !== report.testType) ? tmpl.shortName : null,
    submittedAt:   fmtDateTime(report.submittedAt),
    signedBy:      report.submittedBy?.name ?? '',
    comment:       report.comment || null,
    showUnit, showRef, showPct, showFlag,
    customColumns: customCols,
    totalCols,
    rows,
  };

  const html = getTemplate()(data);

  // Resolve Chrome executable — use system Chrome on Mac, chromium on Linux/AWS
  const executablePath = process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : process.env.CHROME_PATH || '/usr/bin/chromium-browser';

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format:          'A4',
      printBackground: true,
      margin:          { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return storePdf(Buffer.from(pdfBuffer), lab._id.toString(), report._id.toString());
  } finally {
    await browser.close();
  }
}

module.exports = { generatePdf };
