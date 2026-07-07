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
  testMeta: [{
    testType:       { type: String, trim: true },
    partnerId:      { type: mongoose.Schema.Types.ObjectId, ref: 'OutsourcePartner', default: null },
    partnerName:    { type: String, default: '' },
    price:          { type: Number, default: 0 },
    commissionRate: { type: Number, default: 0 },
    _id: false,
  }],
  status: {
    type: String,
    enum: ['pending', 'ready', 'delivered', 'submitted', 'sent'],
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
  collectingCenterId: {
    type:    mongoose.Schema.Types.ObjectId,
    ref:     'CollectingCenter',
    default: null,
  },
  paymentMethod: { type: String, enum: ['cash', 'card'], default: 'cash' },
  outsourceDeliveredTestTypes: [{ type: String, trim: true }],
  cancelledAt: { type: Date, default: null },
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
});

module.exports = mongoose.model('Order', orderSchema);
