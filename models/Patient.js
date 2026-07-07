const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
  labId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lab',
    required: true,
  },
  name: { type: String, required: true, trim: true },
  // Primary contact used for SMS delivery
  mobile: { type: String, required: true, trim: true },
  dob: { type: Date },
  // Captured when DOB is unknown (walk-in patients)
  ageAtRegistration: { type: Number, min: 0, max: 150 },
  gender: {
    type:    String,
    enum:    ['male', 'female'],
    default: null,
  },
  noPhone:   { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

// Fast lookup: find patient in a lab by phone number
patientSchema.index({ labId: 1, mobile: 1 });

module.exports = mongoose.model('Patient', patientSchema);
