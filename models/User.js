const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  labId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Lab',
    required: true,
    index:    true,
  },
  name:  { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: {
    type:     String,
    enum:     ['superadmin', 'admin', 'technician', 'manager'],
    required: true,
  },
  collectingCenterId: {
    type:    mongoose.Schema.Types.ObjectId,
    ref:     'CollectingCenter',
    default: null,
  },
  createdAt: { type: Date, default: Date.now },
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  next();
});

userSchema.methods.verifyPassword = function (candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

module.exports = mongoose.model('User', userSchema);
