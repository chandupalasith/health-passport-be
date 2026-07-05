const mongoose = require('mongoose');

const collectingCenterSchema = new mongoose.Schema({
  labId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Lab', required: true, index: true },
  name:     { type: String, required: true, trim: true },
  address:  { type: String, default: '' },
  phone:    { type: String, default: '' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('CollectingCenter', collectingCenterSchema);
