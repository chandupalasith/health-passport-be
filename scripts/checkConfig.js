require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose     = require('mongoose');
const SystemConfig = require('../models/SystemConfig');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const cfg = await SystemConfig.findOne({ key: 'global' }).lean();
  console.log('hiddenSystemTemplates:', cfg?.hiddenSystemTemplates ?? []);
  mongoose.disconnect();
}).catch(err => { console.error(err.message); process.exit(1); });
