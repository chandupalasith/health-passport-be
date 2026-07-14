require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose     = require('mongoose');
const TestTemplate = require('../models/TestTemplate');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const result = await TestTemplate.deleteMany({});
  console.log(`Deleted ${result.deletedCount} templates.`);
  mongoose.disconnect();
}).catch(err => {
  console.error('Connection failed:', err.message);
  process.exit(1);
});
