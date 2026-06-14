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
const fieldSchema = new mongoose.Schema({
  name:           { type: String, required: true },
  unit:           { type: String, default: '' },
  refRangeMale:   { type: String, default: '' },
  refRangeFemale: { type: String, default: '' },
  isHeader:       { type: Boolean, default: false },
  isSubField:     { type: Boolean, default: false },
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
  defaultComment: { type: String, default: '' },
  columns:        [columnSchema],
  fields:         [fieldSchema],
}, { timestamps: true });

testTemplateSchema.index({ labId: 1, testType: 1 }, { unique: true });

module.exports = mongoose.model('TestTemplate', testTemplateSchema);
