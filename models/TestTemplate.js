const mongoose = require('mongoose');

/**
 * Column definition.
 *
 * Built-in keys: 'result' | 'unit' | 'refRange' | 'percent' | 'flag'
 *   result   → dynamic  : technician enters value per field
 *   unit     → fixed    : auto-filled from field.unit
 *   refRange → auto     : resolved from template ref ranges
 *   percent  → dynamic  : technician enters % value (e.g. FBC differential)
 *   flag     → auto     : computed from result vs gender-appropriate ref range
 *
 * Custom columns (columnType: 'custom'):
 *   Admin defines any key + label; technician enters value per field row.
 *   Results stored as  results["FieldName:{columnKey}"]
 */
const columnSchema = new mongoose.Schema({
  key:        { type: String, required: true },   // built-in key OR custom key
  label:      { type: String, required: true },
  columnType: {
    type:    String,
    enum:    ['builtin', 'custom'],
    default: 'builtin',
  },
}, { _id: false });

/**
 * One row in the results table.
 *
 * Reference range format (string):
 *   "13.5 - 17.5"   between (inclusive)
 *   "< 200"         less than
 *   "<= 200"        less than or equal
 *   "> 40"          greater than
 *   ">= 40"         greater than or equal
 *   "Negative"      qualitative text (no numeric comparison)
 */
const refRangeSchema = new mongoose.Schema({
  rangeType:   { type: String, enum: ['none','between','lt','lte','gt','gte','qualitative'], default: 'none' },
  maleMin:     { type: String, default: '' },
  maleMax:     { type: String, default: '' },
  femaleMin:   { type: String, default: '' },
  femaleMax:   { type: String, default: '' },
  maleValue:   { type: String, default: '' },
  femaleValue: { type: String, default: '' },
  maleText:    { type: String, default: '' },
  femaleText:  { type: String, default: '' },
}, { _id: false });

const fieldSchema = new mongoose.Schema({
  name:             { type: String, required: true },
  fieldType:        { type: String, enum: ['numeric','integer','decimal2','decimal4','text','dropdown','formula'], default: 'decimal2' },
  formula:          { type: String, default: '' },
  formulaPrecision: { type: String, enum: ['integer','decimal2','decimal4'], default: 'decimal2' },
  dropdownOptions:  [{ type: String }],
  unit:             { type: String, default: '' },
  refRange:         { type: refRangeSchema, default: () => ({ rangeType: 'none' }) },
  refRangeMale:     { type: String, default: '' },   // legacy — kept for backward compat
  refRangeFemale:   { type: String, default: '' },   // legacy — kept for backward compat
  percentFormula:   { type: String, default: '' },
  flagEnabled:      { type: Boolean, default: true },
  customCells:      { type: mongoose.Schema.Types.Mixed, default: {} },
  isHeader:         { type: Boolean, default: false },
  isSubField:       { type: Boolean, default: false },
}, { _id: false });

const testTemplateSchema = new mongoose.Schema({
  // null = system-wide default visible to every lab
  labId: {
    type:    mongoose.Schema.Types.ObjectId,
    ref:     'Lab',
    default: null,
    index:   true,
  },
  testType:   { type: String, required: true, trim: true },
  shortName:  { type: String, default: '' },

  // Reference to TestCategory (_id)
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref:  'TestCategory',
    default: null,
  },

  sampleType:     { type: String, default: '' },
  price:          { type: Number, default: 0 },
  margin:         { type: Number, default: 0, min: 0, max: 100 },
  inhouseAvailable: { type: Boolean, default: true },
  partnerPricing: [{
    partnerId:      { type: mongoose.Schema.Types.ObjectId, ref: 'OutsourcePartner', required: true },
    price:          { type: Number, default: 0 },
    commissionRate: { type: Number, default: 0, min: 0, max: 100 },
    _id: false,
  }],
  defaultComment: { type: String, default: '' },
  columns:        [columnSchema],
  fields:         [fieldSchema],
  // Per-template PDF typography overrides. null = use lab default.
  pdfOverrides: {
    metadataSize:      { type: Number, default: null },
    testHeadingSize:   { type: Number, default: null },
    sectionHeaderSize: { type: Number, default: null },
    columnHeaderSize:  { type: Number, default: null },
    rowSize:           { type: Number, default: null },
    rowPadding:        { type: Number, default: null },
    tableSpacing:      { type: Number, default: null },
    commentsSize:      { type: Number, default: null },
  },
  // If non-empty, only these labs see this system template; empty = visible to all labs
  sharedWithLabs: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lab' }],
}, { timestamps: true });

testTemplateSchema.index({ labId: 1, testType: 1 }, { unique: true });

module.exports = mongoose.model('TestTemplate', testTemplateSchema);
