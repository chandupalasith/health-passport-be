/**
 * Seed: Super Admin account
 * Usage:  node seeds/createSuperAdmin.js
 * Idempotent — safe to run multiple times.
 *
 * The super admin is not tied to a specific lab.
 * We create a placeholder "System" lab to satisfy the required labId foreign key.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Lab  = require('../models/Lab');
const User = require('../models/User');

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB\n');

  // 1. Ensure a "System" placeholder lab exists for the superadmin user
  let systemLab = await Lab.findOne({ name: '__system__' });
  if (!systemLab) {
    systemLab = await Lab.create({ name: '__system__', smsCredits: 0 });
    console.log(`  ✓ System lab created (${systemLab._id})`);
  } else {
    console.log(`  – System lab exists (${systemLab._id})`);
  }

  // 2. Create or confirm super admin
  const SUPER_EMAIL    = process.env.SUPERADMIN_EMAIL    || 'superadmin@healthpassport.lk';
  const SUPER_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'SuperAdmin@2025';

  const existing = await User.findOne({ email: SUPER_EMAIL });
  if (existing) {
    console.log(`  – Super admin already exists: ${SUPER_EMAIL} (${existing._id})`);
  } else {
    const sa = await User.create({
      labId:        systemLab._id,
      name:         'Super Admin',
      email:        SUPER_EMAIL,
      passwordHash: SUPER_PASSWORD,
      role:         'superadmin',
    });
    console.log(`  ✓ Super admin created: ${sa.email} (${sa._id})`);
  }

  console.log('\n  Email:   ', SUPER_EMAIL);
  console.log('  Password:', SUPER_PASSWORD);
  console.log('\nSeed complete.');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
