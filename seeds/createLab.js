/**
 * Seed script — Demo Lab + admin user
 * Usage:  node seeds/createLab.js
 *
 * Fully idempotent: safe to run multiple times.
 * - Lab is upserted by name.
 * - User is upserted by email (password is only set on first insert).
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Lab = require('../models/Lab');
const User = require('../models/User');

const MONGO_URI =
  process.env.MONGO_URI || 'mongodb://localhost:27017/health-passport';

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB\n');

  // ── 1. Lab ──────────────────────────────────────────────────────────────
  let lab = await Lab.findOne({ name: 'Demo Lab' });

  if (lab) {
    console.log(`  – Lab already exists: "${lab.name}" (${lab._id})`);
  } else {
    lab = await Lab.create({
      name: 'Demo Lab',
      address: 'Colombo',
      phone: '+94 11 000 0000',
      reportFooter: 'Dr. Demo Silva — MBBS, MD (Pathology) | Reg No. SL-1234',
    });
    console.log(`  ✓ Lab created: "${lab.name}" (${lab._id})`);
  }

  // ── 2. Admin user ────────────────────────────────────────────────────────
  const ADMIN_EMAIL = 'admin@demolab.lk';
  const ADMIN_PASSWORD = 'admin123';

  const existing = await User.findOne({ email: ADMIN_EMAIL });

  if (existing) {
    console.log(`  – Admin already exists: ${ADMIN_EMAIL} (${existing._id})`);
  } else {
    // Assign plain-text password to passwordHash — the pre-save hook bcrypts it
    const admin = await User.create({
      labId: lab._id,
      name: 'Demo Admin',
      email: ADMIN_EMAIL,
      passwordHash: ADMIN_PASSWORD,
      role: 'admin',
    });
    console.log(`  ✓ Admin created: ${admin.email} (${admin._id})`);
  }

  console.log('\nSeed complete.');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
