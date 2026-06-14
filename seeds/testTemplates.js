/**
 * Seed script — system-default TestTemplates
 * Usage:  node seeds/testTemplates.js
 *
 * Requires categories to already exist (run testCategories.js first).
 * Uses replaceOne / upsert so the script is fully idempotent and
 * will refresh existing docs with the latest column + field definitions.
 * labId: null  →  visible to every lab as a system default.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose     = require('mongoose');
const TestTemplate = require('../models/TestTemplate');
const TestCategory = require('../models/TestCategory');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/health-passport';

// Convenience builders
const cols = (...keys) => {
  const MAP = {
    result:   { label: 'Result',          columnType: 'builtin' },
    unit:     { label: 'Unit',            columnType: 'builtin' },
    refRange: { label: 'Reference Range', columnType: 'builtin' },
    percent:  { label: '%',               columnType: 'builtin' },
    flag:     { label: 'Flag',            columnType: 'builtin' },
  };
  return keys.map((k) => ({ key: k, ...MAP[k] }));
};

const field  = (name, unit, m, f, opts = {}) => ({ name, unit, refRangeMale: m, refRangeFemale: f, ...opts });
const header = (name)                          => ({ name, unit: '', refRangeMale: '', refRangeFemale: '', isHeader: true });
const sub    = (name, unit, m, f)              => field(name, unit, m, f, { isSubField: true });

// ---------------------------------------------------------------------------

const TEMPLATES = (catMap) => [

  // ── 1. Full Blood Count (FBC) ──────────────────────────────────────────────
  {
    testType:   'FBC',
    shortName:  'FBC',
    category:   catMap['Blood'],
    sampleType: 'EDTA Whole Blood',
    columns: cols('result', 'unit', 'refRange', 'percent', 'flag'),
    fields: [
      field('WBC',        '10³/µL', '4.0 - 11.0',  '4.0 - 11.0'),
      field('RBC',        '10⁶/µL', '4.5 - 5.9',   '3.8 - 5.2'),
      field('Hemoglobin', 'g/dL',   '13.5 - 17.5', '12.0 - 16.0'),
      field('Hematocrit', '%',       '41 - 53',      '36 - 46'),
      field('MCV',        'fL',      '80 - 100',     '80 - 100'),
      field('MCH',        'pg',      '27 - 33',      '27 - 33'),
      field('MCHC',       'g/dL',   '32 - 36',      '32 - 36'),
      field('RDW',        '%',       '11.5 - 14.5',  '11.5 - 14.5'),
      field('Platelets',  '10³/µL', '150 - 400',    '150 - 400'),
      field('MPV',        'fL',      '7.5 - 12.5',   '7.5 - 12.5'),
      header('DIFFERENTIAL COUNT'),
      sub('Neutrophils', '10³/µL', '1.8 - 7.5',  '1.8 - 7.5'),
      sub('Lymphocytes', '10³/µL', '1.0 - 4.0',  '1.0 - 4.0'),
      sub('Monocytes',   '10³/µL', '0.2 - 1.0',  '0.2 - 1.0'),
      sub('Eosinophils', '10³/µL', '0.0 - 0.7',  '0.0 - 0.7'),
      sub('Basophils',   '10³/µL', '0.0 - 0.1',  '0.0 - 0.1'),
    ],
  },

  // ── 2. Lipid Profile ──────────────────────────────────────────────────────
  {
    testType:   'Lipid Profile',
    shortName:  'LP',
    category:   catMap['Blood'],
    sampleType: 'Serum (Fasting)',
    columns: cols('result', 'unit', 'refRange', 'flag'),
    fields: [
      field('Total Cholesterol',   'mg/dL', '< 200',  '< 200'),
      field('LDL Cholesterol',     'mg/dL', '< 100',  '< 100'),
      field('HDL Cholesterol',     'mg/dL', '> 40',   '> 50'),
      field('Triglycerides',       'mg/dL', '< 150',  '< 150'),
      field('VLDL Cholesterol',    'mg/dL', '2 - 30', '2 - 30'),
      field('Non-HDL Cholesterol', 'mg/dL', '< 130',  '< 130'),
    ],
  },

  // ── 3. Lipid Panel (alias for backward compat) ───────────────────────────
  {
    testType:   'Lipid Panel',
    shortName:  'LP',
    category:   catMap['Blood'],
    sampleType: 'Serum (Fasting)',
    columns: cols('result', 'unit', 'refRange', 'flag'),
    fields: [
      field('Total Cholesterol',   'mg/dL', '< 200',  '< 200'),
      field('LDL Cholesterol',     'mg/dL', '< 100',  '< 100'),
      field('HDL Cholesterol',     'mg/dL', '> 40',   '> 50'),
      field('Triglycerides',       'mg/dL', '< 150',  '< 150'),
      field('VLDL Cholesterol',    'mg/dL', '2 - 30', '2 - 30'),
      field('Non-HDL Cholesterol', 'mg/dL', '< 130',  '< 130'),
    ],
  },

  // ── 4. Urine Full Report ──────────────────────────────────────────────────
  {
    testType:   'Urine Full Report',
    shortName:  'UFR',
    category:   catMap['Urine'],
    sampleType: 'Mid-stream Urine',
    columns: cols('result', 'refRange'),
    fields: [
      header('PHYSICAL EXAMINATION'),
      field('Colour',             '', 'Yellow',        'Yellow'),
      field('Appearance',         '', 'Clear',         'Clear'),
      field('pH',                 '', '4.5 - 8.0',     '4.5 - 8.0'),
      field('Specific Gravity',   '', '1.005 - 1.030', '1.005 - 1.030'),
      header('CHEMICAL EXAMINATION'),
      field('Protein',            '', 'Negative',      'Negative'),
      field('Glucose',            '', 'Negative',      'Negative'),
      field('Ketones',            '', 'Negative',      'Negative'),
      field('Blood',              '', 'Negative',      'Negative'),
      field('Bilirubin',          '', 'Negative',      'Negative'),
      field('Urobilinogen',       'EU/dL', '0.2 - 1.0', '0.2 - 1.0'),
      field('Nitrite',            '', 'Negative',      'Negative'),
      field('Leukocyte Esterase', '', 'Negative',      'Negative'),
      header('MICROSCOPIC EXAMINATION'),
      field('RBC',                '/HPF', '0 - 2',  '0 - 2'),
      field('WBC / Pus Cells',    '/HPF', '0 - 5',  '0 - 5'),
      field('Epithelial Cells',   '/HPF', '0 - 5',  '0 - 5'),
      field('Casts',              '/LPF', 'Nil',    'Nil'),
      field('Crystals',           '',     'Nil',    'Nil'),
    ],
  },

  // ── 5. Liver Function Test (LFT) ──────────────────────────────────────────
  {
    testType:   'LFT',
    shortName:  'LFT',
    category:   catMap['Blood'],
    sampleType: 'Serum',
    columns: cols('result', 'unit', 'refRange', 'flag'),
    fields: [
      field('Total Bilirubin',    'mg/dL', '0.2 - 1.2', '0.2 - 1.2'),
      field('Direct Bilirubin',   'mg/dL', '0.0 - 0.3', '0.0 - 0.3'),
      field('Indirect Bilirubin', 'mg/dL', '0.1 - 0.9', '0.1 - 0.9'),
      field('AST (SGOT)',         'U/L',   '10 - 40',    '10 - 35'),
      field('ALT (SGPT)',         'U/L',   '7 - 56',     '7 - 45'),
      field('ALP',                'U/L',   '44 - 147',   '44 - 147'),
      field('GGT',                'U/L',   '9 - 48',     '5 - 36'),
      field('Total Protein',      'g/dL',  '6.0 - 8.3',  '6.0 - 8.3'),
      field('Albumin',            'g/dL',  '3.5 - 5.0',  '3.5 - 5.0'),
      field('Globulin',           'g/dL',  '2.0 - 3.5',  '2.0 - 3.5'),
      field('A/G Ratio',          '',      '1.0 - 2.5',  '1.0 - 2.5'),
    ],
  },

  // ── 6. Blood Sugar (Fasting) ──────────────────────────────────────────────
  {
    testType:   'Blood Sugar (Fasting)',
    shortName:  'FBS',
    category:   catMap['Blood'],
    sampleType: 'Serum (Fasting)',
    columns: cols('result', 'unit', 'refRange', 'flag'),
    fields: [
      field('Fasting Blood Sugar', 'mg/dL', '70 - 100', '70 - 100'),
      field('HbA1c',               '%',      '< 5.7',    '< 5.7'),
    ],
  },

  // ── 7. Blood Sugar (Random) ───────────────────────────────────────────────
  {
    testType:   'Blood Sugar (Random)',
    shortName:  'RBS',
    category:   catMap['Blood'],
    sampleType: 'Serum',
    columns: cols('result', 'unit', 'refRange', 'flag'),
    fields: [
      field('Random Blood Sugar', 'mg/dL', '< 200', '< 200'),
    ],
  },

  // ── 8. Thyroid Function (TFT) ─────────────────────────────────────────────
  {
    testType:   'Thyroid Function (TFT)',
    shortName:  'TFT',
    category:   catMap['Hormone'],
    sampleType: 'Serum',
    columns: cols('result', 'unit', 'refRange', 'flag'),
    fields: [
      field('TSH',      'mIU/L', '0.4 - 4.0',  '0.4 - 4.0'),
      field('T3 Total', 'ng/dL', '80 - 200',    '80 - 200'),
      field('T4 Total', 'µg/dL', '5.1 - 14.1',  '5.1 - 14.1'),
      field('Free T3',  'pg/mL', '2.3 - 4.2',   '2.3 - 4.2'),
      field('Free T4',  'ng/dL', '0.8 - 1.8',   '0.8 - 1.8'),
    ],
  },

  // ── 9. Renal Function Test (RFT) ──────────────────────────────────────────
  {
    testType:   'Renal Function Test (RFT)',
    shortName:  'RFT',
    category:   catMap['Blood'],
    sampleType: 'Serum',
    columns: cols('result', 'unit', 'refRange', 'flag'),
    fields: [
      field('Serum Urea',       'mg/dL',           '7 - 25',    '7 - 25'),
      field('Serum Creatinine', 'mg/dL',           '0.7 - 1.2', '0.5 - 1.1'),
      field('Uric Acid',        'mg/dL',           '3.4 - 7.0', '2.4 - 6.0'),
      field('eGFR',             'mL/min/1.73m²',   '> 60',      '> 60'),
      field('BUN',              'mg/dL',           '6 - 20',    '6 - 20'),
    ],
  },
];

// ---------------------------------------------------------------------------

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // Build name → ObjectId map from system categories
  const cats = await TestCategory.find({ labId: null }).select('name _id');
  if (cats.length === 0) {
    console.error('No system categories found — run testCategories.js first!');
    process.exit(1);
  }

  const catMap = {};
  cats.forEach((c) => { catMap[c.name] = c._id; });
  console.log('Category map:', Object.fromEntries(Object.entries(catMap).map(([k, v]) => [k, v.toString()])));

  const templates = TEMPLATES(catMap);

  let created = 0;
  let updated = 0;

  for (const tpl of templates) {
    const filter = { labId: null, testType: tpl.testType };
    const doc    = { labId: null, ...tpl };

    const result = await TestTemplate.replaceOne(filter, doc, { upsert: true });

    if (result.upsertedCount) {
      console.log(`  ✓ Created: ${tpl.testType}`);
      created++;
    } else {
      console.log(`  ↺ Updated: ${tpl.testType}`);
      updated++;
    }
  }

  console.log(`\nDone — ${created} created, ${updated} updated.`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
