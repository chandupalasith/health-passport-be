const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
  labId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Lab', required: true, index: true },
  name:      { type: String, required: true, trim: true },
  phone:     { type: String, trim: true, default: '' },
  specialty:      { type: String, trim: true, default: '' },
  commissionRate: { type: Number, default: 0, min: 0, max: 100 },
}, { timestamps: true });

module.exports = mongoose.model('Doctor', doctorSchema);
