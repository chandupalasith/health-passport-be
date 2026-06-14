const mongoose = require('mongoose');

/**
 * Test categories — a lab admin creates these first, then assigns tests to them.
 * labId: null  = system-wide default visible to every lab.
 */
const testCategorySchema = new mongoose.Schema({
  labId: {
    type:    mongoose.Schema.Types.ObjectId,
    ref:     'Lab',
    default: null,
    index:   true,
  },
  name:      { type: String, required: true, trim: true },
  color:     { type: String, default: '#6b7280' },   // hex colour for UI badges
  sortOrder: { type: Number, default: 0 },
}, { timestamps: true });

// Unique category name per lab (null = system default)
testCategorySchema.index({ labId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('TestCategory', testCategorySchema);
