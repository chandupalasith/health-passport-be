const mongoose = require('mongoose');

/**
 * Singleton document — only one ever exists (key = 'global').
 * Stores system-wide configuration managed exclusively by the super admin.
 */
const systemConfigSchema = new mongoose.Schema({
  key:                 { type: String, default: 'global', unique: true },
  // Dialog eSMS — the only SMS provider
  dialogApiKey:        { type: String },
  dialogSourceAddress: { type: String, default: 'HealthPass' },
  updatedAt:           { type: Date },
  updatedBy:           { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
});

module.exports = mongoose.model('SystemConfig', systemConfigSchema);
