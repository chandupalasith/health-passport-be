const mongoose = require('mongoose');

/**
 * Immutable top-up record — one document per credit addition.
 * Super admin tops up a lab; each action is stored here for audit trail.
 */
const smsTopupSchema = new mongoose.Schema({
  labId:           { type: mongoose.Schema.Types.ObjectId, ref: 'Lab',  required: true, index: true },
  creditsAdded:    { type: Number, required: true, min: 1 },
  previousBalance: { type: Number, required: true, min: 0 },
  newBalance:      { type: Number, required: true, min: 0 },
  topUpBy:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  topUpAt:         { type: Date, default: Date.now },
  notes:           { type: String, trim: true },
});

module.exports = mongoose.model('SmsTopup', smsTopupSchema);
