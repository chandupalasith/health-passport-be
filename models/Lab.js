const mongoose = require('mongoose');

const labSchema = new mongoose.Schema({
  name:    { type: String, required: true, trim: true },
  address: { type: String, trim: true },
  phone:   { type: String, trim: true },
  logoUrl: { type: String, trim: true },

  // SMS credit balance — topped up by super admin, deducted per SMS sent
  smsCredits: { type: Number, default: 0, min: 0 },

  // PDF layout — controlled exclusively by super admin
  pdfConfig: {
    reportFooter:  { type: String, trim: true },   // doctor name / credentials
    primaryColor:  { type: String, default: '#1d4ed8' },
    showWatermark: { type: Boolean, default: false },
    watermarkText: { type: String, default: 'CONFIDENTIAL' },
    pageSize:      { type: String, enum: ['A4', 'Letter'], default: 'A4' },
  },

  // When true, a thermal receipt is auto-printed on every new order
  canPrintReceipt: { type: Boolean, default: false },

  // Institution identifier — 4 uppercase letters set by superadmin, used in bill numbers
  labCode:     { type: String, trim: true, uppercase: true, maxlength: 4 },
  // Auto-incrementing bill counter — never reset, padded to 6 digits per order
  billCounter: { type: Number, default: 0 },

  // Print letterhead — shown when staff print / download PDF
  printLetterheadUrl:           { type: String, default: null },
  printLetterheadPaddingTop:    { type: Number, default: 120 },
  printLetterheadPaddingBottom: { type: Number, default: 60 },

  // SMS letterhead — shown when patient opens report via SMS link
  smsLetterheadUrl:           { type: String, default: null },
  smsLetterheadPaddingTop:    { type: Number, default: 120 },
  smsLetterheadPaddingBottom: { type: Number, default: 60 },

  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Lab', labSchema);
