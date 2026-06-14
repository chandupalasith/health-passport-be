const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true,
  },
  labId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lab',
    required: true,
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
  },
  testType: { type: String, required: true, trim: true },
  // Flexible key-value store: { WBC: 6.2, RBC: 4.8, Hgb: "13.5" }
  results: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {},
  },
  // Unique random token embedded in the patient SMS link
  accessToken: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  // Free-text observations/comment printed at the bottom of the report
  comment:     { type: String, default: '' },
  submittedAt: { type: Date },
  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  smsSentAt: { type: Date, default: null },
});

module.exports = mongoose.model('Report', reportSchema);
