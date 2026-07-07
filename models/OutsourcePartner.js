const mongoose = require('mongoose');
const outsourcePartnerSchema = new mongoose.Schema({
  labId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lab', required: true, index: true },
  name:  { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now },
});
module.exports = mongoose.model('OutsourcePartner', outsourcePartnerSchema);
