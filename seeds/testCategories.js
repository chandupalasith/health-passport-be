/**
 * Seed script — system-default TestCategories
 * Usage: node seeds/testCategories.js
 * Idempotent — safe to re-run.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const TestCategory = require('../models/TestCategory');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/health-passport';

const SYSTEM_CATEGORIES = [
  { name: 'Blood',         color: '#ef4444', sortOrder: 1 },
  { name: 'Urine',         color: '#f59e0b', sortOrder: 2 },
  { name: 'Hormone',       color: '#8b5cf6', sortOrder: 3 },
  { name: 'Biochemistry',  color: '#3b82f6', sortOrder: 4 },
  { name: 'Microbiology',  color: '#10b981', sortOrder: 5 },
  { name: 'Other',         color: '#6b7280', sortOrder: 9 },
];

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  let created = 0;
  let skipped = 0;

  for (const cat of SYSTEM_CATEGORIES) {
    const result = await TestCategory.updateOne(
      { labId: null, name: cat.name },
      { $setOnInsert: { labId: null, ...cat } },
      { upsert: true },
    );
    if (result.upsertedCount) {
      console.log(`  ✓ Created: ${cat.name}`);
      created++;
    } else {
      console.log(`  – Exists:  ${cat.name}`);
      skipped++;
    }
  }

  console.log(`\nDone — ${created} created, ${skipped} already existed.`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
