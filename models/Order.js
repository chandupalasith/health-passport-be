const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  labId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lab',
    required: true,
    index: true,
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true,
  },
  // e.g. ["FBC", "Lipid Panel", "LFT"]
  testTypes: [{ type: String, trim: true }],
  status: {
    type: String,
    enum: ['pending', 'submitted', 'sent'],
    default: 'pending',
  },
  // Order-level metadata printed on the report header
  refDoctor:   { type: String, default: '' },
  refDoctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', default: null },
  sampleType: { type: String, default: '' },
  billNo:     { type: String, default: '' },
  orderedAt: { type: Date, default: Date.now },
  orderedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
});

module.exports = mongoose.model('Order', orderSchema);
